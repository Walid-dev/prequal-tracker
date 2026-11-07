// End-to-end flow at service level: open a case, answer, accept, and watch progress move. Also checks the demo seed.
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/db/migrate";
import { createCase, getCase, listCases } from "./cases";
import { reviewRequest, submitResponse } from "./requests";
import { seedDemoData } from "./seed";

describe("prequalification flow", () => {
  it("moves progress from 0 of 3 to 1 of 3 when one answer is accepted", () => {
    const db = createTestDb();
    const caseId = createCase(db, {
      companyName: "Tidewater Plumbing Inc.",
      trade: "plumbing",
      contactEmail: "admin@tidewater.example",
      owner: "Sam Reviewer",
    });
    expect(listCases(db)[0]).toMatchObject({ total: 3, accepted: 0 });

    const first = getCase(db, caseId)?.requests[0].id ?? 0;
    const responseId = submitResponse(
      db,
      first,
      "WSIB clearance C-77 valid until 2027-06-30.",
    );
    reviewRequest(db, first, {
      responseId,
      action: "accept",
      reviewer: "Sam Reviewer",
      note: "",
    });

    expect(listCases(db)[0]).toMatchObject({ total: 3, accepted: 1 });
  });

  it("seeds the demo cases once, and only into an empty database", () => {
    const db = createTestDb();
    expect(seedDemoData(db)).toBe(true);
    expect(seedDemoData(db)).toBe(false);
    const summaries = listCases(db);
    expect(summaries).toHaveLength(2);
    expect(summaries.reduce((sum, row) => sum + row.accepted, 0)).toBe(1);
  });
});
