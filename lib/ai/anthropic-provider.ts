import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { companyAnalysisResultSchema } from "@/lib/validations/company-analysis";
import { systemPrompt, userPrompt } from "./analysis-prompt";
import type {
  AnalysisProvider,
  AnalysisProviderResult,
  AnalysisRequest,
} from "./analysis-provider.interface";
import { type AiConfig, getAiConfig, hasAnthropicApiKey } from "./config";
import { AiProviderError } from "./errors";

/**
 * Analysis backed by the Anthropic Messages API.
 *
 * Two decisions worth knowing about:
 *
 * The response is constrained by `companyAnalysisResultSchema`, passed
 * through `zodOutputFormat`. The model is given the schema, the SDK parses
 * against it, and `parsed_output` is either the typed object or null. No code
 * downstream reads prose and hopes.
 *
 * Retries are the SDK's. It already retries 408/409/429/5xx and connection
 * failures with backoff; a second retry loop here would multiply the two and
 * turn a rate limit into a much larger bill. What this class adds is the
 * classification the SDK cannot make — whether a failure that survived the
 * retries is worth the worker trying again at all.
 */
export class AnthropicAnalysisProvider implements AnalysisProvider {
  readonly name = "anthropic";

  private config: AiConfig;
  private client: Anthropic | null = null;

  constructor(config?: AiConfig) {
    this.config = config ?? getAiConfig();
  }

  /**
   * Built on first use, not in the constructor.
   *
   * The worker loads its environment with dotenv after modules are imported,
   * so a client constructed at import time would read `ANTHROPIC_API_KEY`
   * before it exists. `lib/queue/sqs-client.ts` defers for the same reason.
   */
  private getClient(): Anthropic {
    if (this.client) return this.client;

    if (!hasAnthropicApiKey()) {
      throw new AiProviderError(
        "not_configured",
        "ANTHROPIC_API_KEY is not set",
        false,
      );
    }

    // The key is read from the environment by the SDK. It is never passed
    // through this codebase, so there is no variable holding it to leak.
    this.client = new Anthropic({
      maxRetries: this.config.maxRetries,
      timeout: this.config.timeoutMs,
    });

    return this.client;
  }

  /**
   * Separated so the response type is inferred from the call rather than
   * spelled out, and so the catch wraps exactly the network boundary and
   * nothing else — a `toProviderError` around the schema handling below
   * would relabel our own errors as the provider's.
   */
  private async call(request: AnalysisRequest) {
    const client = this.getClient();

    try {
      return await client.messages.parse({
        model: this.config.model,
        max_tokens: this.config.maxOutputTokens,
        system: systemPrompt(),
        messages: [{ role: "user", content: userPrompt(request) }],
        output_config: {
          effort: this.config.effort,
          format: zodOutputFormat(companyAnalysisResultSchema),
        },
      });
    } catch (error) {
      throw toProviderError(error);
    }
  }

  async analyze(request: AnalysisRequest): Promise<AnalysisProviderResult> {
    const response = await this.call(request);

    /**
     * A safety decline arrives as a successful response, not an exception:
     * HTTP 200, `stop_reason: "refusal"`, and no usable content. Reading
     * `parsed_output` first would surface it as a confusing schema failure.
     */
    if (response.stop_reason === "refusal") {
      throw new AiProviderError(
        "refused",
        "The model declined to answer this question",
        false,
      );
    }

    const parsed = response.parsed_output;
    if (!parsed) {
      /**
       * Not retryable, deliberately. With a schema attached this should not
       * happen, so when it does the likely cause is a schema the model cannot
       * satisfy — and that fails identically on every retry while billing for
       * each one. Failing the job leaves it re-drivable by hand once someone
       * has looked.
       */
      throw new AiProviderError(
        "invalid_output",
        "Model response did not match the analysis schema",
        false,
      );
    }

    return {
      result: parsed,
      provider: this.name,
      model: response.model ?? this.config.model,
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
    };
  }
}

/**
 * Maps an SDK failure onto the one question the worker needs answered.
 *
 * Checked most specific first, as the SDK's error classes are a hierarchy.
 * Note what is *not* here: the provider's message. It can carry the prompt
 * that was sent, and this error is on its way to a log line.
 */
function toProviderError(error: unknown): AiProviderError {
  if (error instanceof AiProviderError) return error;

  if (error instanceof Anthropic.RateLimitError) {
    return new AiProviderError("rate_limited", "Provider rate limit", true);
  }

  if (error instanceof Anthropic.AuthenticationError) {
    // A bad key is not fixed by waiting, and every retry is another request.
    return new AiProviderError(
      "authentication_failed",
      "Provider rejected the credentials",
      false,
    );
  }

  if (error instanceof Anthropic.PermissionDeniedError) {
    return new AiProviderError(
      "authentication_failed",
      "Provider denied access to this model",
      false,
    );
  }

  if (error instanceof Anthropic.BadRequestError) {
    return new AiProviderError(
      "invalid_request",
      "Provider rejected the request as malformed",
      false,
    );
  }

  if (error instanceof Anthropic.APIConnectionError) {
    return new AiProviderError(
      "upstream_unavailable",
      "Could not reach the provider",
      true,
    );
  }

  if (error instanceof Anthropic.APIError) {
    // Anything 5xx is worth another attempt; the rest is not.
    const retryable = typeof error.status === "number" && error.status >= 500;
    return new AiProviderError(
      retryable ? "upstream_unavailable" : "invalid_request",
      `Provider returned status ${error.status ?? "unknown"}`,
      retryable,
    );
  }

  return new AiProviderError("unknown", "Provider call failed", false);
}
