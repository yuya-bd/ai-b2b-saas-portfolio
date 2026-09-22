import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { companyRepository } from "@/lib/repositories/company.repository";
import {
  createTestCompany,
  createTestContext,
  createTestOrganization,
  type TestContext,
} from "@/lib/test/factories";
import { cleanupOrganization } from "@/lib/test/helpers";

/**
 * Runs against a real Postgres, not a mock. Constraints, cascades and the
 * dialect's own behaviour are exactly what these tests exist to check, and a
 * mocked database would assert only that the mock was called.
 */
describe("CompanyRepository", () => {
  let ctx: TestContext;
  // A second organization, to prove tenant isolation actually holds.
  let otherOrganizationId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    const other = await createTestOrganization();
    otherOrganizationId = other.organizationId;
  });

  afterAll(async () => {
    await cleanupOrganization(ctx.organizationId);
    await cleanupOrganization(otherOrganizationId);
  });

  describe("create", () => {
    it("stores a company scoped to its organization", async () => {
      const created = await companyRepository.create({
        organizationId: ctx.organizationId,
        name: "Acme Industries",
        country: "JP",
      });

      expect(created.id).toBeDefined();
      expect(created.name).toBe("Acme Industries");
      expect(created.organizationId).toBe(ctx.organizationId);
      expect(created.isArchived).toBe(false);
      expect(created.status).toBe("active");
    });

    it("rejects a duplicate registration number within one organization", async () => {
      const registrationNumber = `dup-${Date.now()}`;

      await companyRepository.create({
        organizationId: ctx.organizationId,
        name: "First",
        registrationNumber,
      });

      await expect(
        companyRepository.create({
          organizationId: ctx.organizationId,
          name: "Second",
          registrationNumber,
        }),
      ).rejects.toThrow();
    });

    it("allows the same registration number in a different organization", async () => {
      const registrationNumber = `shared-${Date.now()}`;

      await companyRepository.create({
        organizationId: ctx.organizationId,
        name: "Ours",
        registrationNumber,
      });

      const theirs = await companyRepository.create({
        organizationId: otherOrganizationId,
        name: "Theirs",
        registrationNumber,
      });

      expect(theirs.id).toBeDefined();
    });
  });

  describe("findById", () => {
    it("returns the company when the organization matches", async () => {
      const id = await createTestCompany({
        organizationId: ctx.organizationId,
        name: "Findable",
      });

      const found = await companyRepository.findById(id, ctx.organizationId);

      expect(found?.name).toBe("Findable");
    });

    it("returns undefined for a company in another organization", async () => {
      const id = await createTestCompany({
        organizationId: otherOrganizationId,
        name: "Not yours",
      });

      const found = await companyRepository.findById(id, ctx.organizationId);

      expect(found).toBeUndefined();
    });
  });

  describe("findMany", () => {
    it("returns only the caller's organization", async () => {
      await createTestCompany({
        organizationId: ctx.organizationId,
        name: "Visible",
      });
      await createTestCompany({
        organizationId: otherOrganizationId,
        name: "Hidden",
      });

      const results = await companyRepository.findMany(
        { organizationId: ctx.organizationId },
        { page: 1, limit: 100 },
      );

      expect(
        results.every((c) => c.organizationId === ctx.organizationId),
      ).toBe(true);
      expect(results.some((c) => c.name === "Hidden")).toBe(false);
    });

    it("filters by keyword across name, description and contact", async () => {
      await createTestCompany({
        organizationId: ctx.organizationId,
        name: "Zenith Robotics",
      });

      const results = await companyRepository.findMany(
        { organizationId: ctx.organizationId, keyword: "Zenith" },
        { page: 1, limit: 100 },
      );

      expect(results).toHaveLength(1);
      expect(results[0]?.name).toBe("Zenith Robotics");
    });

    it("hides archived companies unless asked for them", async () => {
      const id = await createTestCompany({
        organizationId: ctx.organizationId,
        name: "Archived Co",
      });
      await companyRepository.update(id, ctx.organizationId, {
        isArchived: true,
      });

      const visible = await companyRepository.findMany(
        { organizationId: ctx.organizationId },
        { page: 1, limit: 100 },
      );
      const all = await companyRepository.findMany(
        { organizationId: ctx.organizationId, includeArchived: true },
        { page: 1, limit: 100 },
      );

      expect(visible.some((c) => c.id === id)).toBe(false);
      expect(all.some((c) => c.id === id)).toBe(true);
    });

    it("paginates", async () => {
      const org = await createTestOrganization();
      for (const name of ["A Co", "B Co", "C Co"]) {
        await createTestCompany({ organizationId: org.organizationId, name });
      }

      const page1 = await companyRepository.findMany(
        { organizationId: org.organizationId },
        { page: 1, limit: 2 },
      );
      const page2 = await companyRepository.findMany(
        { organizationId: org.organizationId },
        { page: 2, limit: 2 },
      );

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(1);
      // Ordered by name, so the split is deterministic.
      expect(page1[0]?.name).toBe("A Co");
      expect(page2[0]?.name).toBe("C Co");

      await cleanupOrganization(org.organizationId);
    });
  });

  describe("count", () => {
    it("counts with the same filter used to list", async () => {
      const org = await createTestOrganization();
      await createTestCompany({
        organizationId: org.organizationId,
        name: "Counted A",
      });
      await createTestCompany({
        organizationId: org.organizationId,
        name: "Counted B",
      });

      const total = await companyRepository.count({
        organizationId: org.organizationId,
      });

      expect(total).toBe(2);

      await cleanupOrganization(org.organizationId);
    });
  });

  describe("update", () => {
    it("updates a company in the caller's organization", async () => {
      const id = await createTestCompany({
        organizationId: ctx.organizationId,
        name: "Before",
      });

      const updated = await companyRepository.update(id, ctx.organizationId, {
        name: "After",
      });

      expect(updated?.name).toBe("After");
    });

    it("does not touch a company in another organization", async () => {
      const id = await createTestCompany({
        organizationId: otherOrganizationId,
        name: "Untouchable",
      });

      const updated = await companyRepository.update(id, ctx.organizationId, {
        name: "Hijacked",
      });

      expect(updated).toBeUndefined();

      const still = await companyRepository.findById(id, otherOrganizationId);
      expect(still?.name).toBe("Untouchable");
    });
  });

  describe("delete", () => {
    it("deletes a company in the caller's organization", async () => {
      const id = await createTestCompany({
        organizationId: ctx.organizationId,
        name: "Doomed",
      });

      const deleted = await companyRepository.delete(id, ctx.organizationId);

      expect(deleted?.id).toBe(id);
      expect(
        await companyRepository.findById(id, ctx.organizationId),
      ).toBeUndefined();
    });

    it("does not delete across organizations", async () => {
      const id = await createTestCompany({
        organizationId: otherOrganizationId,
        name: "Safe",
      });

      const deleted = await companyRepository.delete(id, ctx.organizationId);

      expect(deleted).toBeUndefined();
      expect(
        await companyRepository.findById(id, otherOrganizationId),
      ).toBeDefined();
    });
  });
});
