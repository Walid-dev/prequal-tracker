// Which model answers, its thinking setting, and what each call costs.
import { anthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

export type AiMode = "mock" | "live";

export const DEFAULT_MODEL = "claude-opus-5";

// Dollars per million tokens. From Anthropic's published model pricing. Update when prices change.
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-opus-5": { input: 5, output: 25 },
};

// The lightest thinking setting each model handles cleanly for a short extraction.
// Opus 5 keeps thinking on at low effort, because turning it off has documented failure modes.
const REASONING: Record<string, "none" | "low"> = {
  "claude-sonnet-5": "none",
  "claude-opus-5": "low",
};

/** Returns the live Claude model for an id. The key comes from ANTHROPIC_API_KEY. */
export function liveModel(modelId: string): LanguageModel {
  return anthropic(modelId);
}

/** Returns the thinking setting for a model, or undefined to use the provider default. */
export function reasoningFor(modelId: string): "none" | "low" | undefined {
  return REASONING[modelId];
}

/** Returns the dollar cost of one call, or null when the model's price is unknown. */
export function costOf(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const price = PRICES[modelId];
  if (!price) return null;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
