// Runs one triage: builds the prompt, makes one structured call, applies the rules, and reports cost and time.
// It knows nothing about the database. The caller decides what to save.
import {
  type FinishReason,
  generateText,
  type LanguageModel,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
} from "ai";
import { mockModelFor } from "./fixtures";
import { type AiMode, costOf, liveModel, reasoningFor } from "./model";
import {
  buildAnswerMessage,
  buildInstructions,
  PROMPT_VERSION,
  type TriageRequest,
} from "./prompt";
import { applyRules, type TriageResult } from "./rules";
import { type Completeness, triageOutputSchema } from "./schema";

export const TIMEOUT_MS = 30_000;

export type TriageInput = TriageRequest & {
  answer: string;
  /** Today's date as YYYY-MM-DD. Passed in, so tests and the eval never go stale. */
  today: string;
  mode: AiMode;
  modelId: string;
  /** Overrides the model, for tests. */
  model?: LanguageModel;
};

type RunInfo = {
  input: string;
  inputTruncated: boolean;
  mode: AiMode;
  model: string;
  promptVersion: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
};

export type TriageOutcome =
  | (RunInfo & {
      ok: true;
      modelCompleteness: Completeness;
      result: TriageResult;
    })
  | (RunInfo & { ok: false; error: string });

/** Triage one answer against its request. Never throws: every failure comes back as ok: false with a reason. */
export async function runTriage(input: TriageInput): Promise<TriageOutcome> {
  const instructions = buildInstructions(input, input.today);
  const message = buildAnswerMessage(input.answer);
  const modelName = input.mode === "mock" ? "mock-fixtures" : input.modelId;
  const model =
    input.model ??
    (input.mode === "mock"
      ? mockModelFor(input.answer)
      : liveModel(input.modelId));
  const reasoning =
    input.mode === "live" ? reasoningFor(input.modelId) : undefined;
  const started = Date.now();

  const info = (inputTokens?: number, outputTokens?: number): RunInfo => ({
    input: `${instructions}\n\n--- user message ---\n${message.text}`,
    inputTruncated: message.truncated,
    mode: input.mode,
    model: modelName,
    promptVersion: PROMPT_VERSION,
    latencyMs: Date.now() - started,
    inputTokens: inputTokens ?? null,
    outputTokens: outputTokens ?? null,
    costUsd:
      input.mode === "mock"
        ? 0
        : inputTokens !== undefined && outputTokens !== undefined
          ? costOf(input.modelId, inputTokens, outputTokens)
          : null,
  });

  try {
    const result = await generateText({
      model,
      instructions,
      messages: [{ role: "user", content: message.text }],
      output: Output.object({ schema: triageOutputSchema }),
      maxOutputTokens: 4000,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      ...(reasoning ? { reasoning } : {}),
    });
    const run = info(result.usage.inputTokens, result.usage.outputTokens);
    // Check how the call ended before trusting the output: only a normal stop is a result.
    const problem = finishProblem(result.finishReason, result.rawFinishReason);
    if (problem) return { ...run, ok: false, error: problem };
    const output = result.output;
    return {
      ...run,
      ok: true,
      modelCompleteness: output.completeness,
      result: applyRules(output, input.answer, input.today, message.truncated),
    };
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      const run = info(error.usage?.inputTokens, error.usage?.outputTokens);
      return {
        ...run,
        ok: false,
        error:
          (error.finishReason
            ? finishProblem(error.finishReason, undefined)
            : undefined) ??
          "The model's answer didn't match the expected format. Review this answer by hand.",
      };
    }
    return { ...info(), ok: false, error: describeError(error) };
  }
}

/** Explains why a finish is not a usable result. Only a normal stop is accepted: everything else fails closed. */
function finishProblem(
  reason: FinishReason | undefined,
  raw: string | undefined,
): string | undefined {
  if (raw === "refusal")
    return "The model declined to answer. Review this answer by hand.";
  if (reason === "length")
    return "The model's answer was cut off at its length limit. Review this answer by hand.";
  if (reason === "content-filter")
    return "A content filter stopped the answer. Review this answer by hand.";
  if (reason !== "stop")
    return `The model stopped unexpectedly (${reason ?? "no reason given"}). Review this answer by hand.`;
  return undefined;
}

/** Turns any other failure into a short reason a reviewer can read. */
function describeError(error: unknown): string {
  if (NoOutputGeneratedError.isInstance(error))
    return "The model returned no result. Review this answer by hand.";
  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return `No answer within ${TIMEOUT_MS / 1000} seconds. Review this answer by hand.`;
  }
  if (error instanceof Error) return `The AI call failed: ${error.message}`;
  return "The AI call failed.";
}
