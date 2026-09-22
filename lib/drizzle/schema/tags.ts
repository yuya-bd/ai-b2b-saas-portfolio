import {
  boolean,
  index,
  pgTable,
  text,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { organization } from "./auth/organization";
import { actorColumns, baseColumns } from "./columns";

/**
 * Labels applied to records across the organization.
 *
 * Not department-scoped: a label is meaningful organization-wide, and scoping
 * it would mean the same word existing several times with different ids.
 */
export const tags = pgTable(
  "tags",
  {
    ...baseColumns,
    ...actorColumns,
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    /** Grouping, so unrelated vocabularies do not collide in one list. */
    type: varchar("type", { length: 100 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    isArchived: boolean("is_archived").default(false).notNull(),
  },
  (table) => [
    index("idx_tags_organization_id").on(table.organizationId),
    index("idx_tags_type").on(table.type),
    index("idx_tags_is_archived").on(table.isArchived),
    unique("uniq_tags_org_type_name").on(
      table.organizationId,
      table.type,
      table.name,
    ),
  ],
);
