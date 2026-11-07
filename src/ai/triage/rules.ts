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
const CONFIRM_EXPIRY = "Please confirm the expiry date of this document.";

// Phrases that try to steer the review. Used to flag the answer for the reviewer, never to block it.
const STEERING =
  /ignore (all |your |the )?(previous |prior |above )?instructions|note to the ai|as an ai|mark (this|it) (as )?(complete|accepted)|system (note|prompt|message)/i;

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
function parseDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
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
  truncated = false,
): TriageResult {
  const notes: string[] = [];
  const ruleFlags: TriageFlag[] = [];
  const questions = [...output.followUpQuestions];
  const haystack = normalize(answer);
  const inAnswer = (quote: string | null) =>
    Boolean(quote?.trim()) && haystack.includes(normalize(quote ?? ""));
  let completeness = output.completeness;
  const lowerTo = (cap: Completeness, reason: string) => {
    if (RANK[completeness] > RANK[cap]) {
      notes.push(`Lowered to ${cap}: ${reason}`);
      completeness = cap;
    }
  };

  // 1. Every flag must quote words that really appear in the answer.
  const grounded = output.flags.filter((flag) => inAnswer(flag.quote));
  const dropped = output.flags.length - grounded.length;
  if (dropped > 0) {
    notes.push(`Dropped ${dropped} flag(s) whose quote is not in the answer.`);
  }

  // 2. An expiry date counts only when it is a real date and its own words are in the answer.
  const facts = { ...output.facts };
  if (facts.expiryDate) {
    const date = facts.expiryDate;
    if (!parseDay(date)) {
      notes.push(`Ignored an expiry date that isn't a real date: "${date}".`);
      facts.expiryDate = null;
      lowerTo("partial", "the expiry date can't be read as a real date.");
      if (!questions.includes(CONFIRM_EXPIRY)) questions.push(CONFIRM_EXPIRY);
    } else if (!inAnswer(facts.expiryQuote)) {
      notes.push(
        `Ignored the expiry date ${date}: the words behind it are not in the answer.`,
      );
      facts.expiryDate = null;
      lowerTo("partial", "the expiry date isn't backed by the answer.");
      if (!questions.includes(CONFIRM_EXPIRY)) questions.push(CONFIRM_EXPIRY);
    } else if (date < today) {
      // The document has expired, whatever the model said.
      const quote = facts.expiryQuote ?? date;
      if (!grounded.some((flag) => flag.code === "expired")) {
        ruleFlags.push({ code: "expired", quote, byRule: true });
        notes.push(
          `Flagged by rule: the expiry date ${date} is before today (${today}).`,
        );
      }
      lowerTo("partial", `the expiry date ${date} is before today (${today}).`);
      if (questions.length === 0) {
        questions.push(
          `This document ended on ${date}. Please send a current one.`,
        );
      }
    }
  }

  // 3. Wording that tries to steer the review is flagged for the reviewer, and the answer can't be complete.
  const steering = answer.match(STEERING);
  if (steering) {
    if (!grounded.some((flag) => flag.code === "suspicious_instructions")) {
      ruleFlags.push({
        code: "suspicious_instructions",
        quote: steering[0],
        byRule: true,
      });
      notes.push(
        "Flagged by rule: the answer contains wording aimed at the review.",
      );
    }
    lowerTo(
      "partial",
      "an answer that tries to steer the review can't be complete.",
    );
  }

  // 4. An answer the model only read in part can't be complete.
  if (truncated) {
    notes.push(
      "The answer was too long to read in full. Review the rest by hand.",
    );
    lowerTo("partial", "the model read only part of the answer.");
  }

  // 5. Keep the note short enough to read. Rule flags go first, so the cap never removes them.
  const all = [...ruleFlags, ...grounded];
  const unique = all.filter(
    (flag, index) =>
      all.findIndex(
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
