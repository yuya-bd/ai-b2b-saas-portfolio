/**
 * Render the Drizzle schema as a DBML file for diagramming.
 *
 *   pnpm db:dbml
 *
 * The output is generated, so it is gitignored — regenerate it rather than
 * editing it, and paste it into dbdiagram.io to see the relationships.
 */

import { mkdirSync } from "node:fs";
import { pgGenerate } from "drizzle-dbml-generator";
import * as schema from "@/lib/drizzle/schema";

const OUT = "docs/schema.dbml";

mkdirSync("docs", { recursive: true });

pgGenerate({ schema, out: OUT, relational: true });

console.log(`[dbml] Wrote ${OUT}`);
