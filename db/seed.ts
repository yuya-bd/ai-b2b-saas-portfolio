import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth/server";
import { ROLES, type Role } from "@/lib/constants/roles";
import { db } from "@/lib/drizzle";
import {
  department,
  member,
  organization,
  tenant,
  user,
} from "@/lib/drizzle/schema";

/**
 * Seeds one tenant, one organization, one department, and a signed-in-able
 * user for every role, so each permission branch can be exercised by hand.
 *
 * Idempotent: re-running updates rather than duplicating.
 *
 * Run through the bootstrap, which loads .env first:
 *   pnpm db:seed:dev
 *
 * Users are created through Better Auth's own sign-up API rather than by
 * inserting rows. Password hashing and the exact shape of the account record
 * are Better Auth's business, and writing them by hand breaks silently the
 * moment it changes either.
 */

const TENANT_ID = "seed-tenant";
const ORGANIZATION_ID = "seed-organization";
const DEPARTMENT_ID = "seed-department";

/** Local development only. Nothing here is intended to reach a real deployment. */
const SEED_PASSWORD = "password1234";

const SEED_USERS: { key: string; name: string; role: Role }[] = [
  { key: "owner", name: "Seed Owner", role: ROLES.OWNER },
  { key: "admin", name: "Seed Admin", role: ROLES.ADMIN },
  {
    key: "department-admin",
    name: "Seed Department Admin",
    role: ROLES.DEPARTMENT_ADMIN,
  },
  { key: "editor", name: "Seed Editor", role: ROLES.EDITOR },
  { key: "viewer", name: "Seed Viewer", role: ROLES.VIEWER },
  { key: "partner", name: "Seed Partner", role: ROLES.PARTNER_MEMBER },
];

async function seed() {
  const env = process.env.SEED_ENV ?? "dev";
  console.log(`[seed] Running with SEED_ENV=${env}`);

  if (env !== "dev") {
    // The fixed password below makes this unsafe anywhere but a developer's
    // own machine.
    throw new Error(
      "This seed creates accounts with a known password and is for local development only.",
    );
  }

  await db
    .insert(tenant)
    .values({ id: TENANT_ID, name: "Seed Tenant", slug: "seed-tenant" })
    .onConflictDoNothing();

  await db
    .insert(organization)
    .values({
      id: ORGANIZATION_ID,
      name: "Seed Organization",
      slug: "seed-organization",
      tenantId: TENANT_ID,
    })
    .onConflictDoNothing();

  await db
    .insert(department)
    .values({
      id: DEPARTMENT_ID,
      organizationId: ORGANIZATION_ID,
      name: "Seed Department",
    })
    .onConflictDoNothing();

  for (const seedUser of SEED_USERS) {
    // Reserved by RFC 2606, so a misconfigured mailer cannot reach anyone.
    const email = `${seedUser.key}@example.com`;

    let existing = await db.query.user.findFirst({
      where: eq(user.email, email),
    });

    if (!existing) {
      await auth.api.signUpEmail({
        body: { email, password: SEED_PASSWORD, name: seedUser.name },
      });
      existing = await db.query.user.findFirst({
        where: eq(user.email, email),
      });
    }

    if (!existing) {
      throw new Error(`Failed to create seed user ${email}`);
    }

    const memberId = `seed-member-${seedUser.key}`;
    const existingMember = await db.query.member.findFirst({
      where: eq(member.id, memberId),
    });

    // Partners sit outside the internal structure, so they get no department.
    const departmentId =
      seedUser.role === ROLES.PARTNER_MEMBER ? null : DEPARTMENT_ID;

    if (existingMember) {
      await db
        .update(member)
        .set({ role: seedUser.role, departmentId, userId: existing.id })
        .where(eq(member.id, memberId));
    } else {
      await db.insert(member).values({
        id: memberId,
        organizationId: ORGANIZATION_ID,
        userId: existing.id,
        role: seedUser.role,
        departmentId,
      });
    }

    console.log(`[seed] ${email} (${seedUser.role})`);
  }

  console.log(`[seed] Password for all seed users: ${SEED_PASSWORD}`);
  console.log(`[seed] Organization id: ${ORGANIZATION_ID}`);
  console.log("[seed] Done.");
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[seed] Failed:", error);
    process.exit(1);
  });
