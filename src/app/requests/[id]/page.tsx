// One request: what we asked, the latest answer, the review, the subcontractor's side, and the full history.
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusPill } from "@/components/status-pill";
import { getDb } from "@/db/client";
import { getRequestDetail, type TimelineEvent } from "@/domain/requests";
import { settingsFromEnv, triageResultOf } from "@/domain/triage";
import {
  reviewAction,
  runTriageAction,
  submitResponseAction,
} from "../actions";
import { ResponseForm } from "./response-form";
import { ReviewForm } from "./review-form";
import { TriagePanel } from "./triage-panel";

const CARD = "rounded-lg border border-slate-200 bg-white p-4";

export default async function RequestPage({
  params,
}: PageProps<"/requests/[id]">) {
  const { id } = await params;
  const detail = getRequestDetail(getDb(), Number(id));
  if (!detail) notFound();
  const { request, case: item, latestResponse, latestRun, timeline } = detail;
  const questions = latestRun
    ? triageResultOf(latestRun)?.followUpQuestions
    : undefined;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/cases/${item.id}`}
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ← {item.companyName}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{request.title}</h1>
          <StatusPill status={request.status} />
        </div>
      </div>

      <section className={CARD}>
        <h2 className="text-sm font-semibold text-slate-500">What we asked</h2>
        <p className="mt-1 text-sm">{request.instructions}</p>
      </section>

      <section className={CARD}>
        <h2 className="text-sm font-semibold text-slate-500">Latest answer</h2>
        {latestResponse ? (
          <>
            <p className="mt-1 whitespace-pre-wrap text-sm">
              {latestResponse.body}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Received {formatDateTime(latestResponse.createdAt)}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-slate-500">No answer yet.</p>
        )}
      </section>

      <TriagePanel
        run={latestRun}
        hasAnswer={Boolean(latestResponse)}
        mode={settingsFromEnv().mode}
        action={runTriageAction.bind(null, request.id)}
      />

      <section className={CARD}>
        <h2 className="text-sm font-semibold text-slate-500">Review</h2>
        {request.status === "responded" && latestResponse ? (
          <div className="mt-3">
            <ReviewForm
              action={reviewAction.bind(null, request.id)}
              defaultReviewer={item.owner}
              suggestedNote={questions?.join("\n")}
              responseId={latestResponse.id}
              triageRunId={latestRun?.id}
            />
          </div>
        ) : (
          <p className="mt-1 text-sm text-slate-500">
            {request.status === "accepted"
              ? "Accepted. Nothing left to do on this request."
              : "Waiting for an answer from the subcontractor. A request can only be accepted after a response."}
          </p>
        )}
      </section>

      {request.status !== "accepted" ? (
        <section className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
          <h2 className="text-sm font-semibold text-slate-500">
            Subcontractor's side (demo)
          </h2>
          <p className="mt-1 mb-3 text-xs text-slate-500">
            In the real product the subcontractor answers from their own portal.
            Here you answer on their behalf.
          </p>
          <ResponseForm action={submitResponseAction.bind(null, request.id)} />
        </section>
      ) : null}

      <section className={CARD}>
        <h2 className="text-sm font-semibold text-slate-500">History</h2>
        {timeline.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">Nothing yet.</p>
        ) : (
          <ol className="mt-2 space-y-3">
            {timeline.map((event) => (
              <li
                key={event.key}
                className="border-l-2 border-slate-200 pl-3 text-sm"
              >
                <p className="text-xs text-slate-500">
                  {formatDateTime(event.at)}
                </p>
                <TimelineText event={event} />
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

/** One line of history, in plain words. */
function TimelineText({ event }: { event: TimelineEvent }) {
  if (event.type === "response") {
    return <p>The subcontractor answered.</p>;
  }
  if (event.type === "triage") {
    const { run } = event;
    return run.status === "ok" ? (
      <p>
        AI triage ({run.mode}, {run.model}): {run.completeness}.
      </p>
    ) : (
      <p className="text-red-700">AI triage failed: {run.error}</p>
    );
  }
  const { review } = event;
  return review.action === "accept" ? (
    <p>
      {review.reviewer} accepted the answer.
      {review.note ? ` ${review.note}` : ""}
    </p>
  ) : (
    <p>
      {review.reviewer} requested changes: {review.note}
    </p>
  );
}

/** Formats a date and time for the history list. */
function formatDateTime(date: Date): string {
  return date.toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
