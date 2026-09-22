/**
 * Queue worker entry point.
 *
 * Runs as its own process — a separate container in deployment — so that slow
 * background work never occupies a request handler.
 *
 * Locally, start it through worker-env.ts so dotenv runs first:
 *   pnpm worker:dev
 *
 * In deployment the environment is already set on the container, so this file
 * can be the entry point directly.
 *
 * ## What this file must not log
 *
 * Every line written here goes to container stdout, which is the least
 * access-controlled store in the system. So: no job payloads, no prompts, no
 * model output, no credentials, and no error objects. Ids, types, counts and
 * durations only. `describeError` exists to make that easy — pass an error to
 * it rather than to the logger.
 */

import { z } from "zod";
import {
  AiProviderError,
  describeError,
  describeErrorForJobRecord,
} from "@/lib/ai";
import { hasAnthropicApiKey } from "@/lib/ai/config";
import { AppError } from "@/lib/api/errors";
import { JOB_STATUS, JOB_TYPE } from "@/lib/constants/jobs";
import {
  deleteJobFromQueue,
  type JobType,
  receiveJobFromQueue,
} from "@/lib/queue/sqs-client";
import {
  type JobEntity,
  jobRepository,
} from "@/lib/repositories/job.repository";
import { companyAnalysisService } from "@/lib/services/company_analysis.service";

const IDLE_BACKOFF_MS = 5000;

/**
 * The only thing the worker trusts from a queue message.
 *
 * Everything else about the job — its type, its payload, the organization it
 * belongs to — is read from the `jobs` row this id points at. A replayed or
 * hand-written message can therefore name a job, and nothing more.
 */
const jobMessageEnvelopeSchema = z.object({
  jobId: z.string().uuid(),
});

type JobHandler = (job: JobEntity) => Promise<void>;

/**
 * Still the placeholder it always was: mark the status, do nothing else.
 * Replace one of these with real work the way COMPANY_ANALYSIS was.
 */
const unimplemented: JobHandler = async () => {};

const HANDLERS: Record<JobType, JobHandler> = {
  [JOB_TYPE.COMPANY_ANALYSIS]: async (job) => {
    await companyAnalysisService.runAnalysis(job);
  },
  [JOB_TYPE.DATA_IMPORT]: unimplemented,
  [JOB_TYPE.DATA_EXPORT]: unimplemented,
  [JOB_TYPE.REPORT_GENERATION]: unimplemented,
};

/**
 * `jobs.jobType` is a varchar, so the row may name a type this build does not
 * have — a job enqueued by a newer deployment during a rollout, for instance.
 * The lookup is typed to admit that rather than to assume it away.
 */
function handlerFor(jobType: string): JobHandler | undefined {
  return (HANDLERS as Record<string, JobHandler | undefined>)[jobType];
}

/**
 * Could running this job again ever succeed?
 *
 * The default is yes. The common unknown failure is infrastructure — a
 * Postgres blip, a dropped connection — and permanently failing a job over
 * one of those is worse than one extra attempt.
 *
 * What is named here is the set where another attempt is definitely wasted,
 * and on this path wasted means billed: a provider that rejected the
 * credentials or the request, a payload that is not valid, a company that no
 * longer exists. Those are recorded and dropped rather than retried.
 */
function isPermanentFailure(error: unknown): boolean {
  if (error instanceof AiProviderError) return !error.retryable;
  // Domain errors state a fact about the data, and facts do not change on
  // redelivery: a missing company is still missing a minute later.
  if (error instanceof AppError) return true;
  if (error instanceof z.ZodError) return true;
  return false;
}

/**
 * Run one job.
 *
 * Takes an id, not a payload. That is the idempotency design in one line:
 * the row is the source of truth, and the message is a pointer to it.
 *
 * The sequence is claim, work, record:
 *
 * 1. Claim. `claimForProcessing` is a conditional UPDATE that only moves a
 *    job out of PENDING, FAILED or an expired PROCESSING lease. A job that
 *    is already COMPLETED matches nothing and this returns early — so a
 *    duplicate delivery for finished work makes no provider call and writes
 *    no second row. Two workers racing the same message get one winner.
 *
 * 2. Work. The handler is chosen by the row's own `jobType`.
 *
 * 3. Record. COMPLETED on success. On failure, FAILED plus a sanitised
 *    message, and then the retry decision: re-throwing leaves the queue
 *    message in place for redelivery, returning normally lets the caller
 *    delete it. Permanent failures return.
 */
