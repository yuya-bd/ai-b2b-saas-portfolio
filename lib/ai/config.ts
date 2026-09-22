import { AiProviderError } from "./errors";

/**
 * Which implementation of `AnalysisProvider` runs, and how it is tuned.
 *
 * Shaped after `lib/email/config.ts`: one interface, several backends, and
 * the environment decides. A provider named here is the only thing above this
 * module that ever changes when the backend does.
 */
export type AiProviderName = "anthropic" | "mock";

/** Anthropic's most capable current model. Override per deployment, not here. */
const DEFAULT_MODEL = "claude-opus-5";

/**
 * A summary from a handful of structured facts is not a hard reasoning task,
 * so this sits below the API default of `high`. Raise it per deployment if the
 * questions asked get harder.
 */
const DEFAULT_EFFORT = "medium";

/**
 * Generous for a response this small. The cap exists to stop a runaway
 * generation, not to shape the answer — a truncated response fails schema
 * validation and costs a retry, which is worse than a few unused tokens.
 */
const DEFAULT_MAX_OUTPUT_TOKENS = 16000;

/** The SDK retries 429 and 5xx itself; this is how many times. */
const DEFAULT_MAX_RETRIES = 2;

/**
 * Comfortably inside the queue's 300s visibility timeout, so a slow call
 * fails on our terms rather than by the message becoming visible again and
 * being processed a second time.
 */
const DEFAULT_TIMEOUT_MS = 120_000;

export type AiEffort = "low" | "medium" | "high" | "xhigh" | "max";

export interface AiConfig {
  provider: AiProviderName;
  model: string;
  effort: AiEffort;
  maxOutputTokens: number;
  maxRetries: number;
  timeoutMs: number;
}

function positiveIntFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Resolves the provider, defaulting to the mock outside production.
 *
 * The default mirrors the email module's: a fresh checkout can exercise the
 * whole pipeline with nothing configured and no spend. Production is the
 * exception — there, an unset `AI_PROVIDER` is a misconfiguration rather than
 * a convenience, because silently writing mock analyses into a real tenant's
 * database is worse than failing the job.
 */
function resolveProviderName(): AiProviderName {
  const configured = process.env.AI_PROVIDER;

  if (configured === "anthropic" || configured === "mock") {
    return configured;
  }

  if (configured) {
    throw new AiProviderError(
      "not_configured",
      `Unknown AI_PROVIDER "${configured}"`,
      false,
    );
  }

  if (process.env.NODE_ENV === "production") {
    throw new AiProviderError(
      "not_configured",
      "AI_PROVIDER must be set in production",
      false,
    );
  }

  return "mock";
}

export function getAiConfig(): AiConfig {
  return {
    provider: resolveProviderName(),
    model: process.env.AI_MODEL || DEFAULT_MODEL,
    effort: (process.env.AI_EFFORT || DEFAULT_EFFORT) as AiEffort,
    maxOutputTokens: positiveIntFromEnv(
      "AI_MAX_OUTPUT_TOKENS",
      DEFAULT_MAX_OUTPUT_TOKENS,
    ),
    maxRetries: positiveIntFromEnv("AI_MAX_RETRIES", DEFAULT_MAX_RETRIES),
    timeoutMs: positiveIntFromEnv("AI_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
  };
}

/**
 * Whether a credential is present — never the credential.
 *
 * Nothing in this module returns the key, and no caller needs it: the SDK
 * reads `ANTHROPIC_API_KEY` from the environment itself. A status line, a
 * health check or a startup banner asks this instead, so that none of them
 * can print the value by accident.
 */
export function hasAnthropicApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
