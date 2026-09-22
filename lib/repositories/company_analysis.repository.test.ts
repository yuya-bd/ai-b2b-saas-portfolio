import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { companyAnalysisRepository } from "@/lib/repositories/company_analysis.repository";
import {
  createTestCompany,
  createTestContext,
  createTestJob,
  createTestOrganization,
  type TestContext,
} from "@/lib/test/factories";
import { cleanupOrganization } from "@/lib/test/helpers";

/**
 * Runs against a real Postgres. The point of this file is the unique
 * constraint on `job_id` — the half of the pipeline's idempotency that lives
 * in the database rather than in application logic — and a mocked client
 * could not enforce it.
 */
describe("CompanyAnalysisRepository", () => {
  let ctx: TestContext;
  // A second organization, to prove tenant isolation actually holds.
  let otherOrganizationId: string;
  let companyId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    const other = await createTestOrganization();
    otherOrganizationId = other.organizationId;
    companyId = await createTestCompany({
      organizationId: ctx.organizationId,
      name: "Analysed Co",
    });
  });

  afterAll(async () => {
    await cleanupOrganization(ctx.organizationId);
    await cleanupOrganization(otherOrganizationId);
  });

  function analysisFor(jobId: string) {
    return {
      organizationId: ctx.organizationId,
      companyId,
      jobId,
      question: "What does this company do?",
      summary: "A summary.",
      keyPoints: ["One", "Two"],
      sentiment: "neutral",
      confidence: 70,
      provider: "stub",
      model: "stub-model",
      inputTokens: 100,
      outputTokens: 50,
    };
  }

  describe("createIfAbsent", () => {
    it("stores an analysis scoped to its organization", async () => {
      const job = await createTestJob({ organizationId: ctx.organizationId });

      const created = await companyAnalysisRepository.createIfAbsent(
        analysisFor(job.id),
      );

      expect(created).toBeDefined();
      expect(created?.organizationId).toBe(ctx.organizationId);
      expect(created?.companyId).toBe(companyId);
      expect(created?.jobId).toBe(job.id);
      expect(created?.keyPoints).toEqual(["One", "Two"]);
      expect(created?.confidence).toBe(70);
    });

    /**
     * The idempotency guarantee, stated as a test: a second insert for the
     * same job does not raise, does not duplicate, and reports that it wrote
     * nothing by returning undefined.
     */
    it("returns undefined instead of inserting a second row for one job", async () => {
      const job = await createTestJob({ organizationId: ctx.organizationId });

      const first = await companyAnalysisRepository.createIfAbsent(
        analysisFor(job.id),
      );
      const second = await companyAnalysisRepository.createIfAbsent(
        analysisFor(job.id),
      );

      expect(first).toBeDefined();
      expect(second).toBeUndefined();

      const stored = await companyAnalysisRepository.findMany({
        organizationId: ctx.organizationId,
        companyId,
      });
      expect(stored.filter((row) => row.jobId === job.id)).toHaveLength(1);
    });

    it("does not conflate two different jobs for the same company", async () => {
      const first = await createTestJob({ organizationId: ctx.organizationId });
      const second = await createTestJob({
        organizationId: ctx.organizationId,
      });

      const a = await companyAnalysisRepository.createIfAbsent(
        analysisFor(first.id),
      );
      const b = await companyAnalysisRepository.createIfAbsent(
        analysisFor(second.id),
      );

      expect(a).toBeDefined();
      expect(b).toBeDefined();
      expect(a?.id).not.toBe(b?.id);
    });
  });

  describe("findByJobId", () => {
    it("finds the analysis a job produced", async () => {
      const job = await createTestJob({ organizationId: ctx.organizationId });
      await companyAnalysisRepository.createIfAbsent(analysisFor(job.id));

      const found = await companyAnalysisRepository.findByJobId(
        job.id,
        ctx.organizationId,
      );

      expect(found?.jobId).toBe(job.id);
    });

    it("does not read across organizations", async () => {
      const job = await createTestJob({ organizationId: ctx.organizationId });
      await companyAnalysisRepository.createIfAbsent(analysisFor(job.id));

      const found = await companyAnalysisRepository.findByJobId(
        job.id,
        otherOrganizationId,
      );

      expect(found).toBeUndefined();
    });
  });

  describe("findById", () => {
    it("does not read across organizations", async () => {
      const job = await createTestJob({ organizationId: ctx.organizationId });
      const created = await companyAnalysisRepository.createIfAbsent(
        analysisFor(job.id),
      );

      const found = await companyAnalysisRepository.findById(
        created?.id ?? "",
        otherOrganizationId,
      );

      expect(found).toBeUndefined();
    });
  });

  describe("findMany", () => {
    it("returns only the requested organization's rows", async () => {
      const job = await createTestJob({ organizationId: ctx.organizationId });
      await companyAnalysisRepository.createIfAbsent(analysisFor(job.id));

      const mine = await companyAnalysisRepository.findMany({
        organizationId: ctx.organizationId,
      });
      const theirs = await companyAnalysisRepository.findMany({
        organizationId: otherOrganizationId,
      });

      expect(mine.length).toBeGreaterThan(0);
      expect(theirs).toHaveLength(0);
    });

    it("filters by company", async () => {
      const otherCompanyId = await createTestCompany({
        organizationId: ctx.organizationId,
        name: "Unanalysed Co",
      });

      const forOther = await companyAnalysisRepository.findMany({
        organizationId: ctx.organizationId,
        companyId: otherCompanyId,
      });

      expect(forOther).toHaveLength(0);
    });

    it("returns newest first", async () => {
      const first = await createTestJob({ organizationId: ctx.organizationId });
      const second = await createTestJob({
        organizationId: ctx.organizationId,
      });
      await companyAnalysisRepository.createIfAbsent(analysisFor(first.id));
      await companyAnalysisRepository.createIfAbsent(analysisFor(second.id));

      const rows = await companyAnalysisRepository.findMany({
        organizationId: ctx.organizationId,
      });

      for (let i = 1; i < rows.length; i++) {
        const previous = rows[i - 1]?.createdAt.getTime() ?? 0;
        const current = rows[i]?.createdAt.getTime() ?? 0;
        expect(previous).toBeGreaterThanOrEqual(current);
      }
    });
  });
});
