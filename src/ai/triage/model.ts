// Which model answers. One setting picks the provider and the model: AI_MODEL="provider:model",
// for example "anthropic:claude-sonnet-5" or "openai:gpt-6-sol". Each provider reads its own key
// (ANTHROPIC_API_KEY, OPENAI_API_KEY). Adding a provider is one package and one entry in the registry.
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { createProviderRegistry, type LanguageModel } from "ai";

export type AiMode = "mock" | "live";

// Chosen from the eval (docs/eval): every case passed, at about $0.006 per triage.
export const DEFAULT_MODEL = "anthropic:claude-sonnet-5";

const registry = createProviderRegistry({ anthropic, openai });
const PROVIDERS = ["anthropic", "openai"] as const;
type Provider = (typeof PROVIDERS)[number];

// Dollars per million tokens, for the cost shown on each run. A model missing here still works:
// its cost shows as unknown. Update when prices change.
const PRICES: Record<string, { input: number; output: number }> = {
  "anthropic:claude-haiku-4-5": { input: 1, output: 5 },
  "anthropic:claude-sonnet-5": { input: 2, output: 10 },
  "anthropic:claude-opus-5": { input: 5, output: 25 },
};

// The lightest thinking setting each model handles cleanly for a short extraction.
// Models not listed use their provider's default.
const REASONING: Record<string, "none" | "low"> = {
  "anthropic:claude-sonnet-5": "none",
  "anthropic:claude-opus-5": "low",
};

/** Returns the live model for a "provider:model" id. Throws a clear error when the id has no known provider. */
export function liveModel(id: string): LanguageModel {
  const [provider, ...rest] = id.split(":");
  if (!PROVIDERS.includes(provider as Provider) || rest.join(":") === "") {
    throw new Error(
      `AI_MODEL must look like "provider:model", with provider ${PROVIDERS.join(" or ")}. Got "${id}".`,
    );
  }
  return registry.languageModel(id as `${Provider}:${string}`);
}

/** Returns the thinking setting for a model, or undefined to use the provider default. */
export function reasoningFor(id: string): "none" | "low" | undefined {
  return REASONING[id];
}

/** Returns the dollar cost of one call, or null when the model's price is unknown. */
export function costOf(
  id: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const price = PRICES[id];
  if (!price) return null;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
