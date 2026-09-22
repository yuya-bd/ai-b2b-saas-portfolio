/**
 * The promises that `after()` callbacks hand back, held until something waits
 * on them.
 *
 * Next awaits these itself: the request stays alive until the callback settles.
 * Vitest has no request to hang them off, so the `after` mock in `setup.ts`
 * parks them here and `cleanupOrganization` drains them before it deletes
 * anything.
 *
 * Without that drain an audit insert can land between the delete of
 * `audit_logs` and the delete of `organization`, and the foreign key rejects
 * the second one. It is a race, so it fails perhaps one run in ten — on CI,
 * where the database is slower, never on a laptop.
 */
const pending: Promise<unknown>[] = [];

/** Called by the `after` mock with whatever the callback returned. */
export function trackAfterCallback(result: unknown): void {
  if (result instanceof Promise) {
    pending.push(result);
  }
}

/**
 * Wait for every tracked callback, including any that one of them scheduled.
 *
 * Settled rather than resolved: a failed audit write is logged and dropped in
 * production, and a test should not fail here for a reason production accepts.
 */
export async function flushAfterCallbacks(): Promise<void> {
  while (pending.length > 0) {
    await Promise.allSettled(pending.splice(0));
  }
}

/**
 * How many callbacks are waiting.
 *
 * Exists so a test can assert that a promise reached `after` at all. A
 * callback that starts its work and returns nothing leaves this at zero, which
 * is precisely the defect this queue was added to catch.
 */
export function pendingAfterCallbackCount(): number {
  return pending.length;
}
