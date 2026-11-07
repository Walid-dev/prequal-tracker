// Tests for the triage service: it saves every run, ok or failed, and never changes a request's status.
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/db/migrate";
import { sampleAnswer } from "@/samples/answers";
import { createCase, getCase } from "./cases";
import { getRequestDetail, RuleError, submitResponse } from "./requests";
import { triageLatestAnswer, triageResultOf } from "./triage";

const SETTINGS = {
  mode: "mock" as const,
  modelId: "anthropic:claude-sonnet-5",
  today: "2026-11-07",
};

/** Creates the electrical demo case and returns the database and its WSIB request id. */
function setup() {
  const db = createTestDb();
  const caseId = createCase(db, {
    companyName: "Brightline Electric Ltd.",
    trade: "electrical",
    contactEmail: "office@brightline.example",
    owner: "Sam Reviewer",
  });
  const requestId = getCase(db, caseId)?.requests[0].id ?? 0;
  return { db, requestId };
}

describe("triageLatestAnswer", () => {
  it("saves an ok run and leaves the request status unchanged", async () => {
    const { db, requestId } = setup();
    submitResponse(db, requestId, sampleAnswer("wsib-expired").body);
    await triageLatestAnswer(db, requestId, SETTINGS);
    const detail = getRequestDetail(db, requestId);
    expect(detail?.request.status).toBe("responded");
    expect(detail?.latestRun?.status).toBe("ok");
    expect(
      detail?.latestRun && triageResultOf(detail.latestRun)?.completeness,
    ).toBe("partial");
    expect(detail?.latestRun?.modelCompleteness).toBe("complete");
  });

  it("saves a failed run with its reason, and still leaves the status unchanged", async () => {
    const { db, requestId } = setup();
    submitResponse(db, requestId, "Clearance C-1 valid to 2027-12-31.");
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error("overloaded");
      },
    });
    await triageLatestAnswer(db, requestId, { ...SETTINGS, model });
    const detail = getRequestDetail(db, requestId);
    expect(detail?.latestRun?.status).toBe("failed");
    expect(detail?.latestRun?.error).toMatch(/overloaded/);
    expect(detail?.request.status).toBe("responded");
  });

  it("refuses to triage a request with no answer", async () => {
    const { db, requestId } = setup();
    await expect(triageLatestAnswer(db, requestId, SETTINGS)).rejects.toThrow(
      RuleError,
    );
  });
});
