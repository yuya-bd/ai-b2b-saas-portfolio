import type { AnalysisProvider } from "./analysis-provider.interface";
import { AnthropicAnalysisProvider } from "./anthropic-provider";
import { type AiConfig, getAiConfig } from "./config";
import { MockAnalysisProvider } from "./mock-provider";

/** The only place a concrete provider is named. */
export function createAnalysisProvider(config?: AiConfig): AnalysisProvider {
  const resolved = config ?? getAiConfig();

  if (resolved.provider === "anthropic") {
    return new AnthropicAnalysisProvider(resolved);
  }

  return new MockAnalysisProvider(resolved);
}

let cached: AnalysisProvider | null = null;

/**
 * Resolved on first use rather than at import.
 *
 * `lib/email/index.ts` exports an eagerly-constructed sender, and that is
 * fine there because its configuration cannot fail. This one can: reading the
 * config throws when `AI_PROVIDER` is unset in production. Doing that at
 * import time would take down every route that transitively imports this
 * module, including the ones that never analyse anything. Deferring turns a
 * misconfiguration into one failed job instead of a dead deployment.
 */
export function getAnalysisProvider(): AnalysisProvider {
  if (!cached) {
    cached = createAnalysisProvider();
  }
  return cached;
}

/** Tests that swap the environment need the memoised instance dropped. */
export function resetAnalysisProvider(): void {
  cached = null;
}

export type {
  AnalysisProvider,
  AnalysisProviderResult,
  AnalysisRequest,
  CompanyFacts,
} from "./analysis-provider.interface";
export type { AiConfig, AiEffort, AiProviderName } from "./config";
export { getAiConfig, hasAnthropicApiKey } from "./config";
export {
  type AiErrorCode,
  AiProviderError,
  describeError,
  describeErrorForJobRecord,
} from "./errors";
