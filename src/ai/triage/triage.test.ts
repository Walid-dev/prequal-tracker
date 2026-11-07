// Tests for one triage call with mock models: stored answers, capitalization slips, and every failure path.
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { sampleAnswer } from "@/samples/answers";
import { liveModel } from "./model";
import { runTriage, type TriageInput } from "./triage";

const USAGE = {
  inputTokens: {
    total: 1200,
    noCache: 1200,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 300, text: 300, reasoning: undefined },
};

/** A model that always answers with this text and finish reason. */
function modelAnswering(
  text: string,
  unified: "stop" | "length" | "error" | "other" = "stop",
  raw = "end_turn",
) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified, raw },
      usage: USAGE,
      warnings: [],
    }),
  });
}

/** Builds the input for a sample answer. */
function inputFor(
  sampleId: string,
  extra: Partial<TriageInput> = {},
): TriageInput {
  const sample = sampleAnswer(sampleId);
  return {
    companyName: sample.companyName,
    trade: sample.trade,
    requestTitle: "Request",
    requestInstructions: "Send the details.",
    answer: sample.body,
    today: "2026-11-07",
    mode: "mock",
    modelId: "anthropic:claude-opus-5",
    ...extra,
  };
}

const VALID = JSON.stringify({
  completeness: "Partial",
  summary: "Coverage is low.",
  facts: {
    expiryDate: "2027-04-30",
    expiryQuote: "expires 2027-04-30",
    coverageAmount: 1000000,
    holderName: "Tidewater Plumbing Inc.",
  },
  flags: [
    { code: "COVERAGE_BELOW_REQUIREMENT", quote: "$1,000,000 per occurrence" },
  ],
  followUpQuestions: ["Can you raise coverage?"],
});

describe("runTriage", () => {
  it("uses the stored mock answer, and the rules catch its deliberate mistake", async () => {
    const outcome = await runTriage(inputFor("wsib-expired"));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.modelCompleteness).toBe("complete");
    expect(outcome.result.completeness).toBe("partial");
    expect(outcome.costUsd).toBe(0);
  });

  it("does not let an obeyed injection through: flagged and capped at partial", async () => {
    const outcome = await runTriage(inputFor("safety-injection"));
    expect(outcome.ok && outcome.result.completeness).toBe("partial");
    expect(
      outcome.ok &&
        outcome.result.flags.some(
          (flag) => flag.code === "suspicious_instructions",
        ),
    ).toBe(true);
  });

  it("accepts capitalized list values, and prices live usage", async () => {
    const outcome = await runTriage(
      inputFor("cgl-low-coverage", {
        mode: "live",
        model: modelAnswering(VALID),
      }),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.completeness).toBe("partial");
    expect(outcome.result.flags[0].code).toBe("coverage_below_requirement");
    // 1,200 input and 300 output tokens on Opus 5 at $5 / $25 per million.
    expect(outcome.costUsd).toBeCloseTo(0.0135, 6);
  });

  it("puts the answer alone in the user message, and our rules in the instructions", async () => {
    const model = modelAnswering(VALID);
    await runTriage(inputFor("cgl-low-coverage", { model }));
    const prompt = model.doGenerateCalls[0].prompt;
    expect(prompt[0].role).toBe("system");
    expect(JSON.stringify(prompt[0])).not.toContain("Harbourview");
    expect(JSON.stringify(prompt[1])).toContain("<answer>");
  });

  it("fails cleanly when the answer doesn't match the schema", async () => {
    const outcome = await runTriage(
      inputFor("cgl-complete", {
        model: modelAnswering('{"completeness":"maybe"}'),
      }),
    );
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.error).toMatch(/didn't match/);
  });

  it("fails cleanly when the answer was cut off", async () => {
    const outcome = await runTriage(
      inputFor("cgl-complete", {
        model: modelAnswering('{"completeness":"comp', "length", "max_tokens"),
      }),
    );
    expect(!outcome.ok && outcome.error).toMatch(/cut off/);
  });

  it("fails cleanly when the model refuses", async () => {
    const outcome = await runTriage(
      inputFor("cgl-complete", {
        model: modelAnswering(VALID, "stop", "refusal"),
      }),
    );
    expect(!outcome.ok && outcome.error).toMatch(/declined/);
  });

  it("fails cleanly when the provider errors", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error("overloaded");
      },
    });
    const outcome = await runTriage(inputFor("cgl-complete", { model }));
    expect(!outcome.ok && outcome.error).toMatch(/AI call failed/);
  });

  it("fails closed when the call ends with an error or an unknown reason, even with valid JSON (R2)", async () => {
    for (const reason of ["error", "other"] as const) {
      const outcome = await runTriage(
        inputFor("cgl-low-coverage", {
          model: modelAnswering(VALID, reason, reason),
        }),
      );
      expect(outcome.ok).toBe(false);
      expect(!outcome.ok && outcome.error).toMatch(/stopped unexpectedly/);
    }
  });

  it("caps an answer too long to send in full at partial (R3)", async () => {
    // Neutral facts, so only the truncation rule can lower this result.
    const complete = JSON.stringify({
      ...JSON.parse(VALID),
      completeness: "complete",
      facts: {
        expiryDate: null,
        expiryQuote: null,
        coverageAmount: null,
        holderName: null,
      },
      flags: [],
    });
    const outcome = await runTriage(
      inputFor("cgl-low-coverage", {
        answer: `${"Details. ".repeat(2500)}The certificate expired last year.`,
        model: modelAnswering(complete),
      }),
    );
    expect(outcome.inputTruncated).toBe(true);
    expect(outcome.ok && outcome.result.completeness).toBe("partial");
    expect(outcome.ok && outcome.result.ruleNotes.join(" ")).toMatch(
      /too long to read in full/,
    );
  });

  it("turns a mistyped AI_MODEL into a failed run with a clear reason", async () => {
    const outcome = await runTriage(
      inputFor("cgl-complete", { mode: "live", modelId: "claude-sonnet-5" }),
    );
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.error).toMatch(/provider:model/);
  });
});

describe("liveModel", () => {
  it("resolves any registered provider from one provider:model setting", () => {
    expect(liveModel("openai:gpt-6-sol")).toMatchObject({
      modelId: "gpt-6-sol",
    });
    expect(liveModel("anthropic:claude-sonnet-5")).toMatchObject({
      modelId: "claude-sonnet-5",
    });
  });
});
