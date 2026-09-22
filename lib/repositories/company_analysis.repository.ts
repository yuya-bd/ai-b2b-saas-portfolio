import { and, desc, eq, type SQL } from "drizzle-orm";
import { db } from "@/lib/drizzle";
import { companyAnalyses } from "@/lib/drizzle/schema/company_analyses";

export type CompanyAnalysisEntity = typeof companyAnalyses.$inferSelect;
export type CreateCompanyAnalysisData = typeof companyAnalyses.$inferInsert;

/**
 * `organizationId` is required, not optional, so a query that forgets to
 * scope by tenant does not compile.
 */
export interface CompanyAnalysisFilter {
  organizationId: string;
  companyId?: string;
}

export interface CompanyAnalysisRepository {
  findById(
    id: string,
    organizationId: string,
  ): Promise<CompanyAnalysisEntity | undefined>;
  findByJobId(
    jobId: string,
    organizationId: string,
  ): Promise<CompanyAnalysisEntity | undefined>;
  findMany(
    filter: CompanyAnalysisFilter,
    options?: { limit?: number },
  ): Promise<CompanyAnalysisEntity[]>;
  createIfAbsent(
    data: CreateCompanyAnalysisData,
  ): Promise<CompanyAnalysisEntity | undefined>;
}

/**
 * Data access for company analyses. Queries and nothing else.
 */
export class CompanyAnalysisRepositoryImpl
  implements CompanyAnalysisRepository
{
  private buildWhere(filter: CompanyAnalysisFilter): SQL | undefined {
    const conditions: SQL[] = [
      eq(companyAnalyses.organizationId, filter.organizationId),
    ];

    if (filter.companyId) {
      conditions.push(eq(companyAnalyses.companyId, filter.companyId));
    }

    return and(...conditions);
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<CompanyAnalysisEntity | undefined> {
    return await db.query.companyAnalyses.findFirst({
      where: and(
        eq(companyAnalyses.id, id),
        eq(companyAnalyses.organizationId, organizationId),
      ),
    });
  }

  async findByJobId(
    jobId: string,
    organizationId: string,
  ): Promise<CompanyAnalysisEntity | undefined> {
    return await db.query.companyAnalyses.findFirst({
      where: and(
        eq(companyAnalyses.jobId, jobId),
        eq(companyAnalyses.organizationId, organizationId),
      ),
    });
  }

  async findMany(
    filter: CompanyAnalysisFilter,
    options?: { limit?: number },
  ): Promise<CompanyAnalysisEntity[]> {
    return await db
      .select()
      .from(companyAnalyses)
      .where(this.buildWhere(filter))
      .orderBy(desc(companyAnalyses.createdAt))
      .limit(options?.limit ?? 50);
  }

  /**
   * Insert, unless this job has already produced a row.
   *
   * The `uniq_company_analyses_job_id` constraint does the deciding, in the
   * database, rather than a read-then-write in application code that two
   * workers could interleave. A conflict returns nothing and the caller reads
   * the existing row — a duplicate delivery is not an error, it is a no-op.
   */
  async createIfAbsent(
    data: CreateCompanyAnalysisData,
  ): Promise<CompanyAnalysisEntity | undefined> {
    const [created] = await db
      .insert(companyAnalyses)
      .values(data)
      .onConflictDoNothing({ target: companyAnalyses.jobId })
      .returning();

    return created;
  }
}

export const companyAnalysisRepository = new CompanyAnalysisRepositoryImpl();
