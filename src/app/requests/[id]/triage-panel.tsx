// The AI triage note on the request page: what the model found, what the rules changed, and what the run cost.
import type { AiMode } from "@/ai/triage/model";
import type { FlagCode } from "@/ai/triage/schema";
import type { Completeness, TriageRunRow } from "@/db/schema";
import { triageResultOf } from "@/domain/triage";
import type { FormState } from "../actions";
import { RunTriageButton } from "./run-triage-button";

const FLAG_LABELS: Record<FlagCode, string> = {
  expired: "Expired",
  coverage_below_requirement: "Coverage below requirement",
  name_mismatch: "Name mismatch",
  missing_item: "Missing item",
  suspicious_instructions: "Suspicious instructions",
  unverifiable_claim: "Unverifiable claim",
};

const COMPLETENESS_STYLES: Record<Completeness, string> = {
  complete: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  partial: "bg-amber-50 text-amber-800 ring-amber-200",
  insufficient: "bg-red-50 text-red-800 ring-red-200",
};

type Props = {
  run?: TriageRunRow;
  hasAnswer: boolean;
  mode: AiMode;
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
};

/** Shows the latest triage of the latest answer, with a button to run it again. */
export function TriagePanel({ run, hasAnswer, mode, action }: Props) {
  const result = run ? triageResultOf(run) : null;

  return (
    <section className="rounded-lg border border-sky-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-500">AI triage</h2>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${mode === "live" ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-600"}`}
          >
            {mode === "live" ? "live model" : "mock answers"}
          </span>
        </div>
        {hasAnswer ? (
          <RunTriageButton action={action} hasRun={Boolean(run)} />
        ) : null}
      </div>

      {!hasAnswer ? (
        <p className="mt-2 text-sm text-slate-500">
          Triage runs once there is an answer.
        </p>
      ) : !run ? (
        <p className="mt-2 text-sm text-slate-500">
          Not run yet for this answer.
        </p>
      ) : run.status === "failed" || !result ? (
        <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">
          No AI result. {run.error}
        </p>
      ) : (
        <div className="mt-3 space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset ${COMPLETENESS_STYLES[result.completeness]}`}
            >
              {result.completeness}
            </span>
            {run.modelCompleteness &&
            run.modelCompleteness !== result.completeness ? (
              <span className="text-xs text-amber-700">
                The model said {run.modelCompleteness}. Lowered by rule.
              </span>
            ) : null}
          </div>
          <p>{result.summary}</p>

          {result.flags.length > 0 ? (
            <ul className="space-y-1">
              {result.flags.map((flag) => (
                <li key={`${flag.code}-${flag.quote}`}>
                  <span className="font-medium">{FLAG_LABELS[flag.code]}</span>
                  {flag.quote ? (
                    <span className="text-slate-600"> · “{flag.quote}”</span>
                  ) : null}
                  {flag.byRule ? (
                    <span className="text-xs text-amber-700">
                      {" "}
                      (added by rule)
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {result.ruleNotes.length > 0 ? (
            <ul className="list-inside list-disc rounded-md bg-amber-50 p-2 text-xs text-amber-900">
              {result.ruleNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}

          {result.followUpQuestions.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-slate-500">
                Drafted follow-up questions
              </p>
              <ul className="mt-1 list-inside list-disc">
                {result.followUpQuestions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      {run ? (
        <p className="mt-3 text-xs text-slate-500">
          {run.model} · {run.promptVersion} · {run.inputTokens ?? "?"} in /{" "}
          {run.outputTokens ?? "?"} out tokens ·{" "}
          {run.costUsd === null ? "cost unknown" : `$${run.costUsd.toFixed(4)}`}{" "}
          ·{" "}
          {run.latencyMs === null
            ? ""
            : `${(run.latencyMs / 1000).toFixed(1)} s`}
          {run.inputTruncated ? " · answer cut to 8,000 characters" : ""}
        </p>
      ) : null}
      <p className="mt-1 text-xs text-slate-400">
        The AI drafts this note. Only a reviewer can accept or send back.
      </p>
    </section>
  );
}
