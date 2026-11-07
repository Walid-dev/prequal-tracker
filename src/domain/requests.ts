// Requests: the subcontractor answers, the reviewer accepts or asks for changes, and every event is kept.
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import {
  type CaseRow,
  cases,
  REVIEW_ACTIONS,
  type RequestRow,
  type ResponseRow,
  type ReviewRow,
  requests,
  responses,
  reviews,
  type TriageRunRow,
  triageRuns,
} from "@/db/schema";

/** A business rule refused the action. The message is safe to show to the user. */
export class RuleError extends Error {}

export const ResponseSchema = z.object({
  body: z
    .string()
    .trim()
    .min(10, { error: "Write at least a sentence." })
    .max(20_000, { error: "Keep the answer under 20,000 characters." }),
});

export const ReviewSchema = z
  .object({
    action: z.enum(REVIEW_ACTIONS, {
      error: "Choose accept or request changes.",
    }),
    reviewer: z
      .string()
      .trim()
      .min(2, { error: "Enter your name." })
      .max(80, { error: "Keep the name under 80 characters." }),
    note: z
      .string()
      .trim()
      .max(2000, { error: "Keep the note under 2,000 characters." }),
    triageRunId: z.coerce.number().int().positive().optional(),
  })
  .refine((review) => review.action === "accept" || review.note.length >= 3, {
    error: "Say what needs to change.",
    path: ["note"],
  });

export type ReviewInput = z.infer<typeof ReviewSchema>;

/** Saves a subcontractor answer and marks the request Responded. An accepted request takes no more answers. */
export function submitResponse(
  db: Db,
  requestId: number,
  body: string,
): number {
  return db.transaction((tx) => {
    const request = tx
      .select()
      .from(requests)
      .where(eq(requests.id, requestId))
      .get();
    if (!request) throw new RuleError("This request doesn't exist.");
    if (request.status === "accepted") {
      throw new RuleError("This request is already accepted.");
    }
    const created = tx
      .insert(responses)
      .values({ requestId, body })
      .returning({ id: responses.id })
      .get();
    tx.update(requests)
      .set({ status: "responded" })
      .where(eq(requests.id, requestId))
      .run();
    return created.id;
  });
}

/** Records a reviewer decision on the latest answer. Only a Responded request can be reviewed, so nothing is accepted without a response. */
export function reviewRequest(
  db: Db,
  requestId: number,
  input: ReviewInput,
): void {
  db.transaction((tx) => {
    const request = tx
      .select()
      .from(requests)
      .where(eq(requests.id, requestId))
      .get();
    if (!request) throw new RuleError("This request doesn't exist.");
    if (request.status !== "responded") {
      throw new RuleError(
        input.action === "accept"
          ? "A request can only be accepted after the subcontractor responds."
          : "Changes can only be requested on a new response.",
      );
    }
    const latest = tx
      .select()
      .from(responses)
      .where(eq(responses.requestId, requestId))
      .orderBy(desc(responses.id))
      .limit(1)
      .get();
    if (!latest) throw new RuleError("There is no response to review.");

    // Link the triage run only if it belongs to the answer being reviewed.
    const run = input.triageRunId
      ? tx
          .select()
          .from(triageRuns)
          .where(eq(triageRuns.id, input.triageRunId))
          .get()
      : undefined;

    tx.insert(reviews)
      .values({
        requestId,
        responseId: latest.id,
        triageRunId: run?.responseId === latest.id ? run.id : null,
        action: input.action,
        reviewer: input.reviewer,
        note: input.note,
      })
      .run();
    tx.update(requests)
      .set({
        status: input.action === "accept" ? "accepted" : "changes_requested",
      })
      .where(eq(requests.id, requestId))
      .run();
  });
}

export type TimelineEvent =
  | { type: "response"; at: Date; key: string; response: ResponseRow }
  | { type: "triage"; at: Date; key: string; run: TriageRunRow }
  | { type: "review"; at: Date; key: string; review: ReviewRow };

export type RequestDetail = {
  request: RequestRow;
  case: CaseRow;
  latestResponse?: ResponseRow;
  latestRun?: TriageRunRow;
  timeline: TimelineEvent[];
};

/** Returns one request with its case, latest answer, latest triage run of that answer, and a newest-first timeline. */
export function getRequestDetail(
  db: Db,
  id: number,
): RequestDetail | undefined {
  const request = db.select().from(requests).where(eq(requests.id, id)).get();
  if (!request) return undefined;
  const owner = db
    .select()
    .from(cases)
    .where(eq(cases.id, request.caseId))
    .get();
  if (!owner) return undefined;

  const answers = db
    .select()
    .from(responses)
    .where(eq(responses.requestId, id))
    .orderBy(desc(responses.id))
    .all();
  const runs = answers.length
    ? db
        .select()
        .from(triageRuns)
        .where(
          inArray(
            triageRuns.responseId,
            answers.map((answer) => answer.id),
          ),
        )
        .orderBy(desc(triageRuns.id))
        .all()
    : [];
  const decisions = db
    .select()
    .from(reviews)
    .where(eq(reviews.requestId, id))
    .orderBy(desc(reviews.id))
    .all();

  const latestResponse = answers[0];
  const timeline: TimelineEvent[] = [
    ...answers.map((response) => ({
      type: "response" as const,
      at: response.createdAt,
      key: `response-${response.id}`,
      response,
    })),
    ...runs.map((run) => ({
      type: "triage" as const,
      at: run.createdAt,
      key: `triage-${run.id}`,
      run,
    })),
    ...decisions.map((review) => ({
      type: "review" as const,
      at: review.createdAt,
      key: `review-${review.id}`,
      review,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return {
    request,
    case: owner,
    latestResponse,
    latestRun: runs.find((run) => run.responseId === latestResponse?.id),
    timeline,
  };
}
