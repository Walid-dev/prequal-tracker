"use client";
// The new-case form. It shows each validation error next to its field and keeps what was typed.
import { useActionState } from "react";
import { TRADE_LABELS } from "@/domain/checklists";
import { type CaseFormState, createCaseAction } from "../actions";

const INPUT =
  "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";

/** Renders the form and submits it to the createCaseAction server action. */
export function CaseForm() {
  const [state, formAction, pending] = useActionState<CaseFormState, FormData>(
    createCaseAction,
    {},
  );
  const value = (field: string) => state.values?.[field] ?? "";

  return (
    <form action={formAction} className="max-w-lg space-y-5">
      <Field label="Company legal name" error={state.errors?.companyName}>
        <input
          name="companyName"
          defaultValue={value("companyName")}
          className={INPUT}
        />
      </Field>
      <Field label="Trade" error={state.errors?.trade}>
        <select name="trade" defaultValue={value("trade")} className={INPUT}>
          <option value="">Choose a trade</option>
          {Object.entries(TRADE_LABELS).map(([trade, label]) => (
            <option key={trade} value={trade}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Contact email" error={state.errors?.contactEmail}>
        <input
          name="contactEmail"
          type="email"
          defaultValue={value("contactEmail")}
          className={INPUT}
        />
      </Field>
      <Field
        label="Owner (the reviewer responsible)"
        error={state.errors?.owner}
      >
        <input name="owner" defaultValue={value("owner")} className={INPUT} />
      </Field>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create case"}
      </button>
    </form>
  );
}

/** A labelled form field with its error message underneath. */
function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string[];
  children: React.ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the input is passed in as a child of the label.
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {children}
      {error?.[0] ? (
        <span className="mt-1 block text-sm font-normal text-red-600">
          {error[0]}
        </span>
      ) : null}
    </label>
  );
}
