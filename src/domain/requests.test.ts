// Tests for the request workflow rules: respond, accept, request changes, and the timeline.
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

const accept = {
  action: "accept" as const,
  reviewer: "Sam Reviewer",
  note: "",
};

describe("request workflow", () => {
  it("refuses to accept a request with no response", () => {
    const { db, requestId } = setup();
    expect(() => reviewRequest(db, requestId, accept)).toThrow(RuleError);
    expect(getRequestDetail(db, requestId)?.request.status).toBe("open");
  });

  it("accepts a request after a response, and records which response was reviewed", () => {
    const { db, requestId } = setup();
    const responseId = submitResponse(
      db,
      requestId,
      "Clearance C-1 valid to 2027-12-31.",
    );
    reviewRequest(db, requestId, accept);
    const detail = getRequestDetail(db, requestId);
    expect(detail?.request.status).toBe("accepted");
    const review = detail?.timeline.find((event) => event.type === "review");
    expect(review?.type === "review" && review.review.responseId).toBe(
      responseId,
    );
  });

  it("needs a note to request changes", () => {
    const parsed = ReviewSchema.safeParse({
      action: "request_changes",
      reviewer: "Sam Reviewer",
      note: "",
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["note"]);
  });

  it("goes back to Responded when a request sent back gets a new answer", () => {
    const { db, requestId } = setup();
    submitResponse(db, requestId, "We will send it next week.");
    reviewRequest(db, requestId, {
      action: "request_changes",
      reviewer: "Sam Reviewer",
      note: "Send the certificate number and expiry date.",
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
    submitResponse(db, requestId, "Clearance C-1 valid to 2027-12-31.");
    reviewRequest(db, requestId, accept);
    expect(() => submitResponse(db, requestId, "A late change.")).toThrow(
      RuleError,
    );
  });
});
