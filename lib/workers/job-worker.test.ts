import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { AiProviderError } from "@/lib/ai";
import { NotFoundError } from "@/lib/api/errors";
import {
  JOB_PROCESSING_LEASE_MS,
  JOB_STATUS,
  JOB_TYPE,
} from "@/lib/constants/jobs";
import { jobRepository } from "@/lib/repositories/job.repository";
import {
  createTestContext,
  createTestJob,
  type TestContext,
} from "@/lib/test/factories";
import { cleanupOrganization } from "@/lib/test/helpers";
import { processJob, processJobMessage } from "@/lib/workers/job-worker";

/**
 * The worker's own responsibilities, with the analysis service stubbed.
 *
 * What is under test here is orchestration: claiming a job exactly once,
 * moving it through its states, deciding whether a failure is worth retrying,
 * and keeping the payload out of the logs. What the service does once called
 * is covered by `company_analysis.service.test.ts` — stubbing it here is what
 * makes a provider failure something a test can simply ask for.
 *
 * The `jobs` rows are real, because the claim is a conditional UPDATE and
 * that is precisely the thing a mock cannot check.
 */

const runAnalysis = vi.fn();

vi.mock("@/lib/services/company_analysis.service", () => ({
  companyAnalysisService: {
    runAnalysis: (...args: unknown[]) => runAnalysis(...args),
  },
}));

