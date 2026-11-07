// Tests for eval scoring: what counts as a pass, and how runs add up per model.
import { describe, expect, it } from "vitest";
import type { TriageOutcome } from "@/ai/triage/triage";
import { type EvalCase, renderReport, scoreRun, summarize } from "./score";

const evalCase: EvalCase = {
  id: "wsib-expired",
  note: "Expired clearance.",
  expected: {
    completeness: ["partial"],
    requiredFlags: ["expired"],
    forbiddenFlags: ["suspicious_instructions"],
  },
};

const info = {
  input: "",
  inputTruncated: false,
  mode: "live" as const,
  model: "claude-haiku-4-5",
  promptVersion: "triage-v1",
  latencyMs: 4000,
  inputTokens: 1200,
  outputTokens: 200,
  costUsd: 0.0022,
};

/** An ok outcome with these final values. */
function ok(
  completeness: "complete" | "partial" | "insufficient",
  codes: string[],
  modelSaid = completeness,
  notes: string[] = [],
): TriageOutcome {
  return {
    ...info,
    ok: true,
    modelCompleteness: modelSaid,
    result: {
      completeness,
      summary: "",
      facts: {
        expiryDate: null,
        expiryQuote: null,
        coverageAmount: null,
        holderName: null,
      },
      flags: codes.map((code) => ({ code: code as "expired", quote: "x" })),
      followUpQuestions: [],
      ruleNotes: notes,
    },
  };
}

describe("scoreRun", () => {
  it("passes when completeness and flags match, and records that a rule changed the result", () => {
    const score = scoreRun(
      evalCase,
      "m",
      1,
      ok("partial", ["expired"], "complete", [
        "Dropped 2 flag(s) whose quote is not in the answer.",
      ]),
    );
    expect(score.pass).toBe(true);
    expect(score.modelAloneOk).toBe(false);
    expect(score.ruleChanged).toBe(true);
    expect(score.droppedQuotes).toBe(2);
  });

  it("fails on a missing required flag or a forbidden flag", () => {
    expect(scoreRun(evalCase, "m", 1, ok("partial", [])).missingFlags).toEqual([
      "expired",
    ]);
    expect(
      scoreRun(
        evalCase,
        "m",
        1,
        ok("partial", ["expired", "suspicious_instructions"]),
      ).pass,
    ).toBe(false);
  });

  it("fails a failed run, and keeps its error", () => {
    const score = scoreRun(evalCase, "m", 1, {
      ...info,
      ok: false,
      error: "timed out",
    });
    expect(score.pass).toBe(false);
    expect(score.schemaValid).toBe(false);
    expect(score.error).toBe("timed out");
  });
});

describe("summarize and renderReport", () => {
  it("adds up runs per model and writes every case", () => {
    const scores = [
      scoreRun(evalCase, "a", 1, ok("partial", ["expired"])),
      scoreRun(evalCase, "a", 2, ok("complete", [])),
    ];
    const [summary] = summarize(scores);
    expect(summary).toMatchObject({
      model: "a",
      runs: 2,
      passed: 1,
      schemaValid: 2,
      inputTokens: 2400,
    });
    const report = renderReport(
      {
        date: "2026-11-07",
        mode: "live",
        promptVersion: "triage-v1",
        runsPerCase: 2,
        evalToday: "2026-11-07",
      },
      [evalCase],
      scores,
    );
    expect(report).toContain("| a | 1 of 2 |");
    expect(report).toContain("### wsib-expired");
  });
});
