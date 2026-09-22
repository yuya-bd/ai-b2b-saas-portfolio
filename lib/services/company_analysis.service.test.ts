import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  AnalysisProvider,
  AnalysisProviderResult,
  AnalysisRequest,
} from "@/lib/ai";
import { AiProviderError } from "@/lib/ai";
import { MockAnalysisProvider } from "@/lib/ai/mock-provider";
import { NotFoundError } from "@/lib/api/errors";
import { JOB_STATUS, JOB_TYPE } from "@/lib/constants/jobs";
import { companyRepository } from "@/lib/repositories/company.repository";
import { companyAnalysisRepository } from "@/lib/repositories/company_analysis.repository";
import { jobRepository } from "@/lib/repositories/job.repository";
import { CompanyAnalysisService } from "@/lib/services/company_analysis.service";
import {
  createTestCompany,
  createTestContext,
  createTestJob,
  createTestOrganization,
  type TestContext,
} from "@/lib/test/factories";
import { cleanupOrganization } from "@/lib/test/helpers";

/**
 * The provider is a stub; everything else is real.
 *
 * That split is deliberate. The provider is the one dependency that costs
 * money and needs a network, and its own behaviour — structured output,
 * error classification — belongs to its own tests. What matters here is what
 * the service does with what it gets back, and that is all database work.
 */
function stubProvider(
  behaviour?: (request: AnalysisRequest) => AnalysisProviderResult,
): AnalysisProvider & { requests: AnalysisRequest[] } {
  const requests: AnalysisRequest[] = [];

  return {
    name: "stub",
    requests,
    async analyze(request) {
      requests.push(request);
      if (behaviour) return behaviour(request);
      return {
        result: {
          summary: "A stubbed summary.",
          keyPoints: ["First point", "Second point"],
          sentiment: "positive",
          confidence: 88,
        },
        provider: "stub",
        model: "stub-model",
        inputTokens: 123,
        outputTokens: 45,
      };
    },
  };
}

