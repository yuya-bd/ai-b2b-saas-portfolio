import { companyAnalysisResultSchema } from "@/lib/validations/company-analysis";
import type {
  AnalysisProvider,
  AnalysisProviderResult,
  AnalysisRequest,
} from "./analysis-provider.interface";
import { type AiConfig, getAiConfig } from "./config";

/**
 * An analysis provider that calls nothing.
 *
 * The counterpart to `USE_MOCK_SQS` and the dev email sender: a fresh
 * checkout can run the whole queue-to-database pipeline, and the test suite
 * can assert on what gets written, with no API key and no spend.
 *
 * Its output is derived from the request, so the same input always produces
 * the same row — a test can assert on exact values rather than on shapes.
 * It also validates its own output against the shared schema, so the stand-in
 * cannot drift away from the contract the real provider is held to.
 */
export class MockAnalysisProvider implements AnalysisProvider {
  readonly name = "mock";

  private config: AiConfig;

  constructor(config?: AiConfig) {
    this.config = config ?? getAiConfig();
  }

  async analyze(request: AnalysisRequest): Promise<AnalysisProviderResult> {
    const { facts, question } = request;

    const keyPoints = [
      `Name on file: ${facts.name}`,
      `Status on file: ${facts.status}`,
      facts.country ? `Country on file: ${facts.country}` : null,
      facts.foundedYear ? `Founded: ${facts.foundedYear}` : null,
    ]
      .filter((point): point is string => point !== null)
      .slice(0, 10);

    const result = companyAnalysisResultSchema.parse({
      summary: `Mock analysis of ${facts.name} for the question: ${question}`,
      keyPoints,
      sentiment: "neutral",
      // Fixed and low, so a mock result is recognisable as one in the data.
      confidence: 50,
    });

    return {
      result,
      provider: this.name,
      model: `${this.config.model} (mock)`,
      inputTokens: null,
      outputTokens: null,
    };
  }
}