export async function processJob(jobId: string): Promise<void> {
  const job = await jobRepository.claimForProcessing(jobId);

  if (!job) {
    /**
     * Completed already, or another worker holds a live claim. Both are
     * ordinary for an at-least-once queue, so this is not a warning.
     */
    console.log(`[Worker] Job ${jobId} not claimable, skipping`);
    return;
  }

  const handler = handlerFor(job.jobType);
  const startedAt = Date.now();

  if (!handler) {
    console.warn(`[Worker] Job ${job.id} has unknown type: ${job.jobType}`);
    await jobRepository.update(job.id, {
      status: JOB_STATUS.FAILED,
      finishedAt: new Date(),
      errorMessage: `Unknown job type: ${job.jobType}`,
    });
    return;
  }

  console.log(`[Worker] Job ${job.id} started type=${job.jobType}`);

  try {
    await handler(job);

    await jobRepository.update(job.id, {
      status: JOB_STATUS.COMPLETED,
      finishedAt: new Date(),
      // Cleared, so a row that failed and later succeeded does not read as
      // though it still has a problem.
      errorMessage: null,
      errorDetails: null,
    });

    console.log(
      `[Worker] Job ${job.id} completed type=${job.jobType} ms=${Date.now() - startedAt}`,
    );
  } catch (error) {
    const permanent = isPermanentFailure(error);

    await jobRepository.update(job.id, {
      status: JOB_STATUS.FAILED,
      finishedAt: new Date(),
      errorMessage: describeErrorForJobRecord(error),
      // No stack. Nothing here is a free-text sink for provider messages.
      errorDetails: { permanent },
    });

    console.error(
      `[Worker] Job ${job.id} failed type=${job.jobType} permanent=${permanent} error=${describeError(error)}`,
    );

    if (!permanent) {
      throw error;
    }
  }
}

async function processJobMessage(message: {
  Body?: string;
  MessageId?: string;
  ReceiptHandle?: string;
}): Promise<void> {
  if (!message.Body) {
    console.warn("[Worker] Received message without body");
    return;
  }

  let jobId: string;
  try {
    jobId = jobMessageEnvelopeSchema.parse(JSON.parse(message.Body)).jobId;
  } catch {
    /**
     * Returning rather than throwing deletes the message. A body that is not
     * valid JSON, or carries no job id, has nothing to point at and will not
     * become valid on redelivery — re-queueing it only loops.
     *
     * The body is not logged. It is the one string here guaranteed to be
     * attacker-influenced, and it is exactly the sort of thing that ends up
     * pasted into a ticket.
     */
    console.warn(
      `[Worker] Discarding unparseable message ${message.MessageId ?? "(no id)"}`,
    );
    return;
  }

  await processJob(jobId);
}

async function runWorker(): Promise<void> {
  console.log("[Worker] Starting worker process...");
  console.log(`[Worker] Environment: ${process.env.NODE_ENV}`);
  console.log(
    `[Worker] Database: ${process.env.DATABASE_URL ? "configured" : "NOT SET"}`,
  );
  console.log(`[Worker] Queue: ${process.env.SQS_ENDPOINT || "AWS SQS"}`);
  // A boolean, never the key. See `hasAnthropicApiKey`.
  console.log(
    `[Worker] AI provider: ${process.env.AI_PROVIDER ?? "(unset)"}, credentials: ${
      hasAnthropicApiKey() ? "configured" : "NOT SET"
    }`,
  );

  let isRunning = false;

  /**
   * Stop after the current message rather than mid-flight. A container gets a
   * grace period after SIGTERM; finishing the message in hand means it is not
   * redelivered and processed twice.
   */
  const stop = (signal: string) => {
    console.log(`[Worker] Received ${signal}, shutting down gracefully...`);
    isRunning = false;
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));

  isRunning = true;

  while (isRunning) {
    try {
      const messages = await receiveJobFromQueue(1);

      if (messages.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, IDLE_BACKOFF_MS));
        continue;
      }

      for (const message of messages) {
        try {
          await processJobMessage(message);

          // Deleted only after the work succeeded. Until this runs, a crash
          // leaves the message on the queue to be retried.
          if (message.ReceiptHandle) {
            await deleteJobFromQueue(message.ReceiptHandle);
          }
        } catch (error) {
          console.error(
            `[Worker] Failed to process message: ${describeError(error)}`,
          );
          /**
           * Left on the queue deliberately: once the visibility timeout
           * lapses it becomes available again.
           *
           * Only retryable failures reach here — `processJob` returns rather
           * than throws for the permanent ones, so the message is deleted and
           * a job that can never succeed does not spend money in a loop.
           *
           * This still needs a dead-letter queue with a maxReceiveCount.
           * Without one, a failure that looks retryable but never clears —
           * a provider outage that outlasts the retention period — is retried
           * until it does. Configure the DLQ before pointing this at anything
           * real.
           */
        }
      }
    } catch (error) {
      console.error(`[Worker] Error in worker loop: ${describeError(error)}`);
      await new Promise((resolve) => setTimeout(resolve, IDLE_BACKOFF_MS));
    }
  }

  console.log("[Worker] Worker process stopped");
}

/**
 * Self-starting on import, because both entry points depend on it:
 * Dockerfile.worker runs this file directly, and worker-env.ts starts the
 * local worker by importing it after loading dotenv.
 *
 * Skipped under test. Without the guard, a test file that imports `processJob`
 * would also start a polling loop, which then outlives the assertions and
 * keeps the process open.
 */
if (process.env.NODE_ENV !== "test") {
  runWorker().catch((error) => {
    console.error(`[Worker] Fatal error: ${describeError(error)}`);
    process.exit(1);
  });
}

export { processJobMessage, runWorker };
