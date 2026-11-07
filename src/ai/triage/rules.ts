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

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
// The month words a quote may use: full names, three-letter short forms, and "sept". Any other word is not a month.
const MONTH_WORDS = new Map<string, number>([
  ...MONTHS.flatMap((name, i): [string, number][] => [
    [name, i + 1],
    [name.slice(0, 3), i + 1],
  ]),
  ["sept", 9],
]);
// Flags that matter most to the reviewer. They go first, so the flag cap never removes them.
const SAFETY: ReadonlySet<FlagCode> = new Set([
  "expired",
  "suspicious_instructions",
]);

/** Finds every real date written in a text, as YYYY-MM-DD: 2026-10-31, 2026/10/31, October 31, 2026, or 31 Oct 2026. */
function datesIn(text: string): string[] {
  const found: string[] = [];
  const add = (year: string, month: number, day: string) => {
    const iso = `${year}-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}`;
    if (month >= 1 && parseDay(iso)) found.push(iso);
  };
  const monthOf = (name: string) => MONTH_WORDS.get(name.toLowerCase()) ?? 0;
  for (const m of text.matchAll(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/g)) {
    add(m[1], Number(m[2]), m[3]);
  }
  for (const m of text.matchAll(
    /\b([A-Za-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})\b/g,
  )) {
    add(m[3], monthOf(m[1]), m[2]);
  }
  for (const m of text.matchAll(
    /\b(\d{1,2})(?:st|nd|rd|th)? ([A-Za-z]{3,9})\.?,? (\d{4})\b/g,
  )) {
    add(m[3], monthOf(m[2]), m[1]);
  }
  return found;
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

  // 2. An expiry date counts only when it is a real date, its quote is in the answer,
  //    and the latest date written in that quote is the same date.
  const facts = { ...output.facts };
  const notBacked = (date: string, why: string) => {
    notes.push(`Ignored the expiry date ${date}: ${why}`);
    facts.expiryDate = null;
    lowerTo("partial", "the expiry date isn't backed by the answer.");
    if (!questions.includes(CONFIRM_EXPIRY)) questions.push(CONFIRM_EXPIRY);
  };
  let expiredByRule = false;
  if (facts.expiryDate) {
    const date = facts.expiryDate;
    if (!parseDay(date)) {
      notes.push(`Ignored an expiry date that isn't a real date: "${date}".`);
      facts.expiryDate = null;
      lowerTo("partial", "the expiry date can't be read as a real date.");
      if (!questions.includes(CONFIRM_EXPIRY)) questions.push(CONFIRM_EXPIRY);
    } else if (!inAnswer(facts.expiryQuote)) {
      notBacked(date, "the words behind it are not in the answer.");
    } else if (
      datesIn(facts.expiryQuote ?? "")
        .sort()
        .at(-1) !== date
    ) {
      notBacked(date, "the quoted words don't state that date.");
    } else if (date < today) {
      // The document has expired, whatever the model said. The rule's flag replaces any model flag for it.
      expiredByRule = true;
      const modelSaidSo = grounded.some((flag) => flag.code === "expired");
      ruleFlags.push({
        code: "expired",
        quote: facts.expiryQuote ?? date,
        byRule: true,
      });
      notes.push(
        `${modelSaidSo ? "Confirmed" : "Flagged"} by rule: the expiry date ${date} is before today (${today}).`,
      );
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
    const modelSaidSo = grounded.some(
      (flag) => flag.code === "suspicious_instructions",
    );
    ruleFlags.push({
      code: "suspicious_instructions",
      quote: steering[0],
      byRule: true,
    });
    notes.push(
      `${modelSaidSo ? "Confirmed" : "Flagged"} by rule: the answer contains wording aimed at the review.`,
    );
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

  // 5. Keep the note short enough to read. Rule flags go first, then the model's safety flags,
  //    then everything else, so the cap never removes a safety warning.
  const modelFlags = grounded.filter(
    (flag) => !(expiredByRule && flag.code === "expired"),
  );
  const all = [
    ...ruleFlags,
    ...modelFlags.filter((flag) => SAFETY.has(flag.code)),
    ...modelFlags.filter((flag) => !SAFETY.has(flag.code)),
  ];
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
