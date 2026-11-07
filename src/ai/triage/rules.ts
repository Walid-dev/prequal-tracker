// Hard rules applied after the model, in plain code. They can only make the result stricter, never looser,
// and every change they make is written down so the reviewer can see it.
import type { Completeness, FlagCode, ModelOutput } from "./schema";

export type TriageFlag = { code: FlagCode; quote: string; byRule?: boolean };
export type TriageResult = Omit<ModelOutput, "flags"> & {
  flags: TriageFlag[];
  ruleNotes: string[];
};

const RANK: Record<Completeness, number> = {
  insufficient: 0,
  partial: 1,
  complete: 2,
};
const MAX_SUMMARY_CHARS = 600;
const MAX_FLAGS = 8;
const MAX_QUESTIONS = 5;

// Phrases that try to steer the review. Used to flag the answer for the reviewer, never to block it.
const STEERING =
  /ignore (all |your |the )?(previous |prior |above )?instructions|note to the ai|as an ai|mark (this|it) (as )?(complete|accepted)|system (note|prompt|message)/i;

/** Lowers completeness to `cap` if it is higher. Never raises it. */
function capAt(current: Completeness, cap: Completeness): Completeness {
  return RANK[current] > RANK[cap] ? cap : current;
}

/** Makes text comparable: lower case, straight quotes, single spaces. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Parses a YYYY-MM-DD string into a UTC date, or returns null when it isn't a real date. */
function parseDay(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

/** Applies every rule to the model's output. `today` is passed in, so tests and the eval never go stale. */
export function applyRules(
  output: ModelOutput,
  answer: string,
  today: string,
): TriageResult {
  const notes: string[] = [];
  let completeness = output.completeness;
  const haystack = normalize(answer);

  // 1. Every flag must quote words that really appear in the answer.
  const grounded = output.flags.filter(
    (flag) => flag.quote.trim() && haystack.includes(normalize(flag.quote)),
  );
  const dropped = output.flags.length - grounded.length;
  if (dropped > 0)
    notes.push(`Dropped ${dropped} flag(s) whose quote is not in the answer.`);
  const flags: TriageFlag[] = [...grounded];
  const hasFlag = (code: FlagCode) => flags.some((flag) => flag.code === code);

  // 2. An expiry date before today means the document is expired, whatever the model said.
  const facts = { ...output.facts };
  const expiry = parseDay(facts.expiryDate);
  if (facts.expiryDate && !expiry) {
    notes.push(
      `Ignored an expiry date that isn't a real YYYY-MM-DD date: "${facts.expiryDate}".`,
    );
    facts.expiryDate = null;
  }
  if (expiry && facts.expiryDate && facts.expiryDate < today) {
    if (!hasFlag("expired")) {
      flags.push({ code: "expired", quote: facts.expiryDate, byRule: true });
    }
    if (RANK[completeness] > RANK.partial) {
      notes.push(
        `Lowered to partial: the expiry date ${facts.expiryDate} is before today (${today}).`,
      );
    }
    completeness = capAt(completeness, "partial");
  }
  const questions = [...output.followUpQuestions];
  if (
    expiry &&
    facts.expiryDate &&
    facts.expiryDate < today &&
    questions.length === 0
  ) {
    questions.push(
      `This document ended on ${facts.expiryDate}. Please send a current one.`,
    );
  }

  // 3. Wording that tries to steer the review is flagged for the reviewer, and the answer can't be complete.
  const steering = answer.match(STEERING);
  if (steering) {
    if (!hasFlag("suspicious_instructions")) {
      flags.push({
        code: "suspicious_instructions",
        quote: steering[0],
        byRule: true,
      });
      notes.push(
        "Flagged by rule: the answer contains wording aimed at the review.",
      );
    }
    if (RANK[completeness] > RANK.partial) {
      notes.push(
        "Lowered to partial: an answer that tries to steer the review can't be complete.",
      );
    }
    completeness = capAt(completeness, "partial");
  }

  // 4. Keep the note short enough to read.
  const unique = flags.filter(
    (flag, index) =>
      flags.findIndex(
        (other) => other.code === flag.code && other.quote === flag.quote,
      ) === index,
  );
  return {
    completeness,
    summary: output.summary.slice(0, MAX_SUMMARY_CHARS),
    facts,
    flags: unique.slice(0, MAX_FLAGS),
    followUpQuestions: questions.slice(0, MAX_QUESTIONS),
    ruleNotes: notes,
  };
}
