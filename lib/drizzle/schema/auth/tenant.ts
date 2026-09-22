import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Root of the tenancy tree. One customer account, which may own several
 * organizations (business units, regions, brands).
 *
 * Ids are TEXT rather than UUID because Better Auth generates its own string
 * ids, and everything hanging off the auth tables has to match that type.
 */
export const tenant = pgTable("tenant", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
