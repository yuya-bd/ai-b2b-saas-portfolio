/**
 * Failures from an analysis provider, and the one rule for logging them.
 */

export type AiErrorCode =
  | "not_configured"
  | "rate_limited"
  | "upstream_unavailable"
  | "authentication_failed"
  | "invalid_request"
  | "refused"
  | "invalid_output"
  | "unknown";

/**
 * Deliberately not an `AppError`.
 *
 * `AppError` subclasses exist so `handleApiError` can turn them into a
 * response, and their messages reach the client. These never travel to an
 * HTTP client at all — they are read by the worker, which has one question to
 * answer: could running this job again ever succeed?
 *
 * `retryable` is the expensive half of that answer. A retryable failure goes
 * back on the queue. A permanent one is recorded and dropped, because a
 * message that can never succeed against a metered API is not a stuck job —
 * it is an unbounded bill.
 */
export class AiProviderError extends Error {
  readonly code: AiErrorCode;
  readonly retryable: boolean;

  constructor(code: AiErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = "AiProviderError";
    this.code = code;
    this.retryable = retryable;
  }
}

/** Truncated hard, because this string is written to stdout. */
const MAX_DESCRIPTION_LENGTH = 200;

/**
 * A log-safe description of a failure.
 *
 * Provider SDKs put request context into `error.message` — the prompt that
 * was sent, sometimes request headers. `console.error("failed:", error)` on
 * such an object writes all of it to stdout, and on this path the prompt
 * contains tenant business data while the headers contain the API key.
 *
 * So nothing here touches the object. Only three things are safe to write:
 * the class name, our own error code, and an HTTP status when the provider
 * supplied one. Everything else is discarded.
 *
 * Use this instead of passing an error to a logger. Never log the error
 * itself on this path.
 */
export function describeError(error: unknown): string {
  if (error instanceof AiProviderError) {
    return `AiProviderError(${error.code}, retryable=${error.retryable})`;
  }

  if (error instanceof Error) {
    // `status` is present on Anthropic SDK errors and on most HTTP clients.
    const status = (error as { status?: unknown }).status;
    const statusPart = typeof status === "number" ? ` status=${status}` : "";
    return `${error.name}${statusPart}`;
  }

  return "non-error thrown";
}

/**
 * The message recorded on the `jobs` row.
 *
 * `jobs.errorMessage` is read by operators and may be surfaced in an admin
 * view, so it gets the same treatment as a log line rather than the raw
 * provider message.
 */
export function describeErrorForJobRecord(error: unknown): string {
  if (error instanceof AiProviderError) {
    return `${error.code}: ${error.message}`.slice(0, MAX_DESCRIPTION_LENGTH);
  }
  return describeError(error).slice(0, MAX_DESCRIPTION_LENGTH);
}
