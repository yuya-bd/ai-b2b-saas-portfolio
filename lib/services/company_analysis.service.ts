import {
  type AnalysisProvider,
  type CompanyFacts,
  getAnalysisProvider,
} from "@/lib/ai";
import { ConflictError, NotFoundError } from "@/lib/api/errors";
import { JOB_STATUS, JOB_TYPE } from "@/lib/constants/jobs";
import { sendJobToQueue } from "@/lib/queue/sqs-client";
import {
  type CompanyEntity,
  type CompanyRepository,
  companyRepository,
} from "@/lib/repositories/company.repository";
import {
  type CompanyAnalysisEntity,
  type CompanyAnalysisFilter,
  type CompanyAnalysisRepository,
  companyAnalysisRepository,
} from "@/lib/repositories/company_analysis.repository";
import {
  type JobEntity,
  type JobRepository,
  jobRepository,
} from "@/lib/repositories/job.repository";
import { companyAnalysisPayloadSchema } from "@/lib/validations/company-analysis";

export interface RequestCompanyAnalysisParams {
  organizationId: string;
  companyId: string;
  question: string;
}

export interface CompanyAnalysisServiceDeps {
  analyses?: CompanyAnalysisRepository;
  companies?: CompanyRepository;
  jobs?: JobRepository;
  /**
   * Resolved lazily when absent, because reading the AI configuration can
   * throw and constructing this service must not.
   */
  provider?: AnalysisProvider;
}

/**
 * The two halves of the analysis pipeline.
 *
 * `requestAnalysis` runs in a request handler: it records the work and hands
 * it to the queue. `runAnalysis` runs in the worker: it calls the provider
 * and writes the result. They never run in the same process, and the `jobs`
 * row is the only thing they share.
 *
 * Dependencies arrive as an options object rather than the single positional
 * argument used elsewhere in this directory — there are four of them, and a
 * test usually wants to replace exactly one.
 */
export class CompanyAnalysisService {
  private deps: CompanyAnalysisServiceDeps;

  constructor(deps: CompanyAnalysisServiceDeps = {}) {
    this.deps = deps;
  }

  private analyses(): CompanyAnalysisRepository {
    return this.deps.analyses ?? companyAnalysisRepository;
  }

  private companies(): CompanyRepository {
    return this.deps.companies ?? companyRepository;
  }

  private jobs(): JobRepository {
    return this.deps.jobs ?? jobRepository;
  }

  private provider(): AnalysisProvider {
    return this.deps.provider ?? getAnalysisProvider();
  }

  /**
   * Record the work, then enqueue it — in that order.
   *
   * A message whose `jobs` row does not exist has nowhere to record its
   * outcome, and the worker can only reject it. A row whose message was never
   * sent is merely a PENDING job, which is visible and re-drivable. So the
   * failure that costs less is the one taken.
   */
  async requestAnalysis(
    params: RequestCompanyAnalysisParams,
  ): Promise<JobEntity> {
    const company = await this.companies().findById(
      params.companyId,
      params.organizationId,
    );
    if (!company) {
      throw new NotFoundError("Company not found");
    }

    const payload = companyAnalysisPayloadSchema.parse({
      companyId: company.id,
      question: params.question,
    });

    const job = await this.jobs().create({
      organizationId: params.organizationId,
      jobType: JOB_TYPE.COMPANY_ANALYSIS,
      status: JOB_STATUS.PENDING,
      subjectId: company.id,
      payload,
    });

    const queueMessageId = await sendJobToQueue({
      jobType: JOB_TYPE.COMPANY_ANALYSIS,
      jobId: job.id,
      payload,
      timestamp: new Date().toISOString(),
    });

    return (await this.jobs().update(job.id, { queueMessageId })) ?? job;
  }

  /**
   * Analyse the company named by an already-claimed job.
   *
   * Takes the row, not a queue message. Everything that decides what happens
   * — which tenant, which company, what question — is read from the database,
   * so a forged or replayed message cannot reach another tenant's data: the
   * worst it can do is name a `jobId`, and that row carries its own
   * `organizationId`.
   *
   * Safe to call twice for the same job. The second call re-reads the row the
   * first one wrote instead of inserting a duplicate, so a delivery that slips
   * past the status claim still cannot produce two analyses.
   */
  async runAnalysis(job: JobEntity): Promise<CompanyAnalysisEntity> {
    // `payload` is jsonb: the column's type says nothing about its contents.
    const payload = companyAnalysisPayloadSchema.parse(job.payload);

    const company = await this.companies().findById(
      payload.companyId,
      job.organizationId,
    );
    if (!company) {
      throw new NotFoundError("Company not found");
    }

    const outcome = await this.provider().analyze({
      question: payload.question,
      facts: toCompanyFacts(company),
    });

    const created = await this.analyses().createIfAbsent({
      organizationId: job.organizationId,
      companyId: company.id,
      jobId: job.id,
      question: payload.question,
      summary: outcome.result.summary,
      keyPoints: outcome.result.keyPoints,
      sentiment: outcome.result.sentiment,
      confidence: outcome.result.confidence,
      provider: outcome.provider,
      model: outcome.model,
      inputTokens: outcome.inputTokens,
      outputTokens: outcome.outputTokens,
    });

    if (created) {
      return created;
    }

    // The unique constraint rejected the insert, so a concurrent attempt got
    // there first. Its row is the answer.
    const existing = await this.analyses().findByJobId(
      job.id,
      job.organizationId,
    );
    if (!existing) {
      throw new ConflictError("Analysis already recorded but not readable");
    }
    return existing;
  }

  async getAnalyses(
    filter: CompanyAnalysisFilter,
    options?: { limit?: number },
  ): Promise<CompanyAnalysisEntity[]> {
    return await this.analyses().findMany(filter, options);
  }
}

/**
 * Projects a row onto the fields that may be sent to a third-party model.
 *
 * Written out field by field on purpose. A spread would quietly widen what
 * leaves the system every time the table grows a column — see the note on
 * `CompanyFacts` for which of today's columns are held back and why.
 */
export function toCompanyFacts(company: CompanyEntity): CompanyFacts {
  return {
    name: company.name,
    country: company.country,
    foundedYear: company.foundedYear,
    description: company.description,
    website: company.website,
    status: company.status,
  };
}

export const companyAnalysisService = new CompanyAnalysisService();
