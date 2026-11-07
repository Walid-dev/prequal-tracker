// Tests for the request workflow rules: respond, accept, request changes, stale reviews, and the timeline.
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/db/migrate";
import { createCase, getCase } from "./cases";
import {
  getRequestDetail,
  ReviewSchema,
  RuleError,
  reviewRequest,
  submitResponse,
} from "./requests";
import { triageLatestAnswer } from "./triage";

/** Creates a plumbing case and returns the database and its first request id. */
function setup() {
  const db = createTestDb();
  const caseId = createCase(db, {
    companyName: "Tidewater Plumbing Inc.",
    trade: "plumbing",
    contactEmail: "admin@tidewater.example",
    owner: "Sam Reviewer",
  });
  const requestId = getCase(db, caseId)?.requests[0].id ?? 0;
  return { db, requestId };
}

/** An accept decision on the answer the reviewer saw. */
const accept = (responseId: number) => ({
  action: "accept" as const,
  reviewer: "Sam Reviewer",
  note: "",
  responseId,
});

describe("request workflow", () => {
  it("refuses to accept a request with no response", () => {
    const { db, requestId } = setup();
    expect(() => reviewRequest(db, requestId, accept(1))).toThrow(RuleError);
    expect(getRequestDetail(db, requestId)?.request.status).toBe("open");
  });

  it("accepts a request after a response, and records which response was reviewed", () => {
    const { db, requestId } = setup();
    const responseId = submitResponse(
      db,
      requestId,
      "Clearance C-1 valid to 2027-12-31.",
    );
    reviewRequest(db, requestId, accept(responseId));
    const detail = getRequestDetail(db, requestId);
    expect(detail?.request.status).toBe("accepted");
    const review = detail?.timeline.find((event) => event.type === "review");
    expect(review?.type === "review" && review.review.responseId).toBe(
      responseId,
    );
  });

  it("refuses a decision on an answer that is no longer the latest (R1)", async () => {
    const { db, requestId } = setup();
    const first = submitResponse(
      db,
      requestId,
      "Clearance C-1 valid to 2027-12-31.",
    );
    const run = await triageLatestAnswer(db, requestId, {
      mode: "mock",
      modelId: "anthropic:claude-sonnet-5",
      today: "2026-11-07",
    });
    submitResponse(db, requestId, "Clearance C-1 expired on 2026-10-31.");
    expect(() => reviewRequest(db, requestId, accept(first))).toThrow(
      /newer answer/,
    );
    expect(() =>
      reviewRequest(db, requestId, { ...accept(first), triageRunId: run }),
    ).toThrow(/newer answer/);
    expect(getRequestDetail(db, requestId)?.request.status).toBe("responded");
  });

  it("needs a note to request changes", () => {
    const parsed = ReviewSchema.safeParse({
      action: "request_changes",
      reviewer: "Sam Reviewer",
      note: "",
      responseId: 1,
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["note"]);
  });

  it("goes back to Responded when a request sent back gets a new answer", () => {
    const { db, requestId } = setup();
    const responseId = submitResponse(
      db,
      requestId,
      "We will send it next week.",
    );
    reviewRequest(db, requestId, {
      action: "request_changes",
      reviewer: "Sam Reviewer",
      note: "Send the certificate number and expiry date.",
      responseId,
    });
    expect(getRequestDetail(db, requestId)?.request.status).toBe(
      "changes_requested",
    );
    submitResponse(db, requestId, "Clearance C-2 valid to 2027-12-31.");
    const detail = getRequestDetail(db, requestId);
    expect(detail?.request.status).toBe("responded");
    expect(detail?.timeline).toHaveLength(3);
  });

  it("takes no new answers once a request is accepted", () => {
    const { db, requestId } = setup();
    const responseId = submitResponse(
      db,
      requestId,
      "Clearance C-1 valid to 2027-12-31.",
    );
    reviewRequest(db, requestId, accept(responseId));
    expect(() => submitResponse(db, requestId, "A late change.")).toThrow(
      RuleError,
    );
  });
});
