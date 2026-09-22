import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/drizzle";
import { auditLogs } from "@/lib/drizzle/schema";
import { scheduleAuditLog } from "@/lib/helpers/audit.helper";
import type { SessionContext } from "@/lib/helpers/session.helper";
import {
  flushAfterCallbacks,
  pendingAfterCallbackCount,
} from "@/lib/test/after-queue";
import { createTestContext, type TestContext } from "@/lib/test/factories";
import { cleanupOrganization } from "@/lib/test/helpers";

/**
 * Nothing asserted the audit row before this file existed, which is how the
 * write came to be started and then forgotten: `after` was handed a callback
 * that kicked off an insert and returned nothing, so the runtime had no
 * promise to wait on. It usually landed anyway. That is the worst kind of
 * defect to leave in an audit trail — one that only loses rows under load.
 *
 * `pendingAfterCallbackCount` is asserted for exactly that reason. Checking
 * only that the row eventually appears would pass against the old code most of
 * the time; checking that a promise reached `after` fails against it every
 * time.
 */

const AUDITED_PATH = "/api/v1/tags";
const CALLER_IP = "203.0.113.7";

let context: TestContext;
let session: SessionContext;

function request(path: string, method: string) {
  return new NextRequest(`https://example.com${path}`, {
    method,
    headers: { "x-forwarded-for": CALLER_IP },
  });
}

function auditRows() {
  return db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.organizationId, context.organizationId));
}

beforeAll(async () => {
  context = await createTestContext();
  session = {
    userId: context.userId,
    organizationId: context.organizationId,
    sessionId: "session-for-audit-test",
  };
});

// Start each test with an empty queue and no rows, so it counts only its own.
beforeEach(async () => {
  await flushAfterCallbacks();
  await db
    .delete(auditLogs)
    .where(eq(auditLogs.organizationId, context.organizationId));
});

afterAll(async () => {
  await cleanupOrganization(context.organizationId);
});

describe("an audited route", () => {
  it("hands the write to after() as a promise, not as fire-and-forget", () => {
    scheduleAuditLog(request(AUDITED_PATH, "POST"), session);

    expect(pendingAfterCallbackCount()).toBe(1);
  });

  it("writes one row, with the action the route table names", async () => {
    scheduleAuditLog(request(AUDITED_PATH, "POST"), session);
    await flushAfterCallbacks();

    const rows = await auditRows();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "TAG_CREATE",
      entityType: "tag",
      userId: context.userId,
      organizationId: context.organizationId,
    });
  });

  it("records the caller's address", async () => {
    scheduleAuditLog(request(AUDITED_PATH, "POST"), session);
    await flushAfterCallbacks();

    const rows = await auditRows();

    expect(rows[0]?.ipAddress).toBe(CALLER_IP);
  });
});

describe("a request the route table does not cover", () => {
  it("writes nothing for an unlisted path", async () => {
    scheduleAuditLog(request("/api/v1/companies/search", "POST"), session);
    await flushAfterCallbacks();

    await expect(auditRows()).resolves.toHaveLength(0);
  });

  it("writes nothing for a method the path does not audit", async () => {
    scheduleAuditLog(request(AUDITED_PATH, "GET"), session);
    await flushAfterCallbacks();

    await expect(auditRows()).resolves.toHaveLength(0);
  });

  it("schedules no callback at all, rather than one that does nothing", () => {
    scheduleAuditLog(request(AUDITED_PATH, "GET"), session);

    expect(pendingAfterCallbackCount()).toBe(0);
  });
});
