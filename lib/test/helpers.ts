import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/drizzle";
import {
  auditLogs,
  companies,
  companyAnalyses,
  jobs,
  member,
  organization,
  session,
  tags,
  tenant,
} from "@/lib/drizzle/schema";

/**
 * Delete everything belonging to one organization.
 *
 * This is the cleanup to use inside a test file. Test files run in parallel
 * processes against one database, and each file works in its own organization
 * (see `createTestOrganization`), so scoping the delete this way means one
 * file can never destroy another file's data mid-run.
 *
 * Order matters: children before parents, or the foreign keys reject it.
 */
export async function cleanupOrganization(organizationId: string) {
  const org = await db.query.organization.findFirst({
    where: eq(organization.id, organizationId),
  });

  await db
    .delete(auditLogs)
    .where(eq(auditLogs.organizationId, organizationId));
  // Before both jobs and companies: it references each of them.
  await db
    .delete(companyAnalyses)
    .where(eq(companyAnalyses.organizationId, organizationId));
  await db.delete(jobs).where(eq(jobs.organizationId, organizationId));
  await db
    .delete(companies)
    .where(eq(companies.organizationId, organizationId));
  await db.delete(tags).where(eq(tags.organizationId, organizationId));
  await db.delete(member).where(eq(member.organizationId, organizationId));
  await db.delete(organization).where(eq(organization.id, organizationId));

  // Departments, sessions and users cascade from the rows above; the tenant
  // does not, because it is the root.
  if (org) {
    await db.delete(tenant).where(eq(tenant.id, org.tenantId));
  }
}

/**
 * Truncate every table.
 *
 * Do NOT call this from a test file — with `fileParallelism` on it would wipe
 * whatever the other files are working on. It exists for a global teardown or
 * for resetting a local database by hand.
 */
export async function cleanupDatabase() {
  await db.execute(sql`
    TRUNCATE TABLE audit_logs,
                   company_analyses,
                   jobs,
                   companies,
                   tags,
                   invitation,
                   member,
                   department,
                   session,
                   account,
                   verification,
                   "user",
                   organization,
                   tenant
    RESTART IDENTITY CASCADE
  `);
}

/** Remove just the sessions created by a test. */
export async function cleanupSessionsForUser(userId: string) {
  await db.delete(session).where(eq(session.userId, userId));
}
