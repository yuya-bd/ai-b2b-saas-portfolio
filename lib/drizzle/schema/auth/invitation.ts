import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { Role } from "@/lib/constants/roles";
import { department } from "./department";
import { organization } from "./organization";

/**
 * A pending invitation to join an organization. The role and department are
 * decided at invite time, so accepting the invite needs no further input.
 */
export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    departmentId: text("department_id").references(() => department.id, {
      onDelete: "set null",
    }),
    role: text("role").$type<Role>().notNull().default("viewer"),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    invitedBy: text("invited_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_invitation_organization_id").on(table.organizationId),
    index("idx_invitation_email").on(table.email),
    index("idx_invitation_token").on(table.token),
    index("idx_invitation_expires_at").on(table.expiresAt),
  ],
);
