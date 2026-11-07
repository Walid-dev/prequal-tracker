// A small coloured label for a request's status, used on the case and request pages.
import type { RequestStatus } from "@/db/schema";

const STYLES: Record<RequestStatus, { label: string; className: string }> = {
  open: {
    label: "Open",
    className: "bg-slate-100 text-slate-700 ring-slate-200",
  },
  responded: {
    label: "Responded",
    className: "bg-sky-50 text-sky-800 ring-sky-200",
  },
  changes_requested: {
    label: "Changes requested",
    className: "bg-amber-50 text-amber-800 ring-amber-200",
  },
  accepted: {
    label: "Accepted",
    className: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  },
};

/** Shows a request status as a coloured pill. */
export function StatusPill({ status }: { status: RequestStatus }) {
  const style = STYLES[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style.className}`}
    >
      {style.label}
    </span>
  );
}
