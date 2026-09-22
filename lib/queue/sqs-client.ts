import {
  DeleteMessageCommand,
  type Message,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import type { JOB_TYPE } from "@/lib/constants/jobs";

/**
 * Queue access with three interchangeable backends:
 *
 *   USE_MOCK_SQS=true   in-process array. Tests use this, so a test run needs
 *                       no container and cannot leak messages between files.
 *   SQS_ENDPOINT set    ElasticMQ from docker-compose. Real SQS semantics —
 *                       visibility timeouts, receipt handles, long polling —
 *                       without an AWS account.
 *   neither             real AWS SQS.
 *
 * Everything above this module is written against one interface, so moving
 * between the three is a matter of environment variables only.
 */

const DEFAULT_QUEUE_NAME = "job-queue";
/** ElasticMQ has no notion of an account, and requires a placeholder here. */
const LOCAL_ACCOUNT_ID = "000000000000";

class MockSQSClient {
  private queue: Array<{ id: string; body: string }> = [];
  private idCounter = 0;

  async sendMessage(queueUrl: string, messageBody: string): Promise<string> {
    const messageId = `mock-${++this.idCounter}`;
    this.queue.push({ id: messageId, body: messageBody });
    console.log(`[Mock SQS] Sent message ${messageId} to ${queueUrl}`);
    return messageId;
  }

  async receiveMessage(queueUrl: string, maxMessages = 1): Promise<Message[]> {
    const messages = this.queue.splice(0, maxMessages).map((msg) => ({
      MessageId: msg.id,
      Body: msg.body,
      ReceiptHandle: msg.id,
    }));
    console.log(
      `[Mock SQS] Received ${messages.length} messages from ${queueUrl}`,
    );
    return messages;
  }

  async deleteMessage(queueUrl: string, receiptHandle: string): Promise<void> {
    console.log(`[Mock SQS] Deleted message ${receiptHandle} from ${queueUrl}`);
  }
}

/**
 * Built on first use, not at import time. The worker loads its environment
 * with dotenv after modules are imported, so constructing the client eagerly
 * would read the variables before they exist.
 */
let _sqsClient: SQSClient | MockSQSClient | null = null;

function getSQSClient(): SQSClient | MockSQSClient {
  if (_sqsClient) return _sqsClient;

  const useMockSQS = process.env.USE_MOCK_SQS === "true";
  const sqsEndpoint = process.env.SQS_ENDPOINT;

  if (useMockSQS) {
    console.log("[SQS] Using in-process mock");
    _sqsClient = new MockSQSClient();
    return _sqsClient;
  }

  console.log(`[SQS] Connecting to ${sqsEndpoint || "AWS SQS"}`);
  _sqsClient = new SQSClient({
    region: process.env.AWS_REGION || "ap-northeast-1",
    // ElasticMQ validates the signature's shape but not its contents, so any
    // non-empty credentials work.
    ...(sqsEndpoint && {
      endpoint: sqsEndpoint,
      credentials: { accessKeyId: "local", secretAccessKey: "local" },
    }),
    // Against real SQS, fall through to the default credential chain unless
    // keys are supplied explicitly.
    ...(!sqsEndpoint &&
      process.env.AWS_ACCESS_KEY_ID && {
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
        },
      }),
  });

  return _sqsClient;
}

/** Add job types to `JOB_TYPE` in lib/constants/jobs.ts, not here. */
export type JobType = (typeof JOB_TYPE)[keyof typeof JOB_TYPE];

/**
 * What goes on the wire.
 *
 * Only `jobId` is load-bearing. The worker re-reads the job type, the payload
 * and the owning organization from the `jobs` row that id points at, because
 * a queue is not a trusted source: a message can be replayed from a
 * dead-letter queue, hand-written during an incident, or simply be older than
 * the code now reading it. `jobType` and `payload` travel along for
 * observability — reading a raw message should not require a database — and
 * nothing authorises off them.
 */
export interface JobMessage<T = unknown> {
  jobType: JobType;
  /** Id of the row in `jobs`, so the worker can record the outcome. */
  jobId: string;
  payload: T;
  timestamp: string;
}

function getQueueUrl(): string {
  if (process.env.SQS_QUEUE_URL) return process.env.SQS_QUEUE_URL;

  const endpoint = process.env.SQS_ENDPOINT;
  if (endpoint) return `${endpoint}/${LOCAL_ACCOUNT_ID}/${DEFAULT_QUEUE_NAME}`;

  const region = process.env.AWS_REGION || "ap-northeast-1";
  return `https://sqs.${region}.amazonaws.com/${LOCAL_ACCOUNT_ID}/${DEFAULT_QUEUE_NAME}`;
}

export async function sendJobToQueue<T>(
  jobMessage: JobMessage<T>,
): Promise<string> {
  const client = getSQSClient();
  const queueUrl = getQueueUrl();
  const messageBody = JSON.stringify(jobMessage);

  if (client instanceof MockSQSClient) {
    return await client.sendMessage(queueUrl, messageBody);
  }

  const response = await client.send(
    new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: messageBody }),
  );
  return response.MessageId || "";
}

/** Worker side. Long polls, so an idle worker costs one request per 20s. */
export async function receiveJobFromQueue(maxMessages = 1): Promise<Message[]> {
  const client = getSQSClient();
  const queueUrl = getQueueUrl();

  if (client instanceof MockSQSClient) {
    return await client.receiveMessage(queueUrl, maxMessages);
  }

  const response = await client.send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: maxMessages,
      WaitTimeSeconds: 20,
      // Must exceed the worst-case processing time, or a slow job becomes
      // visible again and runs twice.
      VisibilityTimeout: 300,
    }),
  );
  return response.Messages || [];
}

/**
 * Removes the message for good. Call this only once the work is durably
 * recorded — until it is called, a crash lets the message reappear and retry.
 */
export async function deleteJobFromQueue(receiptHandle: string): Promise<void> {
  const client = getSQSClient();
  const queueUrl = getQueueUrl();

  if (client instanceof MockSQSClient) {
    await client.deleteMessage(queueUrl, receiptHandle);
    return;
  }

  await client.send(
    new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    }),
  );
}

export { getSQSClient };
