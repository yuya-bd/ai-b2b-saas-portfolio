import type { CompanyAnalysisResult } from "@/lib/validations/company-analysis";

/**
 * The company fields that may leave this system.
 *
 * An explicit allow-list, not the row. Passing `CompanyEntity` straight to a
 * third-party API would send whatever columns the table grows next, and some
 * of what it already holds has no business being in a prompt:
 *
 *   contactName          a named individual
 *   registrationNumber   a government identifier
 *   externalDatabaseUrl  a link into internal infrastructure
 *   documentStorageUrl   the same
 *
 * None of those help answer a question about the company, so none of them are
 * here. Adding a field to this interface is the moment to ask whether it
 * should be sent at all — which is the point of writing it out by hand.
 */
export interface CompanyFacts {
  name: string;
  country: string | null;
  foundedYear: number | null;
  description: string | null;
  website: string | null;
  status: string;
}

export interface AnalysisRequest {
  question: string;
  facts: CompanyFacts;
}

export interface AnalysisProviderResult {
  /** Already validated against `companyAnalysisResultSchema`. */
  result: CompanyAnalysisResult;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

/**
 * What the application depends on. Callers name this type, never a concrete
 * provider, so adding an OpenAI backend alongside the Anthropic one touches
 * only the factory in index.ts.
 */
export interface AnalysisProvider {
  readonly name: string;
  analyze(request: AnalysisRequest): Promise<AnalysisProviderResult>;
}
