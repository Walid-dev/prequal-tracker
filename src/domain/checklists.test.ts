// Tests for the checklist per trade.
import { describe, expect, it } from "vitest";
import { checklistFor } from "./checklists";

describe("checklistFor", () => {
  it("gives electricians four requests, including the ESA licence", () => {
    const kinds = checklistFor("electrical").map((item) => item.kind);
    expect(kinds).toEqual([
      "wsib_clearance",
      "cgl_insurance",
      "safety_program",
      "esa_licence",
    ]);
  });

  it("gives other trades the three common requests only", () => {
    const kinds = checklistFor("plumbing").map((item) => item.kind);
    expect(kinds).toEqual([
      "wsib_clearance",
      "cgl_insurance",
      "safety_program",
    ]);
  });
});
