import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { Role } from "@/lib/constants/roles";
import { department } from "./department";
import { organization } from "./organization";
import { user } from "./user";

/**
 * Per-member overrides, for the cases a role cannot express on its own.
 * Checked only after the role check has already allowed the request.
 */
export type MemberPermissions = {
  canInvite?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  [key: string]: boolean | undefined;
};

/**
 * Joins a user to an organization and carries their role there. A user in two
 * organizations has two member rows and can hold a different role in each.
 */
export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").$type<Role>().notNull().default("viewer"),
    departmentId: text("department_id").references(() => department.id, {
      onDelete: "set null",
    }),
    permissions: jsonb("permissions").$type<MemberPermissions>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_member_organization_id").on(table.organizationId),
    index("idx_member_user_id").on(table.userId),
    index("idx_member_department_id").on(table.departmentId),
  ],
);
