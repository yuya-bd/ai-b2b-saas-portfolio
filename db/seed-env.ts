/**
 * Entry point for seeding.
 *
 * Seeds run outside Next.js, so nothing has loaded .env for them. Imports are
 * evaluated before the module body, so `db/seed.ts` cannot load the
 * environment itself — by the time its own statements run, the database
 * client has already been constructed against an empty DATABASE_URL. Loading
 * the environment here and reaching for the seed dynamically is what puts the
 * two in the right order.
 *
 * Same shape as lib/workers/worker-env.ts, for the same reason.
 */

import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

import("./seed").catch((error) => {
  console.error("[seed] Failed to load seed:", error);
  process.exit(1);
});
