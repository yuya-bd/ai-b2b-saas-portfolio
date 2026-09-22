import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization } from "./organization";

/**
 * A subdivision of an organization. Roles below `admin` are scoped to the
 * department a member belongs to, which is what makes `department_admin` and
 * `editor` narrower than `admin` without needing per-row ACLs.
 */
export const department = pgTable(
  "department",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_department_organization_id").on(table.organizationId),
    index("idx_department_name").on(table.name),
  ],
);
