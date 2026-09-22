import { text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth/user";

/**
 * Identity and lifecycle columns shared by every business table.
 */
export const baseColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

/**
 * Who created and last touched a row. Nullable, because rows can also be
 * written by migrations, seeds and background jobs that have no acting user.
 */
export const actorColumns = {
  createdBy: text("created_by").references(() => user.id),
  updatedBy: text("updated_by").references(() => user.id),
};
