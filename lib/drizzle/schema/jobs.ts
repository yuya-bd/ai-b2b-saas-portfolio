import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { organization } from "./auth/organization";
import { baseColumns } from "./columns";

/**
 * Durable record of work handed to the queue.
 *
 * The queue holds the message; this table holds the outcome. Without it a
 * failed job leaves no trace once the message is gone, so status and error
 * details are persisted here rather than inferred from the queue.
 */
export const jobs = pgTable(
  "jobs",
  {
    ...baseColumns,
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    jobType: varchar("job_type", { length: 50 }).notNull(),
    /** PENDING | PROCESSING | COMPLETED | FAILED */
    status: varchar("status", { length: 50 }).notNull().default("PENDING"),
    /** The record this job is about, if any. */
    subjectId: text("subject_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    queueMessageId: varchar("queue_message_id", { length: 255 }),
    errorMessage: text("error_message"),
    errorDetails: jsonb("error_details"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_jobs_organization_id").on(table.organizationId),
    index("idx_jobs_subject_id").on(table.subjectId),
    index("idx_jobs_status").on(table.status),
    index("idx_jobs_created_at").on(table.createdAt),
  ],
);
