// FOUNDER-EARNINGS (temporary — see lib/founder-earnings.ts). The founder's own
// read-back of the amounts he records via "Record earnings" (including the ones
// moved over by the one-off migration). Purely his view — nobody else sees it.
// Server component. Delete with the rest of the founder-earnings feature.

import type { FounderEarning } from "@/lib/founder-earnings";

const eur = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function FounderEarningsSummary({ earnings }: { earnings: FounderEarning[] }) {
  if (!earnings.length) return null;

  const total = earnings.reduce((s, e) => s + (e.amountEur ?? 0), 0);

  // Sum by year (matches how the Cockpit buckets these), newest first.
  const byYear = new Map<string, number>();
  for (const e of earnings) {
    const y = (e.submittedAt || "").slice(0, 4) || "—";
    byYear.set(y, (byYear.get(y) ?? 0) + (e.amountEur ?? 0));
  }
  const years = [...byYear.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <section className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">My recorded earnings</h2>
        <span className="text-lg font-semibold text-slate-900">{eur(total)}</span>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        What you record with &ldquo;Record earnings&rdquo; — this is exactly what shows as your node
        on the financial cockpit. It does not create an invoice or a payment.
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        {years.map(([y, v]) => (
          <span
            key={y}
            className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700"
          >
            {y}: <span className="font-medium">{eur(v)}</span>
          </span>
        ))}
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="text-slate-400">
            <tr className="text-left">
              <th className="pr-3 py-1 font-medium">Date</th>
              <th className="pr-3 py-1 font-medium">Project</th>
              <th className="pr-3 py-1 font-medium text-right">Amount</th>
              <th className="pr-3 py-1 font-medium text-right">EUR</th>
              <th className="pr-3 py-1 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {[...earnings]
              .sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""))
              .map((e) => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="pr-3 py-1 text-slate-600">
                    {(e.submittedAt || "").slice(0, 10) || "—"}
                  </td>
                  <td className="pr-3 py-1 text-slate-600">{e.projectCode || "—"}</td>
                  <td className="pr-3 py-1 text-right text-slate-600">
                    {e.amount != null
                      ? `${e.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${e.currency || ""}`.trim()
                      : "—"}
                  </td>
                  <td className="pr-3 py-1 text-right text-slate-800">
                    {e.amountEur != null ? eur(e.amountEur) : "—"}
                  </td>
                  <td className="pr-3 py-1 text-slate-500">
                    {/* Hide the internal migration markers from the founder's view. */}
                    {(e.comment || "")
                      .replace(/\s*\[mig-(?:pay|inv):rec[A-Za-z0-9]+\]/g, "")
                      .trim() || "—"}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
