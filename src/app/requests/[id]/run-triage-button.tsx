"use client";
// The "Run AI triage" button. It shows a pending state while the model works, and any error after.
import { useActionState } from "react";
import type { FormState } from "../actions";

type Props = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  hasRun: boolean;
};

/** Starts a triage run on the latest answer. */
export function RunTriageButton({ action, hasRun }: Props) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex items-center gap-3">
      {state.error ? (
        <span className="text-sm text-red-600">{state.error}</span>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-sky-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50"
      >
        {pending
          ? "Running triage…"
          : hasRun
            ? "Run AI triage again"
            : "Run AI triage"}
      </button>
    </form>
  );
}
