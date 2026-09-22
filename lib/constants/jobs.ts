/**
 * Job lifecycle.
 *
 * `jobs.status` held these as a comment on the column; naming them here means
 * the worker's state transitions and the repository's `WHERE status IN (...)`
 * cannot disagree about the spelling.
 *
 * ## The states
 * - `PENDING`     enqueued, not yet picked up
 * - `PROCESSING`  claimed by a worker. Also a lease — see below
 * - `COMPLETED`   terminal. Never re-run; this is what makes replay safe
 * - `FAILED`      not terminal. Re-runnable, by redelivery or by hand
 */
/**
 * Every kind of work the queue carries.
 *
 * `lib/queue/sqs-client.ts` derives its `JobType` from this, so adding a kind
 * here is the single edit that makes it sendable, and the worker's exhaustive
 * switch stops compiling until it is handled.
 */
export const JOB_TYPE = {
  DATA_IMPORT: "DATA_IMPORT",
  DATA_EXPORT: "DATA_EXPORT",
  REPORT_GENERATION: "REPORT_GENERATION",
  COMPANY_ANALYSIS: "COMPANY_ANALYSIS",
} as const;

export const JOB_STATUS = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;

export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];

/** A claim older than this is treated as abandoned and may be taken over. */
export const JOB_STATUSES_CLAIMABLE = [
  JOB_STATUS.PENDING,
  JOB_STATUS.FAILED,
] as const;

/**
 * How long a `PROCESSING` claim is honoured before another worker may take it.
 *
 * A worker killed mid-job leaves its row in `PROCESSING` with nothing to
 * clear it, so without a lease that job is stuck forever while its queue
 * message keeps being redelivered and keeps being skipped.
 *
 * Set to the queue's `VisibilityTimeout` (300s in `lib/queue/sqs-client.ts`).
 * That is the point at which SQS itself decides the previous attempt is gone,
 * so agreeing with it means the two never take opposite views of the same
 * message. Raising one without the other reintroduces the gap.
 */
export const JOB_PROCESSING_LEASE_MS = 300_000;
