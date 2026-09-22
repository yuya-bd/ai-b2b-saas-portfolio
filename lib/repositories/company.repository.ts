import { and, asc, count, eq, ilike, or, type SQL } from "drizzle-orm";
import { db } from "@/lib/drizzle";
import { companies } from "@/lib/drizzle/schema/companies";
import type { PaginationOptions } from "@/lib/types/api";

export type CompanyEntity = typeof companies.$inferSelect;
export type CreateCompanyData = typeof companies.$inferInsert;
export type UpdateCompanyData = Partial<
  Omit<CreateCompanyData, "id" | "organizationId" | "createdAt">
>;

/**
 * `organizationId` is required, not optional. Making it part of the filter
 * type means a query that forgets to scope by tenant does not compile.
 */
export interface CompanyFilter {
  organizationId: string;
  keyword?: string;
  country?: string;
  departmentId?: string;
  status?: string;
  includeArchived?: boolean;
}

export interface CompanyRepository {
  findById(
    id: string,
    organizationId: string,
  ): Promise<CompanyEntity | undefined>;
  findMany(
    filter: CompanyFilter,
    pagination: PaginationOptions,
  ): Promise<CompanyEntity[]>;
  count(filter: CompanyFilter): Promise<number>;
  create(data: CreateCompanyData): Promise<CompanyEntity>;
  update(
    id: string,
    organizationId: string,
    data: UpdateCompanyData,
  ): Promise<CompanyEntity | undefined>;
  delete(
    id: string,
    organizationId: string,
  ): Promise<CompanyEntity | undefined>;
}

/**
 * Data access for companies. Queries and nothing else — no authorization, no
 * cache invalidation, no notifications. Those belong to the service.
 */
export class CompanyRepositoryImpl implements CompanyRepository {
  private buildWhere(filter: CompanyFilter): SQL | undefined {
    const conditions: SQL[] = [
      eq(companies.organizationId, filter.organizationId),
    ];

    if (!filter.includeArchived) {
      conditions.push(eq(companies.isArchived, false));
    }
    if (filter.country) {
      conditions.push(eq(companies.country, filter.country));
    }
    if (filter.departmentId) {
      conditions.push(eq(companies.departmentId, filter.departmentId));
    }
    if (filter.status) {
      conditions.push(eq(companies.status, filter.status));
    }
    if (filter.keyword) {
      const pattern = `%${filter.keyword}%`;
      const keywordMatch = or(
        ilike(companies.name, pattern),
        ilike(companies.description, pattern),
        ilike(companies.contactName, pattern),
      );
      if (keywordMatch) conditions.push(keywordMatch);
    }

    return and(...conditions);
  }

  /**
   * Scoped by organization as well as id: without it, guessing a UUID would
   * read another tenant's row.
   */
  async findById(
    id: string,
    organizationId: string,
  ): Promise<CompanyEntity | undefined> {
    return await db.query.companies.findFirst({
      where: and(
        eq(companies.id, id),
        eq(companies.organizationId, organizationId),
      ),
    });
  }

  async findMany(
    filter: CompanyFilter,
    pagination: PaginationOptions,
  ): Promise<CompanyEntity[]> {
    return await db
      .select()
      .from(companies)
      .where(this.buildWhere(filter))
      .orderBy(asc(companies.name))
      .limit(pagination.limit)
      .offset((pagination.page - 1) * pagination.limit);
  }

  /** Same filter as findMany, so the total always matches the page. */
  async count(filter: CompanyFilter): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(companies)
      .where(this.buildWhere(filter));
    return row?.value ?? 0;
  }

  async create(data: CreateCompanyData): Promise<CompanyEntity> {
    const [created] = await db.insert(companies).values(data).returning();
    if (!created) {
      throw new Error("Failed to create company");
    }
    return created;
  }

  async update(
    id: string,
    organizationId: string,
    data: UpdateCompanyData,
  ): Promise<CompanyEntity | undefined> {
    const [updated] = await db
      .update(companies)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(eq(companies.id, id), eq(companies.organizationId, organizationId)),
      )
      .returning();
    return updated;
  }

  async delete(
    id: string,
    organizationId: string,
  ): Promise<CompanyEntity | undefined> {
    const [deleted] = await db
      .delete(companies)
      .where(
        and(eq(companies.id, id), eq(companies.organizationId, organizationId)),
      )
      .returning();
    return deleted;
  }
}

export const companyRepository = new CompanyRepositoryImpl();
