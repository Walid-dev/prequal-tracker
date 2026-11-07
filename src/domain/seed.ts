// Demo data: two fictional subcontractors whose answers show the interesting cases (expired, vague, hidden instructions).
import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cases } from "@/db/schema";
import { BRIGHTLINE, sampleAnswer, TIDEWATER } from "@/samples/answers";
import { createCase, getCase } from "./cases";
import { reviewRequest, submitResponse } from "./requests";

const OWNER = "Sam Reviewer";

/** Adds the demo cases when the database has no cases yet. Returns true when it added them. */
export function seedDemoData(db: Db): boolean {
  const existing = db.get<{ n: number }>(
    sql`select count(*) as n from ${cases}`,
  );
  if (existing && existing.n > 0) return false;

  answerChecklist(db, BRIGHTLINE, "office@brightline.example", {
    wsib_clearance: "wsib-expired",
    cgl_insurance: "cgl-complete",
    safety_program: "safety-injection",
    esa_licence: "esa-missing-number",
  });

  const tidewater = answerChecklist(db, TIDEWATER, "admin@tidewater.example", {
    wsib_clearance: "wsib-vague",
    cgl_insurance: "cgl-low-coverage",
    safety_program: "cor-complete",
  });
  // One request already accepted, so the demo shows progress.
  const cor = tidewater.requests.find(
    (request) => request.kind === "safety_program",
  );
  if (cor) {
    reviewRequest(db, cor.id, {
      action: "accept",
      reviewer: OWNER,
      note: "COR number and expiry date checked.",
    });
  }
  return true;
}

/** Creates a case and answers each listed request with a sample answer. */
function answerChecklist(
  db: Db,
  company: { companyName: string; trade: "electrical" | "plumbing" },
  contactEmail: string,
  answers: Partial<Record<string, string>>,
) {
  const id = createCase(db, { ...company, contactEmail, owner: OWNER });
  const found = getCase(db, id);
  if (!found) throw new Error("The demo case was not created.");
  for (const request of found.requests) {
    const sampleId = answers[request.kind];
    if (sampleId) submitResponse(db, request.id, sampleAnswer(sampleId).body);
  }
  return found;
}
