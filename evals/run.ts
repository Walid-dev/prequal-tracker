// Runs the eval: every case through the real triage module, scored against the expected answers.
// Mock mode (default) needs no key and runs in CI. Live mode calls the model and costs money:
//   npm run eval
//   npm run eval:live -- --models=anthropic:claude-sonnet-5,openai:gpt-6-sol --runs=2 --out=docs/eval/report.md
import { writeFileSync } from "node:fs";
import { DEFAULT_MODEL } from "@/ai/triage/model";
import { PROMPT_VERSION } from "@/ai/triage/prompt";
import { runTriage } from "@/ai/triage/triage";
import { checklistFor, TRADE_LABELS } from "@/domain/checklists";
import { sampleAnswer } from "@/samples/answers";
import cases from "./cases.json";
import {
  type EvalCase,
  renderReport,
  type Score,
  scoreRun,
  summarize,
} from "./score";

// A fixed date, so the expired-certificate case gives the same answer whenever the eval runs.
const EVAL_TODAY = "2026-11-07";
const CONCURRENCY = 4;

/** Reads --name=value flags. */
function flag(name: string, fallback: string): string {
  const found = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

async function main() {
  const live = process.argv.includes("--live");
  const models = live
    ? flag("models", DEFAULT_MODEL).split(",")
    : ["mock-fixtures"];
  const runs = Number(flag("runs", live ? "2" : "1"));
  const out = flag("out", "");
  const evalCases = cases as EvalCase[];

  const jobs = models.flatMap((model) =>
    evalCases.flatMap((evalCase) =>
      Array.from({ length: runs }, (_, index) => ({
        model,
        evalCase,
        run: index + 1,
      })),
    ),
  );
  const scores: Score[] = [];
  let next = 0;
  // A small pool, so a live run finishes in minutes without hitting rate limits.
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const sample = sampleAnswer(job.evalCase.id);
      const item = checklistFor(sample.trade).find(
        (entry) => entry.kind === sample.kind,
      );
      if (!item)
        throw new Error(`No checklist item ${sample.kind} for ${sample.trade}`);
      const outcome = await runTriage({
        companyName: sample.companyName,
        trade: TRADE_LABELS[sample.trade],
        requestTitle: item.title,
        requestInstructions: item.instructions,
        answer: sample.body,
        today: EVAL_TODAY,
        mode: live ? "live" : "mock",
        modelId: job.model,
      });
      scores.push(scoreRun(job.evalCase, job.model, job.run, outcome));
      process.stdout.write(".");
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  process.stdout.write("\n");

  // Keep the report in a stable order: by model, then case, then run.
  const order = (score: Score) =>
    `${models.indexOf(score.model)}-${evalCases.findIndex((c) => c.id === score.caseId)}-${score.run}`;
  scores.sort((a, b) =>
    order(a).localeCompare(order(b), undefined, { numeric: true }),
  );

  for (const summary of summarize(scores)) {
    console.log(
      `${summary.model}: passed ${summary.passed} of ${summary.runs}, model alone ${summary.modelAloneOk} of ${summary.runs}, schema-valid ${summary.schemaValid}, cost $${summary.costUsd.toFixed(4)}`,
    );
  }
  for (const score of scores.filter((item) => !item.pass)) {
    console.log(
      `  FAIL ${score.model} ${score.caseId} run ${score.run}: ${score.completeness ?? score.error}`,
    );
  }
  if (out) {
    const report = renderReport(
      {
        date: new Date().toLocaleDateString("en-CA"),
        mode: live ? "live" : "mock",
        promptVersion: PROMPT_VERSION,
        runsPerCase: runs,
        evalToday: EVAL_TODAY,
      },
      evalCases,
      scores,
    );
    writeFileSync(out, report);
    console.log(`Report written to ${out}`);
  }
  // In mock mode every case must pass, so CI fails when the pipeline or the rules break.
  if (!live && scores.some((score) => !score.pass)) process.exitCode = 1;
}

main();
