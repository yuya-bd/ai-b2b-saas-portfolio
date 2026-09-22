import { nanoid } from "nanoid";
import { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/constants/app";
import { JOB_STATUS, JOB_TYPE, type JobStatus } from "@/lib/constants/jobs";
import { ROLES, type Role } from "@/lib/constants/roles";
import { db } from "@/lib/drizzle";
import {
  companies,
  companyAnalyses,
  department,
  jobs,
  member,
  organization,
  session,
  tags,
  tenant,
  user,
} from "@/lib/drizzle/schema";

/**
 * Test data factories.
 *
 * Every factory generates its own ids, so nothing is shared between test
 * files. That is what lets `fileParallelism` stay on: two files can run the
 * same test at the same moment and never collide.
 *
 * The usual shape of a test file:
 *
 *   const ctx = await createTestContext();
 *   afterAll(() => cleanupOrganization(ctx.organizationId));
 */

export interface TestContext {
  tenantId: string;
  organizationId: string;
  departmentId: string;
  userId: string;
  memberId: string;
  sessionToken: string;
  role: Role;
}

/** A tenant plus one organization inside it. */
export async function createTestOrganization(overrides?: {
  name?: string;
}): Promise<{ tenantId: string; organizationId: string }> {
  const suffix = nanoid(10);
  const tenantId = `tenant-${suffix}`;
  const organizationId = `org-${suffix}`;

  await db.insert(tenant).values({
    id: tenantId,
    name: `Test Tenant ${suffix}`,
    slug: `test-tenant-${suffix}`,
  });

  await db.insert(organization).values({
    id: organizationId,
    name: overrides?.name ?? `Test Organization ${suffix}`,
    slug: `test-org-${suffix}`,
    tenantId,
  });

  return { tenantId, organizationId };
}

export async function createTestDepartment(
  organizationId: string,
  overrides?: { name?: string },
): Promise<string> {
  const id = `dept-${nanoid(10)}`;
  await db.insert(department).values({
    id,
    organizationId,
    name: overrides?.name ?? "Test Department",
  });
  return id;
}

export async function createTestUser(overrides?: {
  name?: string;
  email?: string;
}): Promise<string> {
  const suffix = nanoid(10);
  const id = `user-${suffix}`;
  await db.insert(user).values({
    id,
    name: overrides?.name ?? `Test User ${suffix}`,
    // @example.com is reserved by RFC 2606, so a stray send can never reach a
    // real inbox.
    email: overrides?.email ?? `test-${suffix}@example.com`,
    emailVerified: true,
  });
  return id;
}

export async function createTestMember(params: {
  organizationId: string;
  userId: string;
  role?: Role;
  departmentId?: string | null;
}): Promise<string> {
  const id = `member-${nanoid(10)}`;
  await db.insert(member).values({
    id,
    organizationId: params.organizationId,
    userId: params.userId,
    role: params.role ?? ROLES.ADMIN,
    departmentId: params.departmentId ?? null,
  });
  return id;
}

export async function createTestSession(params: {
  userId: string;
  organizationId: string;
}): Promise<string> {
  const token = `session-token-${nanoid(20)}`;
  await db.insert(session).values({
    id: `session-${nanoid(10)}`,
    userId: params.userId,
    token,
    // Far enough out that a slow suite cannot expire it mid-run.
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    activeOrganizationId: params.organizationId,
  });
  return token;
}

/**
 * One call that produces a signed-in user in a fresh organization — the
 * starting point for most tests.
 */
export async function createTestContext(overrides?: {
  role?: Role;
}): Promise<TestContext> {
  const { tenantId, organizationId } = await createTestOrganization();
  const departmentId = await createTestDepartment(organizationId);
  const userId = await createTestUser();
  const role = overrides?.role ?? ROLES.ADMIN;
  const memberId = await createTestMember({
    organizationId,
    userId,
    role,
    departmentId,
  });
  const sessionToken = await createTestSession({ userId, organizationId });

  return {
    tenantId,
    organizationId,
    departmentId,
    userId,
    memberId,
    sessionToken,
    role,
  };
}

export async function createTestCompany(params: {
  organizationId: string;
  departmentId?: string | null;
  name?: string;
  registrationNumber?: string | null;
}): Promise<string> {
  const [created] = await db
    .insert(companies)
    .values({
      organizationId: params.organizationId,
      departmentId: params.departmentId ?? null,
      name: params.name ?? `Test Company ${nanoid(6)}`,
      registrationNumber:
        params.registrationNumber ?? generateRegistrationNumber(),
    })
    .returning();

  if (!created) throw new Error("Failed to create test company");
  return created.id;
}

export async function createTestTag(params: {
  organizationId: string;
  type?: string;
  name?: string;
}): Promise<string> {
  const [created] = await db
    .insert(tags)
    .values({
      organizationId: params.organizationId,
      type: params.type ?? "category",
      name: params.name ?? `Test Tag ${nanoid(6)}`,
    })
    .returning();

  if (!created) throw new Error("Failed to create test tag");
  return created.id;
}

/**
 * A `jobs` row.
 *
 * Returns the row, not its id, unlike the factories above. Both the worker
 * and the analysis service take an already-claimed job entity, so a test
 * almost always needs more than the id — and fetching it back would just be
 * a second round trip.
 *
 * `startedAt` is settable so a test can age a PROCESSING claim past its lease
 * and check that it becomes claimable again.
 */
export async function createTestJob(params: {
  organizationId: string;
  jobType?: string;
  status?: JobStatus;
  subjectId?: string | null;
  payload?: Record<string, unknown>;
  startedAt?: Date | null;
}): Promise<typeof jobs.$inferSelect> {
  const [created] = await db
    .insert(jobs)
    .values({
      organizationId: params.organizationId,
      jobType: params.jobType ?? JOB_TYPE.COMPANY_ANALYSIS,
      status: params.status ?? JOB_STATUS.PENDING,
      subjectId: params.subjectId ?? null,
      payload: params.payload,
      startedAt: params.startedAt ?? null,
    })
    .returning();

  if (!created) throw new Error("Failed to create test job");
  return created;
}

/**
 * A stored analysis, for tests that read rather than produce one.
 *
 * Producing one goes through the service; this is the shortcut for setting up
 * a read.
 */
export async function createTestCompanyAnalysis(params: {
  organizationId: string;
  companyId: string;
  jobId: string;
  question?: string;
}): Promise<typeof companyAnalyses.$inferSelect> {
  const [created] = await db
    .insert(companyAnalyses)
    .values({
      organizationId: params.organizationId,
      companyId: params.companyId,
      jobId: params.jobId,
      question: params.question ?? "What does this company do?",
      summary: `Test summary ${nanoid(6)}`,
      keyPoints: ["Test key point"],
      sentiment: "neutral",
      confidence: 50,
      provider: "mock",
      model: "test-model",
    })
    .returning();

  if (!created) throw new Error("Failed to create test company analysis");
  return created;
}

/**
 * Unique per call. Registration numbers are unique per organization, so
 * reusing one across tests would surface as a confusing duplicate-key failure
 * rather than as the thing the test was checking.
 */
let registrationNumberCounter = 0;
export function generateRegistrationNumber(): string {
  registrationNumberCounter++;
  const timestamp = Date.now().toString().slice(-9);
  return `9${timestamp}${registrationNumberCounter.toString().padStart(3, "0")}`;
}

/**
 * Build a request carrying a session cookie, for calling route handlers
 * directly without standing up an HTTP server.
 *
 * A real NextRequest, not a hand-rolled object: handlers read `nextUrl` and
 * `cookies`, and a stub would drift from the real shape over time.
 */
type NextRequestInit = ConstructorParameters<typeof NextRequest>[1];

export function buildAuthenticatedRequest(
  url: string,
  sessionToken: string | null,
  init?: NextRequestInit,
): NextRequest {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  if (sessionToken) {
    headers.set("cookie", `${SESSION_COOKIE_NAME}=${sessionToken}`);
  }

  return new NextRequest(url, { ...init, headers });
}
