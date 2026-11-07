"use server";
// Server actions for one request: submit an answer, and record a review. Each validates, calls the domain code, and refreshes the pages.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import {
  ResponseSchema,
  ReviewSchema,
  RuleError,
  reviewRequest,
  submitResponse,
} from "@/domain/requests";
import { settingsFromEnv, triageLatestAnswer } from "@/domain/triage";

export type FormState = {
  ok?: boolean;
  error?: string;
  errors?: Partial<Record<string, string[]>>;
  values?: Record<string, string>;
};

/** Saves the subcontractor's answer, or returns what to fix. */
export async function submitResponseAction(
  requestId: number,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = { body: String(formData.get("body") ?? "") };
  const parsed = ResponseSchema.safeParse(values);
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors, values };
  }
  try {
    submitResponse(getDb(), requestId, parsed.data.body);
  } catch (error) {
    if (error instanceof RuleError) return { error: error.message, values };
    throw error;
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Runs AI triage on the latest answer and saves the run. It never changes the request's status. */
export async function runTriageAction(
  requestId: number,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  try {
    await triageLatestAnswer(getDb(), requestId, settingsFromEnv());
  } catch (error) {
    if (error instanceof RuleError) return { error: error.message };
    throw error;
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Records the reviewer's decision (accept or request changes), or returns what to fix. */
export async function reviewAction(
  requestId: number,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = {
    action: String(formData.get("action") ?? ""),
    reviewer: String(formData.get("reviewer") ?? ""),
    note: String(formData.get("note") ?? ""),
    responseId: String(formData.get("responseId") ?? ""),
    triageRunId: String(formData.get("triageRunId") ?? ""),
  };
  const parsed = ReviewSchema.safeParse({
    ...values,
    triageRunId: values.triageRunId || undefined,
  });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors, values };
  }
  try {
    reviewRequest(getDb(), requestId, parsed.data);
  } catch (error) {
    if (error instanceof RuleError) return { error: error.message, values };
    throw error;
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
