"use client";
// The subcontractor's answer form. In this demo the reviewer types it on their behalf, and the form says so.
import { useActionState } from "react";
import type { FormState } from "../actions";

type Props = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
};

/** Lets someone submit an answer for this request, and shows any error. */
export function ResponseForm({ action }: Props) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-3">
      <textarea
        name="body"
        rows={4}
        defaultValue={state.values?.body ?? ""}
        placeholder="Paste or type the subcontractor's answer."
        className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
      />
      {state.errors?.body?.[0] || state.error ? (
        <p className="text-sm text-red-600">
          {state.errors?.body?.[0] ?? state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? "Submitting…" : "Submit answer"}
      </button>
    </form>
  );
}
