import path from "node:path";
import { config } from "dotenv";
import { vi } from "vitest";

config({ path: path.resolve(process.cwd(), ".env.test") });

// Tests never talk to a real queue.
process.env.USE_MOCK_SQS ??= "true";

/**
 * Not set here, because the type declares it read-only — but relied upon.
 * Vitest sets NODE_ENV to "test", and `lib/workers/job-worker.ts` checks it
 * before starting its polling loop on import. Without that, a test file
 * importing `processJob` would also start a loop that outlives the
 * assertions and holds the process open.
 */

// Tests never call a real model. Failure cases inject their own stub.
process.env.AI_PROVIDER ??= "mock";

/**
 * `after()` requires a request scope and throws outside one, which would make
 * every route test fail on the audit write. Running the callback synchronously
 * instead keeps the audit path exercised — a test can assert that the audit
 * row was written, rather than the behaviour being invisible under test.
 */
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (callback: () => void) => callback(),
  };
});