describe("CompanyAnalysisService", () => {
  let ctx: TestContext;
  let otherOrganizationId: string;
  let companyId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    const other = await createTestOrganization();
    otherOrganizationId = other.organizationId;
    companyId = await createTestCompany({
      organizationId: ctx.organizationId,
      name: "Subject Co",
      registrationNumber: "9000000000001",
    });
  });

  afterAll(async () => {
    await cleanupOrganization(ctx.organizationId);
    await cleanupOrganization(otherOrganizationId);
  });

  describe("requestAnalysis", () => {
    it("records a PENDING job pointing at the company", async () => {
      const service = new CompanyAnalysisService({ provider: stubProvider() });

      const job = await service.requestAnalysis({
        organizationId: ctx.organizationId,
        companyId,
        question: "What does this company do?",
      });

      expect(job.status).toBe(JOB_STATUS.PENDING);
      expect(job.jobType).toBe(JOB_TYPE.COMPANY_ANALYSIS);
      expect(job.subjectId).toBe(companyId);
      expect(job.organizationId).toBe(ctx.organizationId);
      expect(job.payload).toEqual({
        companyId,
        question: "What does this company do?",
      });
    });

    it("records the queue message id on the job", async () => {
      const service = new CompanyAnalysisService({ provider: stubProvider() });

      const job = await service.requestAnalysis({
        organizationId: ctx.organizationId,
        companyId,
        question: "Anything notable?",
      });

      expect(job.queueMessageId).toBeTruthy();
    });

    it("does not enqueue work for another organization's company", async () => {
      const service = new CompanyAnalysisService({ provider: stubProvider() });

      await expect(
        service.requestAnalysis({
          organizationId: otherOrganizationId,
          companyId,
          question: "What does this company do?",
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("rejects an empty question before anything is enqueued", async () => {
      const service = new CompanyAnalysisService({ provider: stubProvider() });

      await expect(
        service.requestAnalysis({
          organizationId: ctx.organizationId,
          companyId,
          question: "",
        }),
      ).rejects.toThrow();
    });
  });

  describe("runAnalysis", () => {
    async function pendingJob(payload?: Record<string, unknown>) {
      return await createTestJob({
        organizationId: ctx.organizationId,
        subjectId: companyId,
        payload: payload ?? {
          companyId,
          question: "What does this company do?",
        },
      });
    }

    it("writes the provider's structured fields, column by column", async () => {
      const service = new CompanyAnalysisService({ provider: stubProvider() });
      const job = await pendingJob();

      const analysis = await service.runAnalysis(job);

      expect(analysis.summary).toBe("A stubbed summary.");
      expect(analysis.keyPoints).toEqual(["First point", "Second point"]);
      expect(analysis.sentiment).toBe("positive");
      expect(analysis.confidence).toBe(88);
      expect(analysis.provider).toBe("stub");
      expect(analysis.model).toBe("stub-model");
      expect(analysis.inputTokens).toBe(123);
      expect(analysis.outputTokens).toBe(45);
      expect(analysis.question).toBe("What does this company do?");
    });

    /**
     * The database half of the idempotency guarantee. The worker's status
     * claim normally stops a second run before it reaches the provider; this
     * covers the race that gets past it.
     */
    it("writes one row when run twice for the same job", async () => {
      const provider = stubProvider();
      const service = new CompanyAnalysisService({ provider });
      const job = await pendingJob();

      const first = await service.runAnalysis(job);
      const second = await service.runAnalysis(job);

      expect(second.id).toBe(first.id);

      const stored = await companyAnalysisRepository.findMany({
        organizationId: ctx.organizationId,
        companyId,
      });
      expect(stored.filter((row) => row.jobId === job.id)).toHaveLength(1);
    });

    /**
     * The allow-list on `CompanyFacts`, asserted rather than trusted.
     *
     * `contactName` is a named individual and `registrationNumber` is a
     * government identifier; neither helps answer a question about the
     * company, so neither may leave the system. A future spread over the row
     * would break this test, which is the point of writing it.
     */
    it("sends only allow-listed fields to the provider", async () => {
      const provider = stubProvider();
      const service = new CompanyAnalysisService({ provider });

      const sensitiveCompanyId = await createTestCompany({
        organizationId: ctx.organizationId,
        name: "Guarded Co",
        registrationNumber: "9000000000002",
      });
      await companyRepository.update(sensitiveCompanyId, ctx.organizationId, {
        contactName: "A Named Person",
        externalDatabaseUrl: "https://internal.example.com/records/1",
        documentStorageUrl: "https://internal.example.com/docs/1",
      });

      const job = await createTestJob({
        organizationId: ctx.organizationId,
        subjectId: sensitiveCompanyId,
        payload: { companyId: sensitiveCompanyId, question: "Summarise." },
      });

      await service.runAnalysis(job);

      const facts = provider.requests[0]?.facts;
      expect(Object.keys(facts ?? {}).sort()).toEqual([
        "country",
        "description",
        "foundedYear",
        "name",
        "status",
        "website",
      ]);

      const serialised = JSON.stringify(facts);
      expect(serialised).not.toContain("A Named Person");
      expect(serialised).not.toContain("9000000000002");
      expect(serialised).not.toContain("internal.example.com");
    });

    /**
     * Tenant scope comes from the job row, not from the message that named
     * the job. A payload naming another tenant's company therefore resolves
     * to nothing rather than to that company.
     */
    it("cannot reach another organization's company through the payload", async () => {
      const service = new CompanyAnalysisService({ provider: stubProvider() });

      const foreignCompanyId = await createTestCompany({
        organizationId: otherOrganizationId,
        name: "Foreign Co",
      });
      const job = await createTestJob({
        organizationId: ctx.organizationId,
        payload: { companyId: foreignCompanyId, question: "Summarise." },
      });

      await expect(service.runAnalysis(job)).rejects.toThrow(NotFoundError);
    });

    it("rejects a payload that is not a valid analysis request", async () => {
      const service = new CompanyAnalysisService({ provider: stubProvider() });
      const job = await createTestJob({
        organizationId: ctx.organizationId,
        payload: { somethingElse: true },
      });

      await expect(service.runAnalysis(job)).rejects.toThrow();
    });

    it("writes nothing when the provider fails", async () => {
      const service = new CompanyAnalysisService({
        provider: stubProvider(() => {
          throw new AiProviderError(
            "rate_limited",
            "Provider rate limit",
            true,
          );
        }),
      });
      const job = await pendingJob();

      await expect(service.runAnalysis(job)).rejects.toThrow(AiProviderError);

      const stored = await companyAnalysisRepository.findByJobId(
        job.id,
        ctx.organizationId,
      );
      expect(stored).toBeUndefined();
    });

    it("works end to end against the mock provider", async () => {
      const service = new CompanyAnalysisService({
        provider: new MockAnalysisProvider({
          provider: "mock",
          model: "test-model",
          effort: "medium",
          maxOutputTokens: 1000,
          maxRetries: 0,
          timeoutMs: 1000,
        }),
      });
      const job = await pendingJob();

      const analysis = await service.runAnalysis(job);

      expect(analysis.provider).toBe("mock");
      expect(analysis.summary).toContain("Subject Co");
      expect(analysis.keyPoints.length).toBeGreaterThan(0);
      expect(analysis.sentiment).toBe("neutral");
    });
  });

  describe("getAnalyses", () => {
    it("returns the analyses for one company", async () => {
      const service = new CompanyAnalysisService({ provider: stubProvider() });
      const job = await createTestJob({
        organizationId: ctx.organizationId,
        subjectId: companyId,
        payload: { companyId, question: "Readable?" },
      });
      await service.runAnalysis(job);

      const analyses = await service.getAnalyses({
        organizationId: ctx.organizationId,
        companyId,
      });

      expect(analyses.length).toBeGreaterThan(0);
      expect(analyses.every((row) => row.companyId === companyId)).toBe(true);
    });

    it("returns nothing for another organization", async () => {
      const service = new CompanyAnalysisService({ provider: stubProvider() });

      const analyses = await service.getAnalyses({
        organizationId: otherOrganizationId,
        companyId,
      });

      expect(analyses).toHaveLength(0);
    });
  });

  describe("the job row after a run", () => {
    it("is left for the worker to update, not touched by the service", async () => {
      const service = new CompanyAnalysisService({ provider: stubProvider() });
      const job = await createTestJob({
        organizationId: ctx.organizationId,
        subjectId: companyId,
        payload: { companyId, question: "Who updates the status?" },
      });

      await service.runAnalysis(job);

      // Status bookkeeping belongs to `processJob`; keeping it out of the
      // service is what lets the service be called twice safely.
      const stored = await jobRepository.findById(job.id);
      expect(stored?.status).toBe(JOB_STATUS.PENDING);
    });
  });
});
