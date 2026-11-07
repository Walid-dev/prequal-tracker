"use client";
// The reviewer's decision form: accept the latest answer, or send it back with a note.
// The AI's drafted questions are offered with one click, never filled in silently.
import { useActionState, useRef } from "react";
import type { FormState } from "../actions";

type Props = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  defaultReviewer: string;
  suggestedNote?: string;
  triageRunId?: number;
};

const INPUT =
  "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";

/** Records accept or request changes, with the reviewer's name and a note. */
export function ReviewForm({
  action,
  defaultReviewer,
  suggestedNote,
  triageRunId,
}: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const note = useRef<HTMLTextAreaElement>(null);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="triageRunId" value={triageRunId ?? ""} />
      <label className="block text-sm font-medium text-slate-700">
        Your name
        <input
          name="reviewer"
          defaultValue={state.values?.reviewer ?? defaultReviewer}
          className={INPUT}
        />
        {state.errors?.reviewer?.[0] ? (
          <span className="mt-1 block font-normal text-red-600">
            {state.errors.reviewer[0]}
          </span>
        ) : null}
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Note (required to request changes)
        <textarea
          ref={note}
          name="note"
          rows={4}
          defaultValue={state.values?.note ?? ""}
          className={INPUT}
        />
        {state.errors?.note?.[0] ? (
          <span className="mt-1 block font-normal text-red-600">
            {state.errors.note[0]}
          </span>
        ) : null}
      </label>
      {suggestedNote ? (
        <button
          type="button"
          onClick={() => {
            if (note.current) note.current.value = suggestedNote;
          }}
          className="text-sm text-sky-700 hover:underline"
        >
          Insert the AI's follow-up questions
        </button>
      ) : null}
      {state.error ? (
        <p className="text-sm text-red-600">{state.error}</p>
      ) : null}
      <div className="flex gap-3">
        <button
          type="submit"
          name="action"
          value="accept"
          disabled={pending}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          Accept
        </button>
        <button
          type="submit"
          name="action"
          value="request_changes"
          disabled={pending}
          className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
        >
          Request changes
        </button>
      </div>
    </form>
  );
}
