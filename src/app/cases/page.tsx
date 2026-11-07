// The case list: every subcontractor being prequalified, with progress and blockers.
import Link from "next/link";
import { getDb } from "@/db/client";
import { listCases } from "@/domain/cases";
import { TRADE_LABELS } from "@/domain/checklists";

export default function CasesPage() {
  const rows = listCases(getDb());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Cases</h1>
          <p className="mt-1 text-sm text-slate-600">
            Subcontractors waiting on prequalification paperwork.
          </p>
        </div>
        <Link
          href="/cases/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          New case
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No cases yet. Open one for your first subcontractor.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Trade</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Progress</th>
                <th className="px-4 py-3">Blockers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/cases/${row.id}`} className="hover:underline">
                      {row.companyName}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{TRADE_LABELS[row.trade]}</td>
                  <td className="px-4 py-3">{row.owner}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {row.accepted} of {row.total} accepted
                  </td>
                  <td className="px-4 py-3">
                    {row.blocked > 0 ? (
                      <span className="text-amber-700">
                        {row.blocked} waiting on changes
                      </span>
                    ) : (
                      <span className="text-slate-400">None</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
