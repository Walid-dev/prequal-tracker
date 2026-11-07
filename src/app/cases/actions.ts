"use server";
// Server actions for cases: validate the form, call the domain code, then redirect.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { createCase, NewCaseSchema } from "@/domain/cases";

export type CaseFormState = {
  errors?: Partial<Record<string, string[]>>;
  values?: Record<string, string>;
};

const FIELDS = ["companyName", "trade", "contactEmail", "owner"] as const;

/** Creates a case from the new-case form, or returns the field errors to show next to each field. */
export async function createCaseAction(
  _previous: CaseFormState,
  formData: FormData,
): Promise<CaseFormState> {
  const values = Object.fromEntries(
    FIELDS.map((field) => [field, String(formData.get(field) ?? "")]),
  );
  const parsed = NewCaseSchema.safeParse(values);
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors, values };
  }
  const id = createCase(getDb(), parsed.data);
  revalidatePath("/cases");
  redirect(`/cases/${id}`);
}
