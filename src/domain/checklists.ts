// The checklist each trade must complete: which documents we ask for, and what each request says.
import type { RequestKind, Trade } from "@/db/schema";

export type ChecklistItem = {
  kind: RequestKind;
  title: string;
  instructions: string;
};

export const TRADE_LABELS: Record<Trade, string> = {
  electrical: "Electrical",
  plumbing: "Plumbing",
  mechanical: "Mechanical",
  hvac: "HVAC",
  general: "General contracting",
};

const WSIB_CLEARANCE: ChecklistItem = {
  kind: "wsib_clearance",
  title: "WSIB clearance certificate",
  instructions:
    "Give your WSIB clearance certificate number, the legal business name on it, and its validity period (start and expiry dates). It must be valid on the day you start work.",
};

const CGL_INSURANCE: ChecklistItem = {
  kind: "cgl_insurance",
  title: "Certificate of liability insurance",
  instructions:
    "Give the insurer, the policy number, the named insured, and the expiry date of your commercial general liability policy. Coverage must be at least $2,000,000 per occurrence, and the policy must name us, the general contractor, as additional insured.",
};

const SAFETY_PROGRAM: ChecklistItem = {
  kind: "safety_program",
  title: "COR certificate or health and safety program",
  instructions:
    "Give your IHSA COR certificate number and its expiry date. If you don't have COR, describe your written health and safety program: who is responsible for it, how workers are trained, and how incidents are reported.",
};

const ESA_LICENCE: ChecklistItem = {
  kind: "esa_licence",
  title: "ESA electrical contractor licence",
  instructions:
    "Give your 7-digit ESA Licensed Electrical Contractor number and the name of the licence holder.",
};

/** Returns the requests a subcontractor of this trade must answer, in display order. */
export function checklistFor(trade: Trade): ChecklistItem[] {
  const common = [WSIB_CLEARANCE, CGL_INSURANCE, SAFETY_PROGRAM];
  return trade === "electrical" ? [...common, ESA_LICENCE] : common;
}
