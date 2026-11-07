// The shape of a triage answer. The model gets a strict schema; our own check lower-cases list values first,
// because vendors don't guarantee the capitalization of enum values.
import { jsonSchema, zodSchema } from "ai";
import { z } from "zod";

export const COMPLETENESS = ["complete", "partial", "insufficient"] as const;
export type Completeness = (typeof COMPLETENESS)[number];

export const FLAG_CODES = [
  "expired",
  "coverage_below_requirement",
  "name_mismatch",
  "missing_item",
  "suspicious_instructions",
  "unverifiable_claim",
] as const;
export type FlagCode = (typeof FLAG_CODES)[number];

/** What the model must return. Kept small and flat: lengths, dates, and caps are enforced in code (rules.ts). */
export const ModelOutputSchema = z.object({
  completeness: z
    .enum(COMPLETENESS)
    .describe(
      "complete, partial, or insufficient. Use insufficient when the answer can't support a decision.",
    ),
  summary: z
    .string()
    .describe("Two or three plain sentences for the reviewer."),
  facts: z.object({
    expiryDate: z
      .string()
      .nullable()
      .describe(
        "Expiry or end date in YYYY-MM-DD, exactly as stated. null if the answer gives none.",
      ),
    coverageAmount: z
      .number()
      .nullable()
      .describe("Coverage per occurrence in dollars. null if not stated."),
    holderName: z
      .string()
      .nullable()
      .describe("The name the document is issued to. null if not stated."),
  }),
  flags: z
    .array(
      z.object({
        code: z.enum(FLAG_CODES),
        quote: z
          .string()
          .describe(
            "The exact words from the answer that this flag is based on.",
          ),
      }),
    )
    .describe("Problems found. An empty list when there are none."),
  followUpQuestions: z
    .array(z.string())
    .describe(
      "Questions to send the subcontractor. An empty list when the answer is complete.",
    ),
});

export type ModelOutput = z.infer<typeof ModelOutputSchema>;

/** Lower-cases the closed-list values the model returned, so "Partial" still counts as "partial". */
function lowercaseLists(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const output = { ...(value as Record<string, unknown>) };
  if (typeof output.completeness === "string")
    output.completeness = output.completeness.toLowerCase();
  if (Array.isArray(output.flags)) {
    output.flags = output.flags.map((flag) =>
      flag &&
      typeof flag === "object" &&
      typeof (flag as { code?: unknown }).code === "string"
        ? { ...flag, code: (flag as { code: string }).code.toLowerCase() }
        : flag,
    );
  }
  return output;
}

/** The schema handed to the AI SDK: strict JSON Schema for the model, lenient-then-strict check for us. */
export const triageOutputSchema = jsonSchema<ModelOutput>(
  zodSchema(ModelOutputSchema).jsonSchema,
  {
    validate: (value) => {
      const parsed = ModelOutputSchema.safeParse(lowercaseLists(value));
      return parsed.success
        ? { success: true, value: parsed.data }
        : { success: false, error: parsed.error };
    },
  },
);
