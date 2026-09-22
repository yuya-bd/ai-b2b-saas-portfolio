import { describe, expect, it } from "vitest";
import {
  AiProviderError,
  describeError,
  describeErrorForJobRecord,
} from "./errors";

/**
 * No database and no network: these are pure functions, and what they are
 * asserted on is an absence. The audit that preceded this feature found a
 * session token reaching stdout through a log line that took an error object,
 * so the rule this file defends is that nothing on the analysis path ever
 * does that.
 *
 * A realistic hostile message stands in for what a provider SDK puts in
 * `error.message`: the request that failed, which on this path means the
 * prompt, the tenant's business data, and the credential in the headers.
 */
const HOSTILE_MESSAGE =
  // Kept short on purpose: long enough to stand in for a credential, too
  // short to match a secret scanner's pattern for a real one. A fixture that
  // trips gitleaks on every run trains people to ignore gitleaks.
  'Request failed: POST /v1/messages {"x-api-key":"sk-ant-NOT-A-KEY",' +
  '"system":"You summarise business information","company":"Some Tenant Co"}';

describe("describeError", () => {
  it("keeps only the class name of an ordinary error", () => {
    const description = describeError(new Error(HOSTILE_MESSAGE));

    expect(description).toBe("Error");
  });

  it("does not leak the credential, the prompt or the tenant data", () => {
    const description = describeError(new Error(HOSTILE_MESSAGE));

    expect(description).not.toContain("sk-ant");
    expect(description).not.toContain("x-api-key");
    expect(description).not.toContain("You summarise");
    expect(description).not.toContain("Some Tenant Co");
  });

  it("keeps an HTTP status, which is safe and useful", () => {
    const error = Object.assign(new Error(HOSTILE_MESSAGE), { status: 429 });

    expect(describeError(error)).toBe("Error status=429");
  });

  it("reports our own code and retry decision", () => {
    const error = new AiProviderError(
      "rate_limited",
      "Provider rate limit",
      true,
    );

    expect(describeError(error)).toBe(
      "AiProviderError(rate_limited, retryable=true)",
    );
  });

  it("survives a non-Error being thrown", () => {
    expect(describeError("just a string")).toBe("non-error thrown");
    expect(describeError(undefined)).toBe("non-error thrown");
  });
});

describe("describeErrorForJobRecord", () => {
  it("records our own message, which we wrote and control", () => {
    const error = new AiProviderError(
      "refused",
      "The model declined to answer this question",
      false,
    );

    expect(describeErrorForJobRecord(error)).toBe(
      "refused: The model declined to answer this question",
    );
  });

  it("does not record a provider's message", () => {
    const recorded = describeErrorForJobRecord(new Error(HOSTILE_MESSAGE));

    expect(recorded).toBe("Error");
    expect(recorded).not.toContain("sk-ant");
  });

  it("caps its length, because the column is read by people", () => {
    const error = new AiProviderError("unknown", "x".repeat(500), false);

    expect(describeErrorForJobRecord(error).length).toBeLessThanOrEqual(200);
  });
});
