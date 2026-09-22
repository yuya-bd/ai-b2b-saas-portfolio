import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./user";

/**
 * Better Auth account table. Backs password credentials and, if OAuth
 * providers are added, their linked accounts.
 *
 * The field set here has to match what the installed Better Auth expects, or
 * it refuses to write at runtime with a "field does not exist" error. When
 * upgrading Better Auth across a major version, check this table first.
 */
export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** How the credential was obtained, e.g. "credential" or "google". */
    providerId: text("provider_id").notNull(),
    /**
     * Who vouches for the identity. Distinct from providerId: two providers
     * can front the same issuer, and identity is scoped by this rather than
     * by the provider.
     */
    issuer: text("issuer").notNull(),
    /** The identifier this issuer knows the user by. */
    accountId: text("account_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    /** Hashed by Better Auth. Null for OAuth-only accounts. */
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_account_user_id").on(table.userId),
    // Scoped by issuer, matching how Better Auth looks accounts up.
    uniqueIndex("idx_account_issuer_account").on(table.issuer, table.accountId),
  ],
);
