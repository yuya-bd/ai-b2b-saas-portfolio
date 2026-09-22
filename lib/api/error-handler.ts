import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "./errors";

/**
 * The single place an API route turns a thrown error into a response.
 *
 * The rule that matters: anything not recognised returns a bare
 * "Internal Server Error". Echoing an unknown error's message would leak
 * stack traces, SQL and connection strings to the client.
 */
export function handleApiError(error: unknown): NextResponse {
  // Domain errors carry their own status.
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }

  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: "Validation Error", details: error.issues },
      { status: 400 },
    );
  }

  // Malformed JSON body.
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // The next three are caller mistakes that surface as database errors, so
  // they are 4xx rather than 5xx.
  if (isInvalidInputError(error)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  if (isForeignKeyViolationError(error)) {
    return NextResponse.json({ error: "Invalid reference" }, { status: 400 });
  }

  if (error instanceof Error && isDuplicateKeyError(error)) {
    return NextResponse.json({ error: "Duplicate entry" }, { status: 409 });
  }

  /**
   * Fallback for error classes that do not extend AppError — a third-party
   * library's, or one written before this convention. Classifying by name
   * keeps them working without importing every such class here.
   */
  if (error instanceof Error) {
    const byName = statusFromErrorName(error.name);
    if (byName) {
      return NextResponse.json({ error: error.message }, { status: byName });
    }
  }

  console.error("Unhandled API error:", error);
  return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
}

function statusFromErrorName(name: string): number | null {
  if (name.endsWith("NotFoundError")) return 404;
  if (name.endsWith("DuplicateError") || name.startsWith("Duplicate"))
    return 409;
  if (name.endsWith("UnauthorizedError")) return 401;
  if (name.endsWith("ForbiddenError")) return 403;
  if (name.endsWith("ExpiredError")) return 410;
  return null;
}

/**
 * Postgres reports these on the `cause` of the error Drizzle throws, not on
 * the error itself, which is why each check unwraps one level.
 */
function causeMessage(error: unknown): string {
  if (!(error instanceof Error)) return "";
  return "cause" in error && error.cause instanceof Error
    ? error.cause.message
    : "";
}

/** Referencing a row that does not exist, e.g. an unknown organizationId. */
function isForeignKeyViolationError(error: unknown): boolean {
  const msg = causeMessage(error);
  return (
    msg.includes("violates foreign key constraint") ||
    msg.includes("foreign_key_violation")
  );
}

/** A value of the wrong shape for its column, e.g. a non-UUID in a uuid column. */
function isInvalidInputError(error: unknown): boolean {
  const msg = causeMessage(error);
  return (
    msg.includes("invalid input syntax") ||
    msg.includes("invalid_text_representation")
  );
}

function isDuplicateKeyError(error: Error): boolean {
  const msg = error.message || "";
  const cause = causeMessage(error);
  return (
    msg.includes("duplicate key value") ||
    msg.includes("unique constraint") ||
    cause.includes("duplicate key value") ||
    cause.includes("unique constraint")
  );
}
