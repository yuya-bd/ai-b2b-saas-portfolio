/**
 * Local entry point for the worker.
 *
 * The worker runs outside Next.js, so nothing loads .env for it. This file
 * does that first, then starts the worker.
 *
 *   pnpm worker:dev
 */

import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

// Dynamic import on purpose: a static import is hoisted above the dotenv calls
// above, and the worker would then read an empty environment.
import("./job-worker").catch((error) => {
  console.error("[Worker] Failed to load job-worker:", error);
  process.exit(1);
});
