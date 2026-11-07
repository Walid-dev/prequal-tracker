// The new-case page: open a prequalification case for a subcontractor.
import Link from "next/link";
import { CaseForm } from "./case-form";

export default function NewCasePage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/cases"
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ← All cases
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">New case</h1>
        <p className="mt-1 text-sm text-slate-600">
          The checklist for the trade is created automatically.
        </p>
      </div>
      <CaseForm />
    </div>
  );
}
