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
 * every route test fail on the audit write. Running the callback here instead
 * keeps the audit path exercised — a test can assert that the audit row was
 * written, rather than the behaviour being invisible under test.
 *
 * What the callback returns is parked in `after-queue.ts` rather than dropped,
 * because the real `after` waits on it. `cleanupOrganization` drains the queue
 * before deleting anything; see that module for what goes wrong otherwise.
 */
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  const { trackAfterCallback } = await import("./after-queue");
  return {
    ...actual,
    after: (callback: () => unknown) => {
      trackAfterCallback(callback());
    },
  };
});
