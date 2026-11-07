// One case: the subcontractor, progress through the checklist, blockers, and each request.
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusPill } from "@/components/status-pill";
import { getDb } from "@/db/client";
import { getCase } from "@/domain/cases";
import { TRADE_LABELS } from "@/domain/checklists";

export default async function CasePage({ params }: PageProps<"/cases/[id]">) {
  const { id } = await params;
  const found = getCase(getDb(), Number(id));
  if (!found) notFound();

  const { case: item, requests } = found;
  const accepted = requests.filter((r) => r.status === "accepted").length;
  const blockers = requests.filter((r) => r.status === "changes_requested");
  const percent = requests.length
    ? Math.round((accepted / requests.length) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/cases"
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ← All cases
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{item.companyName}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {TRADE_LABELS[item.trade]} · {item.contactEmail} · Owner: {item.owner}
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">Progress</span>
          <span className="tabular-nums text-slate-600">
            {accepted} of {requests.length} accepted
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${percent}%` }}
          />
        </div>
        {blockers.length > 0 ? (
          <p className="mt-3 text-sm text-amber-700">
            Blocked on changes: {blockers.map((b) => b.title).join(", ")}
          </p>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <ul className="divide-y divide-slate-100">
          {requests.map((request) => (
            <li key={request.id}>
              <Link
                href={`/requests/${request.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50"
              >
                <span className="font-medium">{request.title}</span>
                <StatusPill status={request.status} />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
