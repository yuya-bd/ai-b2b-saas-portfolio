import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { department } from "./auth/department";
import { organization } from "./auth/organization";
import { actorColumns, baseColumns } from "./columns";

/**
 * The reference business entity for this template.
 *
 * It carries the two scoping columns every business table needs:
 * `organizationId` for tenant isolation, and `departmentId` so that
 * department-scoped roles can be narrowed without per-row ACLs.
 */
export const companies = pgTable(
  "companies",
  {
    ...baseColumns,
    ...actorColumns,
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    departmentId: text("department_id").references(() => department.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 255 }).notNull(),
    /** Government-issued company identifier, whatever the jurisdiction uses. */
    registrationNumber: varchar("registration_number", { length: 64 }),
    country: varchar("country", { length: 100 }),
    foundedYear: integer("founded_year"),
    contactName: varchar("contact_name", { length: 255 }),
    description: text("description"),
    website: varchar("website", { length: 512 }),
    /** Link into whichever external data provider the deployment uses. */
    externalDatabaseUrl: varchar("external_database_url", { length: 512 }),
    /** Link into whichever document store the deployment uses. */
    documentStorageUrl: varchar("document_storage_url", { length: 512 }),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    isArchived: boolean("is_archived").default(false).notNull(),
  },
  (table) => [
    index("idx_companies_organization_id").on(table.organizationId),
    index("idx_companies_department_id").on(table.departmentId),
    index("idx_companies_name").on(table.name),
    index("idx_companies_country").on(table.country),
    index("idx_companies_is_archived").on(table.isArchived),
    // Uniqueness is per organization, not global: two tenants may legitimately
    // hold the same company.
    unique("uniq_companies_org_registration_number").on(
      table.organizationId,
      table.registrationNumber,
    ),
  ],
);
