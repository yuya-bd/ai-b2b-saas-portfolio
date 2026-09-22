import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { organization } from "./auth/organization";
import { baseColumns } from "./columns";
import { companies } from "./companies";
import { jobs } from "./jobs";

/**
 * One model-produced summary of one company.
 *
 * Written only by the queue worker, never by a request handler, so there are
 * no actor columns — the `jobs` row named by `jobId` carries the provenance,
 * including who asked for it.
 *
 * `jobId` is unique, and that constraint is the second half of the pipeline's
 * idempotency. SQS delivers at least once, so the same job can arrive twice;
 * the worker's status claim stops the common case, and this stops the race
 * that slips past it. One job produces one row, forever.
 *
 * The structured fields mirror `companyAnalysisResultSchema` one-to-one. The
 * model's answer is stored as columns rather than as a blob of prose, so
 * reading it back never means parsing free text.
 */
export const companyAnalyses = pgTable(
  "company_analyses",
  {
    ...baseColumns,
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    /** What was asked, kept so a stored answer can be read in context. */
    question: text("question").notNull(),
    summary: text("summary").notNull(),
    keyPoints: jsonb("key_points").$type<string[]>().notNull(),
    /** positive | neutral | negative */
    sentiment: varchar("sentiment", { length: 20 }).notNull(),
    /** The model's own confidence, 0-100. An integer, so SQL can compare it. */
    confidence: integer("confidence").notNull(),
    /**
     * Which provider and model produced this. Without them a result cannot be
     * told apart from one produced by a different model six months earlier.
     */
    provider: varchar("provider", { length: 50 }).notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
  },
  (table) => [
    index("idx_company_analyses_organization_id").on(table.organizationId),
    index("idx_company_analyses_company_id").on(table.companyId),
    index("idx_company_analyses_created_at").on(table.createdAt),
    unique("uniq_company_analyses_job_id").on(table.jobId),
  ],
);
