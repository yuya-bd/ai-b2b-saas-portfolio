import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import {
  JOB_PROCESSING_LEASE_MS,
  JOB_STATUS,
  JOB_STATUSES_CLAIMABLE,
} from "@/lib/constants/jobs";
import { db } from "@/lib/drizzle";
import { jobs } from "@/lib/drizzle/schema/jobs";

export type JobEntity = typeof jobs.$inferSelect;
export type CreateJobData = typeof jobs.$inferInsert;
export type UpdateJobData = Partial<Omit<CreateJobData, "id" | "createdAt">>;

export interface JobRepository {
  findById(id: string): Promise<JobEntity | undefined>;
  findByOrganizationId(
    organizationId: string,
    options?: { limit?: number },
  ): Promise<JobEntity[]>;
  create(data: CreateJobData): Promise<JobEntity>;
  update(id: string, data: UpdateJobData): Promise<JobEntity | undefined>;
  claimForProcessing(id: string): Promise<JobEntity | undefined>;
}

export class JobRepositoryImpl implements JobRepository {
  async findById(id: string): Promise<JobEntity | undefined> {
    return await db.query.jobs.findFirst({ where: eq(jobs.id, id) });
  }

  async findByOrganizationId(
    organizationId: string,
    options?: { limit?: number },
  ): Promise<JobEntity[]> {
    return await db
      .select()
      .from(jobs)
      .where(eq(jobs.organizationId, organizationId))
      .orderBy(desc(jobs.createdAt))
      .limit(options?.limit ?? 50);
  }

  async create(data: CreateJobData): Promise<JobEntity> {
    const [created] = await db.insert(jobs).values(data).returning();
    if (!created) {
      throw new Error("Failed to create job");
    }
    return created;
  }

  async update(
    id: string,
    data: UpdateJobData,
  ): Promise<JobEntity | undefined> {
    const [updated] = await db
      .update(jobs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(jobs.id, id))
      .returning();
    return updated;
  }

  /**
   * Move one job to PROCESSING, but only from a state it may be claimed in.
   *
   * A compare-and-set in a single statement, so two workers handed the same
   * message cannot both proceed: Postgres applies the UPDATE for one of them
   * and the other matches no row and receives `undefined`. Doing this as a
   * read-then-write in application code leaves a window between the two where
   * both see PENDING.
   *
   * COMPLETED is absent from the claimable set deliberately, and that absence
   * is the idempotency guarantee the pipeline rests on: a redelivered message
   * for finished work never reaches the provider, so it neither spends money
   * nor writes a second row.
   *
   * A stale PROCESSING claim *is* claimable. A worker killed mid-job leaves
   * its row in PROCESSING with nothing to clear it, and without this the job
   * would be skipped on every future delivery. See `JOB_PROCESSING_LEASE_MS`
   * for why the window matches the queue's visibility timeout.
   */
  async claimForProcessing(id: string): Promise<JobEntity | undefined> {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - JOB_PROCESSING_LEASE_MS);

    const [claimed] = await db
      .update(jobs)
      .set({ status: JOB_STATUS.PROCESSING, startedAt: now, updatedAt: now })
      .where(
        and(
          eq(jobs.id, id),
          or(
            inArray(jobs.status, [...JOB_STATUSES_CLAIMABLE]),
            and(
              eq(jobs.status, JOB_STATUS.PROCESSING),
              lt(jobs.startedAt, staleBefore),
            ),
          ),
        ),
      )
      .returning();

    return claimed;
  }
}

export const jobRepository = new JobRepositoryImpl();