describe("processJob", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await cleanupOrganization(ctx.organizationId);
  });

  beforeEach(() => {
    runAnalysis.mockReset();
    runAnalysis.mockResolvedValue(undefined);
  });

  describe("the happy path", () => {
    it("claims the job, runs the handler and marks it COMPLETED", async () => {
      const job = await createTestJob({ organizationId: ctx.organizationId });

      await processJob(job.id);

      expect(runAnalysis).toHaveBeenCalledTimes(1);

      const stored = await jobRepository.findById(job.id);
      expect(stored?.status).toBe(JOB_STATUS.COMPLETED);
      expect(stored?.startedAt).toBeInstanceOf(Date);
      expect(stored?.finishedAt).toBeInstanceOf(Date);
    });

    it("hands the handler the row, not the queue message", async () => {
      const job = await createTestJob({
        organizationId: ctx.organizationId,
        payload: { companyId: "irrelevant", question: "Which argument?" },
      });

      await processJob(job.id);

      const [passed] = runAnalysis.mock.calls[0] ?? [];
      expect(passed).toMatchObject({
        id: job.id,
        organizationId: ctx.organizationId,
        jobType: JOB_TYPE.COMPANY_ANALYSIS,
      });
    });

    it("clears a previous failure's message on success", async () => {
      const job = await createTestJob({
        organizationId: ctx.organizationId,
        status: JOB_STATUS.FAILED,
      });
      await jobRepository.update(job.id, {
        errorMessage: "rate_limited: Provider rate limit",
        errorDetails: { permanent: false },
      });

      await processJob(job.id);

      const stored = await jobRepository.findById(job.id);
      expect(stored?.status).toBe(JOB_STATUS.COMPLETED);
      expect(stored?.errorMessage).toBeNull();
      expect(stored?.errorDetails).toBeNull();
    });
  });

  describe("idempotency", () => {
    /**
     * The guarantee the whole design turns on. An at-least-once queue will
     * deliver the same message twice; the second delivery must not reach the
     * provider, because that is what spends money.
     */
    it("does not run a COMPLETED job again", async () => {
      const job = await createTestJob({
        organizationId: ctx.organizationId,
        status: JOB_STATUS.COMPLETED,
      });

      await processJob(job.id);

      expect(runAnalysis).not.toHaveBeenCalled();
    });

    it("runs only once when the same job is delivered twice", async () => {
      const job = await createTestJob({ organizationId: ctx.organizationId });

      await processJob(job.id);
      await processJob(job.id);

      expect(runAnalysis).toHaveBeenCalledTimes(1);
    });

    it("leaves a live claim alone", async () => {
      const job = await createTestJob({
        organizationId: ctx.organizationId,
        status: JOB_STATUS.PROCESSING,
        startedAt: new Date(),
      });

      await processJob(job.id);

      expect(runAnalysis).not.toHaveBeenCalled();
      const stored = await jobRepository.findById(job.id);
      expect(stored?.status).toBe(JOB_STATUS.PROCESSING);
    });

    /**
     * The other side of that: a worker killed mid-job leaves PROCESSING
     * behind with nothing to clear it. Without the lease the job would be
     * skipped on every future delivery and never finish.
     */
    it("takes over a claim whose lease has expired", async () => {
      const job = await createTestJob({
        organizationId: ctx.organizationId,
        status: JOB_STATUS.PROCESSING,
        startedAt: new Date(Date.now() - JOB_PROCESSING_LEASE_MS - 1000),
      });

      await processJob(job.id);

      expect(runAnalysis).toHaveBeenCalledTimes(1);
      const stored = await jobRepository.findById(job.id);
      expect(stored?.status).toBe(JOB_STATUS.COMPLETED);
    });

    it("does nothing for a job id that does not exist", async () => {
      await processJob("00000000-0000-0000-0000-000000000000");

      expect(runAnalysis).not.toHaveBeenCalled();
    });
  });

  describe("failure handling", () => {
    it("re-throws a retryable failure, so the message returns to the queue", async () => {
      runAnalysis.mockRejectedValue(
        new AiProviderError("rate_limited", "Provider rate limit", true),
      );
      const job = await createTestJob({ organizationId: ctx.organizationId });

      await expect(processJob(job.id)).rejects.toThrow(AiProviderError);

      const stored = await jobRepository.findById(job.id);
      expect(stored?.status).toBe(JOB_STATUS.FAILED);
      expect(stored?.errorDetails).toEqual({ permanent: false });
    });

    /**
     * A permanent failure returns instead of throwing, which lets the caller
     * delete the message. Re-queueing something that fails identically every
     * time is not resilience — against a metered provider it is an unbounded
     * bill, which the queue module's own comments warn about.
     */
    it("swallows a permanent provider failure, so the message is deleted", async () => {
      runAnalysis.mockRejectedValue(
        new AiProviderError("refused", "The model declined", false),
      );
      const job = await createTestJob({ organizationId: ctx.organizationId });

      await expect(processJob(job.id)).resolves.toBeUndefined();

      const stored = await jobRepository.findById(job.id);
      expect(stored?.status).toBe(JOB_STATUS.FAILED);
      expect(stored?.errorDetails).toEqual({ permanent: true });
      expect(stored?.errorMessage).toBe("refused: The model declined");
    });

    it("treats a domain error as permanent — a missing company stays missing", async () => {
      runAnalysis.mockRejectedValue(new NotFoundError("Company not found"));
      const job = await createTestJob({ organizationId: ctx.organizationId });

      await expect(processJob(job.id)).resolves.toBeUndefined();

      const stored = await jobRepository.findById(job.id);
      expect(stored?.errorDetails).toEqual({ permanent: true });
    });

    /**
     * An unrecognised error is retryable. The common unknown is
     * infrastructure — a dropped connection — and permanently failing a job
     * over one of those is worse than one extra attempt.
     */
    it("treats an unknown error as retryable", async () => {
      runAnalysis.mockRejectedValue(new Error("connection terminated"));
      const job = await createTestJob({ organizationId: ctx.organizationId });

      await expect(processJob(job.id)).rejects.toThrow();

      const stored = await jobRepository.findById(job.id);
      expect(stored?.errorDetails).toEqual({ permanent: false });
    });

    it("fails a job whose type this build cannot handle, without retrying it", async () => {
      const job = await createTestJob({
        organizationId: ctx.organizationId,
        jobType: "SOMETHING_FROM_A_NEWER_DEPLOY",
      });

      await expect(processJob(job.id)).resolves.toBeUndefined();

      expect(runAnalysis).not.toHaveBeenCalled();
      const stored = await jobRepository.findById(job.id);
      expect(stored?.status).toBe(JOB_STATUS.FAILED);
      expect(stored?.errorMessage).toContain("Unknown job type");
    });
  });

  /**
   * The rule the preceding audit was written to enforce.
   *
   * The finding was a log line that took an error object and wrote a session
   * token to stdout, and another that logged an entire job payload. Both are
   * cheap to reintroduce and invisible in review, so they are asserted here
   * rather than left to discipline.
   */
  describe("what reaches the logs", () => {
    const SECRET_IN_PAYLOAD = "PAYLOAD-MARKER-should-never-be-logged";
    const SECRET_IN_ERROR =
      // Short enough not to match a secret scanner's pattern — see the same
      // note in lib/ai/errors.test.ts.
      'x-api-key: sk-ant-NOT-A-KEY prompt: "tenant business data"';

    let logged: string[];

    beforeEach(() => {
      logged = [];
      const capture = (...args: unknown[]) => {
        logged.push(args.map((arg) => String(arg)).join(" "));
      };
      vi.spyOn(console, "log").mockImplementation(capture);
      vi.spyOn(console, "warn").mockImplementation(capture);
      vi.spyOn(console, "error").mockImplementation(capture);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("never writes the job payload", async () => {
      const job = await createTestJob({
        organizationId: ctx.organizationId,
        payload: { companyId: "abc", question: SECRET_IN_PAYLOAD },
      });

      await processJob(job.id);

      expect(logged.join("\n")).not.toContain(SECRET_IN_PAYLOAD);
    });

    it("logs the job id and type, which is what makes a line useful", async () => {
      const job = await createTestJob({ organizationId: ctx.organizationId });

      await processJob(job.id);

      const output = logged.join("\n");
      expect(output).toContain(job.id);
      expect(output).toContain(JOB_TYPE.COMPANY_ANALYSIS);
    });

    it("never writes a provider error's message", async () => {
      runAnalysis.mockRejectedValue(new Error(SECRET_IN_ERROR));
      const job = await createTestJob({ organizationId: ctx.organizationId });

      await expect(processJob(job.id)).rejects.toThrow();

      const output = logged.join("\n");
      expect(output).not.toContain("sk-ant");
      expect(output).not.toContain("x-api-key");
      expect(output).not.toContain("tenant business data");
    });

    it("never writes the raw body of a message it cannot parse", async () => {
      await processJobMessage({
        Body: `{"broken": "${SECRET_IN_PAYLOAD}"`,
        MessageId: "msg-1",
      });

      const output = logged.join("\n");
      expect(output).not.toContain(SECRET_IN_PAYLOAD);
      expect(output).toContain("msg-1");
    });
  });

  describe("processJobMessage", () => {
    it("discards an unparseable body instead of re-queueing it", async () => {
      await expect(
        processJobMessage({ Body: "not json at all", MessageId: "msg-2" }),
      ).resolves.toBeUndefined();

      expect(runAnalysis).not.toHaveBeenCalled();
    });

    it("discards a body carrying no job id", async () => {
      await expect(
        processJobMessage({ Body: JSON.stringify({ jobType: "X" }) }),
      ).resolves.toBeUndefined();

      expect(runAnalysis).not.toHaveBeenCalled();
    });

    it("ignores a message with no body", async () => {
      await expect(processJobMessage({})).resolves.toBeUndefined();
    });

    /**
     * Only `jobId` is read from the message. A hand-written or replayed body
     * can name a job; the type and the payload come from the row.
     */
    it("runs the job named by the id, ignoring the rest of the body", async () => {
      const job = await createTestJob({ organizationId: ctx.organizationId });

      await processJobMessage({
        Body: JSON.stringify({
          jobId: job.id,
          jobType: "A_LIE",
          payload: { forged: true },
        }),
      });

      expect(runAnalysis).toHaveBeenCalledTimes(1);
      const [passed] = runAnalysis.mock.calls[0] ?? [];
      expect(passed).toMatchObject({ jobType: JOB_TYPE.COMPANY_ANALYSIS });
    });
  });
});
