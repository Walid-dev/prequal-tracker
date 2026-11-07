// Tests for creating, listing, and reading cases.
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/db/migrate";
import { requests } from "@/db/schema";
import { createCase, getCase, listCases, NewCaseSchema } from "./cases";

const electrician = {
  companyName: "Brightline Electric Ltd.",
  trade: "electrical" as const,
  contactEmail: "office@brightline.example",
  owner: "Sam Reviewer",
};

describe("cases", () => {
  it("creates a case with the checklist for its trade", () => {
    const db = createTestDb();
    const id = createCase(db, electrician);
    const found = getCase(db, id);
    expect(found?.case.companyName).toBe("Brightline Electric Ltd.");
    expect(found?.requests).toHaveLength(4);
    expect(found?.requests.every((r) => r.status === "open")).toBe(true);
  });

  it("rejects a bad email with a message for that field", () => {
    const parsed = NewCaseSchema.safeParse({
      ...electrician,
      contactEmail: "not-an-email",
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["contactEmail"]);
  });

  it("lists cases with accepted and blocked counts", () => {
    const db = createTestDb();
    const id = createCase(db, electrician);
    const [first, second] = getCase(db, id)?.requests ?? [];
    db.update(requests)
      .set({ status: "accepted" })
      .where(eq(requests.id, first.id))
      .run();
    db.update(requests)
      .set({ status: "changes_requested" })
      .where(eq(requests.id, second.id))
      .run();
    expect(listCases(db)[0]).toMatchObject({
      total: 4,
      accepted: 1,
      blocked: 1,
    });
  });

  it("returns nothing for a case that does not exist", () => {
    expect(getCase(createTestDb(), 42)).toBeUndefined();
  });
});
