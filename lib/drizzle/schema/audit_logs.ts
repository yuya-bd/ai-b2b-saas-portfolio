import {
  index,
  json,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { organization } from "./auth/organization";
import { user } from "./auth/user";
import { baseColumns } from "./columns";

/**
 * Append-only record of who changed what. Written after the response is sent
 * (see audit.helper.ts), so it never sits on the request's critical path.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    ...baseColumns,
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    action: varchar("action", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 100 }),
    entityId: text("entity_id"),
    changes: json("changes"),
    ipAddress: varchar("ip_address", { length: 45 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_audit_logs_organization_occurred_at").on(
      table.organizationId,
      table.occurredAt,
    ),
    index("idx_audit_logs_user_occurred_at").on(table.userId, table.occurredAt),
    index("idx_audit_logs_entity").on(table.entityType, table.entityId),
  ],
);
