/**
 * Domain errors.
 *
 * Services throw these; `handleApiError` turns them into responses. Each one
 * carries the status it should produce, so adding an error never means editing
 * the central handler.
 *
 * The message on these errors IS returned to the client, so keep it free of
 * internal detail — no query text, no ids the caller should not already know.
 */
export abstract class AppError extends Error {
  abstract readonly status: number;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The requested record does not exist, or is not visible to this caller. */
export class NotFoundError extends AppError {
  readonly status = 404;
}

/** A uniqueness rule would be violated. */
export class DuplicateError extends AppError {
  readonly status = 409;
}

/** The record cannot be changed while something else still references it. */
export class ConflictError extends AppError {
  readonly status = 409;
}

/** Not signed in, or the session is no longer valid. */
export class UnauthorizedError extends AppError {
  readonly status = 401;
}

/** Signed in, but not permitted to do this. */
export class ForbiddenError extends AppError {
  readonly status = 403;
}

/** The request is well-formed but violates a business rule. */
export class ValidationError extends AppError {
  readonly status = 400;
}

/** Signed in, but no organization is selected on the session. */
export class NoActiveOrganizationError extends AppError {
  readonly status = 400;
}

/**
 * The link was valid but has passed its expiry. 410 rather than 404 so the UI
 * can tell "never existed" apart from "too late" and offer to resend.
 */
export class ExpiredError extends AppError {
  readonly status = 410;
}
