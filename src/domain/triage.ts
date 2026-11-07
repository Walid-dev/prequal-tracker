// Runs AI triage on a request's latest answer and saves the run as an audit record.
// It only inserts triage runs. It never changes a request's status: only a reviewer does that.
import type { LanguageModel } from "ai";
import { desc, eq } from "drizzle-orm";
import { type AiMode, DEFAULT_MODEL } from "@/ai/triage/model";
import type { TriageResult } from "@/ai/triage/rules";
import { runTriage } from "@/ai/triage/triage";
import type { Db } from "@/db/client";
import {
  cases,
  requests,
  responses,
  type TriageRunRow,
  triageRuns,
} from "@/db/schema";
import { TRADE_LABELS } from "./checklists";
import { RuleError } from "./requests";

export type TriageSettings = {
  mode: AiMode;
  modelId: string;
  today: string;
  /** Overrides the model, for tests. */
  model?: LanguageModel;
};

/** Reads the AI settings from the environment. Mock is the default, so nothing costs money by accident. */
export function settingsFromEnv(now = new Date()): TriageSettings {
  return {
    mode: process.env.AI_MODE === "live" ? "live" : "mock",
    modelId: process.env.AI_MODEL || DEFAULT_MODEL,
    today: now.toLocaleDateString("en-CA"),
  };
}

/** Triages the latest answer on a request and saves the run, whether it worked or failed. Returns the run id. */
export async function triageLatestAnswer(
  db: Db,
  requestId: number,
  settings: TriageSettings,
): Promise<number> {
  const request = db
    .select()
    .from(requests)
    .where(eq(requests.id, requestId))
    .get();
  if (!request) throw new RuleError("This request doesn't exist.");
  const owner = db
    .select()
    .from(cases)
    .where(eq(cases.id, request.caseId))
    .get();
  if (!owner) throw new RuleError("This request has no case.");
  const latest = db
    .select()
    .from(responses)
    .where(eq(responses.requestId, requestId))
    .orderBy(desc(responses.id))
    .limit(1)
    .get();
  if (!latest) throw new RuleError("There is no answer to triage yet.");

  const outcome = await runTriage({
    companyName: owner.companyName,
    trade: TRADE_LABELS[owner.trade],
    requestTitle: request.title,
    requestInstructions: request.instructions,
    answer: latest.body,
    ...settings,
  });

  const saved = db
    .insert(triageRuns)
    .values({
      responseId: latest.id,
      status: outcome.ok ? "ok" : "failed",
      modelCompleteness: outcome.ok ? outcome.modelCompleteness : null,
      completeness: outcome.ok ? outcome.result.completeness : null,
      result: outcome.ok ? outcome.result : null,
      input: outcome.input,
      inputTruncated: outcome.inputTruncated,
      mode: outcome.mode,
      model: outcome.model,
      promptVersion: outcome.promptVersion,
      inputTokens: outcome.inputTokens,
      outputTokens: outcome.outputTokens,
      costUsd: outcome.costUsd,
      latencyMs: outcome.latencyMs,
      error: outcome.ok ? null : outcome.error,
    })
    .returning({ id: triageRuns.id })
    .get();

  // One structured log line per run, without the answer text, for monitoring cost, latency, and failures.
  console.info(
    JSON.stringify({
      event: "triage_run",
      runId: saved.id,
      requestId,
      status: outcome.ok ? "ok" : "failed",
      mode: outcome.mode,
      model: outcome.model,
      promptVersion: outcome.promptVersion,
      completeness: outcome.ok ? outcome.result.completeness : null,
      ruleChanges: outcome.ok ? outcome.result.ruleNotes.length : 0,
      inputTokens: outcome.inputTokens,
      outputTokens: outcome.outputTokens,
      costUsd: outcome.costUsd,
      latencyMs: outcome.latencyMs,
    }),
  );
  return saved.id;
}

/** Reads the stored result of a run. Returns null for failed runs. */
export function triageResultOf(run: TriageRunRow): TriageResult | null {
  return run.status === "ok" && run.result
    ? (run.result as TriageResult)
    : null;
}
