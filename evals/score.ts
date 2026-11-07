// Scores eval runs against the expected answers, and writes the report. Pure functions, so they're unit tested.
import type { Completeness, FlagCode } from "@/ai/triage/schema";
import type { TriageOutcome } from "@/ai/triage/triage";

export type EvalCase = {
  id: string;
  note: string;
  expected: {
    completeness: Completeness[];
    requiredFlags: FlagCode[];
    forbiddenFlags: FlagCode[];
  };
};

export type Score = {
  caseId: string;
  model: string;
  run: number;
  schemaValid: boolean;
  completeness: Completeness | null;
  modelAloneOk: boolean;
  missingFlags: FlagCode[];
  forbiddenHits: FlagCode[];
  ruleChanged: boolean;
  droppedQuotes: number;
  pass: boolean;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  error?: string;
};

export type ModelSummary = {
  model: string;
  runs: number;
  passed: number;
  modelAloneOk: number;
  schemaValid: number;
  ruleChanged: number;
  droppedQuotes: number;
  meanLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

/** Scores one run of one case. A pass needs a valid result, an expected completeness, every required flag, and no forbidden flag. */
export function scoreRun(
  evalCase: EvalCase,
  model: string,
  run: number,
  outcome: TriageOutcome,
): Score {
  const usage = {
    latencyMs: outcome.latencyMs,
    inputTokens: outcome.inputTokens ?? 0,
    outputTokens: outcome.outputTokens ?? 0,
    costUsd: outcome.costUsd ?? 0,
  };
  if (!outcome.ok) {
    return {
      caseId: evalCase.id,
      model,
      run,
      schemaValid: false,
      completeness: null,
      modelAloneOk: false,
      missingFlags: evalCase.expected.requiredFlags,
      forbiddenHits: [],
      ruleChanged: false,
      droppedQuotes: 0,
      pass: false,
      error: outcome.error,
      ...usage,
    };
  }
  const { result } = outcome;
  const codes = new Set(result.flags.map((flag) => flag.code));
  const missingFlags = evalCase.expected.requiredFlags.filter(
    (code) => !codes.has(code),
  );
  const forbiddenHits = evalCase.expected.forbiddenFlags.filter((code) =>
    codes.has(code),
  );
  const dropped = result.ruleNotes
    .map((note) => note.match(/Dropped (\d+) flag/)?.[1])
    .find(Boolean);
  const completenessOk = evalCase.expected.completeness.includes(
    result.completeness,
  );
  return {
    caseId: evalCase.id,
    model,
    run,
    schemaValid: true,
    completeness: result.completeness,
    modelAloneOk: evalCase.expected.completeness.includes(
      outcome.modelCompleteness,
    ),
    missingFlags,
    forbiddenHits,
    ruleChanged: outcome.modelCompleteness !== result.completeness,
    droppedQuotes: dropped ? Number(dropped) : 0,
    pass:
      completenessOk && missingFlags.length === 0 && forbiddenHits.length === 0,
    ...usage,
  };
}

/** Adds up the scores for each model. */
export function summarize(scores: Score[]): ModelSummary[] {
  const models = [...new Set(scores.map((score) => score.model))];
  return models.map((model) => {
    const mine = scores.filter((score) => score.model === model);
    const count = (test: (score: Score) => boolean) => mine.filter(test).length;
    const sum = (pick: (score: Score) => number) =>
      mine.reduce((total, score) => total + pick(score), 0);
    return {
      model,
      runs: mine.length,
      passed: count((score) => score.pass),
      modelAloneOk: count((score) => score.modelAloneOk),
      schemaValid: count((score) => score.schemaValid),
      ruleChanged: count((score) => score.ruleChanged),
      droppedQuotes: sum((score) => score.droppedQuotes),
      meanLatencyMs: mine.length
        ? Math.round(sum((score) => score.latencyMs) / mine.length)
        : 0,
      inputTokens: sum((score) => score.inputTokens),
      outputTokens: sum((score) => score.outputTokens),
      costUsd: sum((score) => score.costUsd),
    };
  });
}

/** Writes the Markdown report: what was run, the totals per model, and every case. */
export function renderReport(
  meta: {
    date: string;
    mode: string;
    promptVersion: string;
    runsPerCase: number;
    evalToday: string;
  },
  cases: EvalCase[],
  scores: Score[],
): string {
  const summaries = summarize(scores);
  const lines = [
    `# Eval report, ${meta.date}`,
    "",
    `Mode: ${meta.mode}. Prompt: \`${meta.promptVersion}\`. ${cases.length} cases, ${meta.runsPerCase} run(s) each per model. The eval date is ${meta.evalToday}, so expiry checks don't change over time.`,
    "",
    "This is a regression check on known cases, not proof of robustness. Counts, not percentages, because the sample is small.",
    "",
    "## Totals",
    "",
    "| Model | Passed | Model alone | Schema-valid | Rule changed result | Quotes dropped | Mean latency | Tokens in / out | Cost |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...summaries.map(
      (s) =>
        `| ${s.model} | ${s.passed} of ${s.runs} | ${s.modelAloneOk} of ${s.runs} | ${s.schemaValid} of ${s.runs} | ${s.ruleChanged} | ${s.droppedQuotes} | ${(s.meanLatencyMs / 1000).toFixed(1)} s | ${s.inputTokens} / ${s.outputTokens} | $${s.costUsd.toFixed(4)} |`,
    ),
    "",
    '"Model alone" counts runs where the model\'s own completeness was acceptable, before the rules in code. "Passed" is the final result after the rules, and also needs the right flags.',
    "",
    "## Cases",
    "",
  ];
  for (const evalCase of cases) {
    lines.push(`### ${evalCase.id}`, "", evalCase.note, "");
    lines.push(
      `Expected: ${evalCase.expected.completeness.join(" or ")}` +
        (evalCase.expected.requiredFlags.length
          ? `, with ${evalCase.expected.requiredFlags.join(", ")}`
          : "") +
        ".",
      "",
      "| Model | Run | Result | Pass | Notes |",
      "| --- | --- | --- | --- | --- |",
    );
    for (const score of scores.filter((item) => item.caseId === evalCase.id)) {
      const notes = [
        score.error,
        score.missingFlags.length
          ? `missing ${score.missingFlags.join(", ")}`
          : "",
        score.forbiddenHits.length
          ? `unexpected ${score.forbiddenHits.join(", ")}`
          : "",
        score.ruleChanged ? "rule changed the result" : "",
        score.droppedQuotes ? `${score.droppedQuotes} quote(s) dropped` : "",
      ]
        .filter(Boolean)
        .join("; ");
      lines.push(
        `| ${score.model} | ${score.run} | ${score.completeness ?? "failed"} | ${score.pass ? "yes" : "no"} | ${notes} |`,
      );
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
