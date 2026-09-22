import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { tenant } from "./tenant";

/**
 * A workspace within a tenant. Every business row is scoped to exactly one
 * organization, and that scope is the primary isolation boundary.
 */
export const organization = pgTable(
  "organization",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").unique(),
    logo: text("logo"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenant.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_organization_tenant_id").on(table.tenantId),
    index("idx_organization_slug").on(table.slug),
  ],
);
