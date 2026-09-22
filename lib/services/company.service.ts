import { NotFoundError } from "@/lib/api/errors";
import { invalidateCompaniesByOrganization } from "@/lib/cache/invalidation";
import {
  type CompanyEntity,
  type CompanyFilter,
  type CompanyRepository,
  type CreateCompanyData,
  companyRepository,
  type UpdateCompanyData,
} from "@/lib/repositories/company.repository";
import type { ListResponse, PaginationOptions } from "@/lib/types/api";

export type CompanyListResult = ListResponse<CompanyEntity>;

/**
 * Business rules for companies.
 *
 * The repository is injected so tests can substitute a fake, though the
 * integration tests in this repository use the real one against a real
 * database and only reach for a fake when simulating failure.
 */
export class CompanyService {
  private repository: CompanyRepository;

  constructor(repository?: CompanyRepository) {
    this.repository = repository || companyRepository;
  }

  async getCompanies(
    filter: CompanyFilter,
    pagination: PaginationOptions = { page: 1, limit: 50 },
  ): Promise<CompanyListResult> {
    // Both queries hit the same filter and neither depends on the other.
    const [data, total] = await Promise.all([
      this.repository.findMany(filter, pagination),
      this.repository.count(filter),
    ]);

    return {
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  }

  /**
   * Throws rather than returning undefined, so callers cannot forget the
   * missing case. `handleApiError` turns it into a 404.
   */
  async getCompanyById(
    id: string,
    organizationId: string,
  ): Promise<CompanyEntity> {
    const company = await this.repository.findById(id, organizationId);
    if (!company) {
      throw new NotFoundError("Company not found");
    }
    return company;
  }

  async createCompany(data: CreateCompanyData): Promise<CompanyEntity> {
    const company = await this.repository.create(data);
    await invalidateCompaniesByOrganization(company.organizationId);
    return company;
  }

  async updateCompany(
    id: string,
    organizationId: string,
    data: UpdateCompanyData,
  ): Promise<CompanyEntity> {
    const updated = await this.repository.update(id, organizationId, data);
    if (!updated) {
      throw new NotFoundError("Company not found");
    }
    await invalidateCompaniesByOrganization(organizationId);
    return updated;
  }

  async deleteCompany(id: string, organizationId: string): Promise<void> {
    const deleted = await this.repository.delete(id, organizationId);
    if (!deleted) {
      throw new NotFoundError("Company not found");
    }
    await invalidateCompaniesByOrganization(organizationId);
  }
}

export const companyService = new CompanyService();
