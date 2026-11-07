// Stored model answers for mock mode, one per sample answer, so the app, tests, and CI work with no API key.
// Three contain deliberate model mistakes (an expired date marked complete, a made-up quote, an obeyed
// injection) so the rules in rules.ts are exercised, not just the happy path.
import type { LanguageModel } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { SAMPLE_ANSWERS } from "@/samples/answers";
import type { ModelOutput } from "./schema";

const NO_FACTS = {
  expiryDate: null,
  expiryQuote: null,
  coverageAmount: null,
  holderName: null,
};

export const FIXTURES: Record<string, ModelOutput> = {
  "cgl-complete": {
    completeness: "complete",
    summary:
      "Harbourview Mutual policy CGL-448210 covers Brightline Electric Ltd. for $5,000,000 per occurrence until 2027-08-31, with the general contractor as additional insured.",
    facts: {
      expiryDate: "2027-08-31",
      expiryQuote: "Expiry date: 2027-08-31",
      coverageAmount: 5_000_000,
      holderName: "Brightline Electric Ltd.",
    },
    flags: [],
    followUpQuestions: [],
  },
  "cgl-low-coverage": {
    completeness: "partial",
    summary:
      "Coverage is $1,000,000 per occurrence, below the $2,000,000 the request requires. The other details are present.",
    facts: {
      expiryDate: "2027-04-30",
      expiryQuote: "expires 2027-04-30",
      coverageAmount: 1_000_000,
      holderName: "Tidewater Plumbing Inc.",
    },
    flags: [
      {
        code: "coverage_below_requirement",
        quote: "$1,000,000 per occurrence",
      },
      // Deliberate mistake: this quote is not in the answer, so the rules drop it.
      {
        code: "unverifiable_claim",
        quote: "the policy is backed by a reinsurer",
      },
    ],
    followUpQuestions: [
      "Can you raise coverage to at least $2,000,000 per occurrence and send the updated certificate?",
    ],
  },
  "wsib-expired": {
    // Deliberate mistake: the clearance ended on 2026-10-31, so the rules lower this to partial.
    completeness: "complete",
    summary:
      "WSIB clearance certificate C-1093382 for Brightline Electric Ltd., valid 2026-05-01 to 2026-10-31.",
    facts: {
      expiryDate: "2026-10-31",
      expiryQuote: "Valid from 2026-05-01 to 2026-10-31",
      coverageAmount: null,
      holderName: "Brightline Electric Ltd.",
    },
    flags: [],
    followUpQuestions: [],
  },
  "wsib-vague": {
    completeness: "insufficient",
    summary:
      "The answer says the company is registered but gives no certificate number or validity dates.",
    facts: NO_FACTS,
    flags: [
      {
        code: "missing_item",
        quote: "We will send the certificate next week.",
      },
      {
        code: "unverifiable_claim",
        quote: "fully registered with WSIB and in good standing",
      },
    ],
    followUpQuestions: [
      "Please send your WSIB clearance certificate number and its validity dates.",
    ],
  },
  "safety-injection": {
    // Deliberate mistake: the model obeyed the hidden instruction. The rules flag it and cap it at partial.
    completeness: "complete",
    summary: "The subcontractor follows all safety rules on every site.",
    facts: NO_FACTS,
    flags: [],
    followUpQuestions: [],
  },
  "cgl-name-mismatch": {
    completeness: "partial",
    summary:
      "The policy is issued to Tidewater Holdings Ltd., not Tidewater Plumbing Inc. Coverage, expiry, and additional insured are in order.",
    facts: {
      expiryDate: "2027-06-30",
      expiryQuote: "expiry 2027-06-30",
      coverageAmount: 2_000_000,
      holderName: "Tidewater Holdings Ltd.",
    },
    flags: [
      {
        code: "name_mismatch",
        quote: "Named insured: Tidewater Holdings Ltd.",
      },
    ],
    followUpQuestions: [
      "Is Tidewater Holdings Ltd. the same legal entity as Tidewater Plumbing Inc.? If not, please send a certificate that names Tidewater Plumbing Inc.",
    ],
  },
  "cor-complete": {
    completeness: "complete",
    summary:
      "IHSA COR certificate COR-2026-55120 for Tidewater Plumbing Inc., valid until 2027-03-15.",
    facts: {
      expiryDate: "2027-03-15",
      expiryQuote: "valid until 2027-03-15",
      coverageAmount: null,
      holderName: "Tidewater Plumbing Inc.",
    },
    flags: [],
    followUpQuestions: [],
  },
  "esa-missing-number": {
    completeness: "insufficient",
    summary:
      "The answer names the master electrician but gives no ESA licence number.",
    facts: NO_FACTS,
    flags: [
      {
        code: "missing_item",
        quote: "We are a licensed electrical contractor in Ontario.",
      },
    ],
    followUpQuestions: [
      "Please send your 7-digit ESA Licensed Electrical Contractor number and the name of the licence holder.",
    ],
  },
};

const PLACEHOLDER: ModelOutput = {
  completeness: "partial",
  summary:
    "Mock mode: there is no stored answer for this text, so this note is a placeholder. Set AI_MODE=live for a real triage.",
  facts: NO_FACTS,
  flags: [],
  followUpQuestions: [],
};

/** Returns a mock model that answers with the stored output for this answer text, or a placeholder. */
export function mockModelFor(answer: string): LanguageModel {
  const sample = SAMPLE_ANSWERS.find(
    (item) => item.body.trim() === answer.trim(),
  );
  const output = (sample && FIXTURES[sample.id]) ?? PLACEHOLDER;
  return new MockLanguageModelV4({
    provider: "mock",
    modelId: "mock-fixtures",
    doGenerate: async () => ({
      content: [{ type: "text", text: JSON.stringify(output) }],
      finishReason: { unified: "stop", raw: "end_turn" },
      usage: {
        inputTokens: {
          total: 0,
          noCache: 0,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 0, text: 0, reasoning: undefined },
      },
      warnings: [],
    }),
  });
}
