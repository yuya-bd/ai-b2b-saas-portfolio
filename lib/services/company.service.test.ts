import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NotFoundError } from "@/lib/api/errors";
import { companyService } from "@/lib/services/company.service";
import {
  createTestCompany,
  createTestContext,
  type TestContext,
} from "@/lib/test/factories";
import { cleanupOrganization } from "@/lib/test/helpers";

describe("CompanyService", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await cleanupOrganization(ctx.organizationId);
  });

  describe("getCompanies", () => {
    it("returns data together with pagination metadata", async () => {
      await createTestCompany({
        organizationId: ctx.organizationId,
        name: "Paginated Co",
      });

      const result = await companyService.getCompanies(
        { organizationId: ctx.organizationId },
        { page: 1, limit: 10 },
      );

      expect(result.data.length).toBeGreaterThan(0);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.total).toBe(result.data.length);
      expect(result.pagination.totalPages).toBe(1);
    });

    it("reports totalPages 0 when nothing matches", async () => {
      const result = await companyService.getCompanies(
        { organizationId: ctx.organizationId, keyword: "no-such-company-xyz" },
        { page: 1, limit: 10 },
      );

      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });
  });

  describe("getCompanyById", () => {
    it("returns the company", async () => {
      const id = await createTestCompany({
        organizationId: ctx.organizationId,
        name: "Fetchable",
      });

      const company = await companyService.getCompanyById(
        id,
        ctx.organizationId,
      );

      expect(company.name).toBe("Fetchable");
    });

    it("throws NotFoundError instead of returning undefined", async () => {
      await expect(
        companyService.getCompanyById(
          "00000000-0000-0000-0000-000000000000",
          ctx.organizationId,
        ),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("createCompany", () => {
    it("creates and returns the company", async () => {
      const created = await companyService.createCompany({
        organizationId: ctx.organizationId,
        name: "Created Co",
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      });

      expect(created.name).toBe("Created Co");
      expect(created.createdBy).toBe(ctx.userId);
    });
  });

  describe("updateCompany", () => {
    it("updates the company", async () => {
      const id = await createTestCompany({
        organizationId: ctx.organizationId,
        name: "Old name",
      });

      const updated = await companyService.updateCompany(
        id,
        ctx.organizationId,
        { name: "New name" },
      );

      expect(updated.name).toBe("New name");
    });

    it("throws NotFoundError for an unknown id", async () => {
      await expect(
        companyService.updateCompany(
          "00000000-0000-0000-0000-000000000000",
          ctx.organizationId,
          { name: "Nope" },
        ),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("deleteCompany", () => {
    it("deletes the company", async () => {
      const id = await createTestCompany({
        organizationId: ctx.organizationId,
        name: "To delete",
      });

      await companyService.deleteCompany(id, ctx.organizationId);

      await expect(
        companyService.getCompanyById(id, ctx.organizationId),
      ).rejects.toThrow(NotFoundError);
    });

    it("throws NotFoundError for an unknown id", async () => {
      await expect(
        companyService.deleteCompany(
          "00000000-0000-0000-0000-000000000000",
          ctx.organizationId,
        ),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
