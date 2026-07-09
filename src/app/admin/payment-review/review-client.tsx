"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DownloadChip } from "@/components/download-chip";
import { PaidDateModal } from "@/components/paid-date-modal";
import { SearchInput } from "@/components/search-input";
import { Badge, StatusPill } from "@/components/badge";
import { Button } from "@/components/form-controls";

export type ReviewBundle = {
  payment: {
    id: string;
    code: string;
    type: string;
    status: string;
    amount: number | null;
    currency: string;
    amountEur: number | null;
    dueDate: string | null;
    invoiceDate: string | null;
    paymentDate: string | null;
    invoiceReference: string;
    beneficiary: string;
    comment: string;
    invoicePdfUrl: string;
    invoiceUrl: string;
  };
  memberName: string;
  memberCode: string;
  invoice: {
    code: string;
    pdfUrl: string;
    pdfName: string;
    amount: number | null;
    currency: string;
    comment: string;
    submissionDate: string | null;
  } | null;
  staffing: {
    id: string;
    code: string;
    role: string;
    projectRole: string;
    ratePerDay: number | null;
    currency: string;
    daysAllocated: number | null;
    daysUsed: number;
    startDate: string | null;
    endDate: string | null;
  } | null;
  timesheets: Array<{
    id: string;
    code: string;
    startDate: string | null;
    endDate: string | null;
    totalHours: number;
    status: string;
    days: Record<
      "monday" | "tuesday" | "wednesday" | "thursday" | "friday",
      { hours: number; task: string }
    >;
  }>;
  project: { code: string; name: string } | null;
  sowContracts: Array<{
    id: string;
    type: string;
    side: string;
    validity: string;
    signatureDate: string;
    expiryDate: string;
    pdfUrl: string;
  }>;
};

export type MemberGroup = {
  memberId: string;
  memberName: string;
  memberCode: string;
  underReview: ReviewBundle[];
  past: ReviewBundle[];
};

function money(v: number | null, currency: string): string {
  if (v == null) return "—";
  return `${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}${currency ? " " + currency : ""}`;
}

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
const DAY_LABELS: Record<(typeof DAY_KEYS)[number], string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function longDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${d} ${MONTHS[Number(mo) - 1] ?? mo} ${y}`;
}

function shortDayDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${d}.${mo}.${y.slice(2)}`;
}

function addDaysIso(iso: string, n: number): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// Buckets a stored status into a visual family the admin reads at a glance.
type StatusTone = "paid" | "approved" | "cancelled" | "review" | "other";
function statusTone(status: string): StatusTone {
  const s = status.toLowerCase();
  if (s === "paid") return "paid";
  if (s === "to be paid" || s === "scheduled") return "approved";
  if (s === "canceled" || s === "cancelled") return "cancelled";
  if (s === "under review") return "review";
  return "other";
}
export function PaymentReviewClient({ groups }: { groups: MemberGroup[] }) {
  const router = useRouter();
  const [data, setData] = useState(groups);
  useEffect(() => setData(groups), [groups]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(groups[0]?.memberId ?? null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [paidTargetId, setPaidTargetId] = useState<string | null>(null);
  const [expandedTs, setExpandedTs] = useState<Set<string>>(new Set());
  // Which payment cards are expanded. Defaults (set per selected member below):
  // under-review items open, past items collapsed.
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());
  function toggleItem(id: string) {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const [toast, setToast] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  function toggleTs(id: string) {
    setExpandedTs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (g) =>
        g.memberName.toLowerCase().includes(q) || g.memberCode.toLowerCase().includes(q),
    );
  }, [data, search]);

  const selected = useMemo(
    () => data.find((g) => g.memberId === selectedId) ?? null,
    [data, selectedId],
  );

  // On (re)selecting a member, default under-review cards open and past ones
  // collapsed. User toggles persist until the selection or data changes.
  useEffect(() => {
    setOpenItems(new Set(selected?.underReview.map((b) => b.payment.id) ?? []));
  }, [selected]);

  // Keep a valid selection as the (filtered) list changes.
  useEffect(() => {
    if (data.length === 0) {
      setSelectedId(null);
    } else if (!data.some((g) => g.memberId === selectedId)) {
      setSelectedId(data[0].memberId);
    }
  }, [data, selectedId]);

  async function setStatus(id: string, status: string, paymentDate?: string) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/payments/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentStatus: status, paymentDate }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? `Update failed (HTTP ${res.status})`);
      }
      // Optimistically move the payment out of "under review" into "past" for
      // its member; router.refresh() then reconciles with the server.
      setData((ds) =>
        ds.map((g) => {
          const b = g.underReview.find((x) => x.payment.id === id);
          if (!b) return g;
          // Move the same bundle into "past" with its new status/payment date so
          // the detail (invoice, timesheets, staffing, SOW) is preserved.
          const moved: ReviewBundle = {
            ...b,
            payment: { ...b.payment, status, paymentDate: paymentDate ?? b.payment.paymentDate },
          };
          return {
            ...g,
            underReview: g.underReview.filter((x) => x.payment.id !== id),
            past: [moved, ...g.past],
          };
        }),
      );
      setToast({ kind: "ok", msg: `Marked ${status}` });
      setPaidTargetId(null);
      router.refresh();
    } catch (e) {
      setToast({ kind: "error", msg: e instanceof Error ? e.message : "Update failed" });
    } finally {
      setSavingId(null);
    }
  }

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-10 text-center">
        <div className="text-sm font-medium text-slate-800">No members yet</div>
        <p className="mt-1 text-xs text-slate-500">
          No network member has submitted an invoice through the app yet.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* Member list */}
      <div className="self-start overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search members…"
            className="w-full"
          />
        </div>
        <ul className="max-h-[72vh] divide-y divide-slate-100 overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="p-6 text-center text-xs text-slate-400">No members match.</li>
          ) : (
            filtered.map((g) => {
              const active = g.memberId === selectedId;
              return (
                <li key={g.memberId}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(g.memberId)}
                    aria-pressed={active}
                    className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors ${
                      active ? "bg-brand-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div
                        className={`truncate text-sm font-medium demo-blur ${active ? "text-brand-800" : "text-slate-900"}`}
                      >
                        {g.memberName || g.memberCode || "—"}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {g.past.length} past payment{g.past.length === 1 ? "" : "s"}
                      </div>
                    </div>
                    {g.underReview.length > 0 ? (
                      <Badge tone="warning" className="shrink-0">
                        {g.underReview.length} to review
                      </Badge>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>

      {/* Detail */}
      {selected ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 demo-blur">
              {selected.memberName || selected.memberCode || "—"}
            </h2>
            {selected.memberCode ? (
              <div className="text-xs text-slate-500 demo-blur">{selected.memberCode}</div>
            ) : null}
          </div>

          {/* Under review */}
          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Under review · {selected.underReview.length}
            </h3>
            {selected.underReview.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
                Nothing under review for this member.
              </div>
            ) : (
              <div className="space-y-3">
                {selected.underReview.map((b) => (
                  <BundleDetail
                    key={b.payment.id}
                    bundle={b}
                    saving={savingId === b.payment.id}
                    open={openItems.has(b.payment.id)}
                    onToggle={() => toggleItem(b.payment.id)}
                    expandedTs={expandedTs}
                    toggleTs={toggleTs}
                    onApprove={() => setStatus(b.payment.id, "To be paid")}
                    onMarkPaid={() => setPaidTargetId(b.payment.id)}
                    onCancel={() => setStatus(b.payment.id, "Canceled")}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Past payments */}
          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Past payments · {selected.past.length}
            </h3>
            {selected.past.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
                No past payments yet.
              </div>
            ) : (
              <div className="space-y-3">
                {selected.past.map((b) => (
                  <BundleDetail
                    key={b.payment.id}
                    bundle={b}
                    readOnly
                    open={openItems.has(b.payment.id)}
                    onToggle={() => toggleItem(b.payment.id)}
                    expandedTs={expandedTs}
                    toggleTs={toggleTs}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      <PaidDateModal
        open={!!paidTargetId}
        busy={savingId === paidTargetId}
        onCancel={() => (savingId ? undefined : setPaidTargetId(null))}
        onConfirm={(date) => paidTargetId && setStatus(paidTargetId, "Paid", date)}
      />

      {toast ? (
        <div
          role="status"
          className={`pointer-events-none fixed bottom-4 right-4 z-50 rounded-lg border px-3 py-2 text-xs shadow-lg ${
            toast.kind === "error"
              ? "border-red-300 bg-red-50 text-red-800"
              : "border-emerald-300 bg-emerald-50 text-emerald-800"
          }`}
        >
          {toast.msg}
        </div>
      ) : null}
    </div>
  );
}

function BundleDetail({
  bundle: selected,
  saving = false,
  readOnly = false,
  open,
  onToggle,
  expandedTs,
  toggleTs,
  onApprove,
  onMarkPaid,
  onCancel,
}: {
  bundle: ReviewBundle;
  saving?: boolean;
  readOnly?: boolean;
  open: boolean;
  onToggle: () => void;
  expandedTs: Set<string>;
  toggleTs: (id: string) => void;
  onApprove?: () => void;
  onMarkPaid?: () => void;
  onCancel?: () => void;
}) {
  const tone = readOnly ? statusTone(selected.payment.status) : "review";
  const statusLabel = readOnly ? selected.payment.status || "—" : "Under review";
  return (
    <div
      className={`overflow-hidden rounded-lg border bg-white ${
        readOnly ? "border-slate-200" : "border-amber-300 ring-1 ring-amber-100"
      }`}
    >
      {/* Header + actions */}
      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              className="flex items-center gap-2 text-[11px] text-slate-500 hover:text-slate-700"
            >
              <svg
                viewBox="0 0 16 16"
                className={`h-3 w-3 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden
              >
                <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="rounded-md bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-white">
                #{selected.payment.code || "—"}
              </span>
              <StatusPill status={statusLabel} />
              {selected.payment.type ? <span>{selected.payment.type}</span> : null}
            </button>
          </div>
          <div className="text-right">
            <div className="text-xl font-semibold tabular-nums text-slate-900 demo-blur">
              {money(selected.payment.amount, selected.payment.currency)}
            </div>
            {selected.payment.amountEur != null && selected.payment.currency !== "EUR" ? (
              <div className="text-[11px] text-slate-400 demo-blur">
                ≈ {selected.payment.amountEur.toLocaleString("en-US", { maximumFractionDigits: 0 })} EUR
              </div>
            ) : null}
            {tone === "paid" && selected.payment.paymentDate ? (
              <div className="mt-0.5 text-[11px] text-emerald-700">
                Paid {selected.payment.paymentDate}
              </div>
            ) : selected.payment.dueDate ? (
              <div className="mt-0.5 text-[11px] text-slate-500">Due {selected.payment.dueDate}</div>
            ) : null}
          </div>
        </div>
        {selected.payment.comment ? (
          <p className="mt-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600 demo-blur">
            {selected.payment.comment}
          </p>
        ) : null}
        {!readOnly ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button tone="primary" size="sm" disabled={saving} onClick={onApprove}>
              Approve → To be paid
            </Button>
            <button
              type="button"
              disabled={saving}
              onClick={onMarkPaid}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Mark paid
            </button>
            <Button tone="danger" size="sm" disabled={saving} onClick={onCancel}>
              Cancel
            </Button>
            <Link
              href={`/admin/payments?search=${encodeURIComponent(selected.payment.code)}`}
              className="ml-auto text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              Open in Payments →
            </Link>
          </div>
        ) : open ? (
          <div className="mt-3 flex justify-end">
            <Link
              href={`/admin/payments?search=${encodeURIComponent(selected.payment.code)}`}
              className="text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              Open in Payments →
            </Link>
          </div>
        ) : null}
      </div>

      {open ? (
        <div className="divide-y divide-slate-100 border-t border-slate-100">
      {/* Invoice */}
      <Section title="Invoice">
        {selected.payment.invoicePdfUrl || selected.invoice?.pdfUrl ? (
          <div className="flex items-center gap-3">
            <DownloadChip
              url={selected.payment.invoicePdfUrl || selected.invoice?.pdfUrl}
              title="Open invoice PDF"
            />
            <div className="min-w-0 text-xs text-slate-600">
              <div className="font-mono text-[11px] text-slate-800">
                {selected.invoice?.code || selected.payment.invoiceReference || "Invoice"}
              </div>
              <div className="text-slate-500 demo-blur">
                {money(
                  selected.invoice?.amount ?? selected.payment.amount,
                  selected.invoice?.currency || selected.payment.currency,
                )}
                {selected.invoice?.submissionDate
                  ? ` · submitted ${selected.invoice.submissionDate.slice(0, 10)}`
                  : ""}
              </div>
            </div>
            {selected.payment.invoiceUrl ? (
              <a
                href={selected.payment.invoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                External link ↗
              </a>
            ) : null}
          </div>
        ) : (
          <Empty>No invoice PDF attached to this payment or its linked invoice.</Empty>
        )}
      </Section>

      {/* Timesheets */}
      <Section
        title="Timesheets"
        action={
          selected.staffing ? (
            <a
              href={`/print/staffing/${encodeURIComponent(selected.staffing.id)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              Download PDF ↗
            </a>
          ) : null
        }
      >
        {selected.timesheets.length === 0 ? (
          <Empty>No logged timesheets found on the associated staffing.</Empty>
        ) : (
          <div className="divide-y divide-slate-100">
            <p className="pb-2 text-[11px] text-slate-400">Click a week to see the day-by-day breakdown.</p>
            {selected.timesheets.map((t) => {
              const open = expandedTs.has(t.id);
              return (
                <div key={t.id}>
                  <button
                    type="button"
                    onClick={() => toggleTs(t.id)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-2 py-1.5 text-left text-xs hover:bg-slate-50"
                  >
                    <svg
                      viewBox="0 0 16 16"
                      className={`h-3 w-3 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden
                    >
                      <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="flex-1 whitespace-nowrap">
                      {t.startDate ? longDate(t.startDate) : "—"}
                      {t.endDate ? ` → ${longDate(t.endDate)}` : ""}
                    </span>
                    <span className="text-[10px] text-slate-500">{t.status}</span>
                    <span className="w-16 text-right tabular-nums font-medium">
                      {t.totalHours.toFixed(2)} h
                    </span>
                  </button>
                  {open ? (
                    <div className="mb-1 rounded-md bg-slate-50 p-2">
                      <table className="w-full text-xs">
                        <tbody>
                          {DAY_KEYS.map((k, i) => {
                            const d = t.days[k];
                            const iso = t.startDate ? addDaysIso(t.startDate, i) : null;
                            return (
                              <tr key={k} className="align-top">
                                <td className="py-0.5 pr-2 whitespace-nowrap text-slate-600">
                                  {DAY_LABELS[k]}
                                  {iso ? (
                                    <span className="ml-1 text-slate-400">{shortDayDate(iso)}</span>
                                  ) : null}
                                </td>
                                <td className="py-0.5 pr-2 text-right tabular-nums w-14">
                                  {d.hours ? d.hours.toFixed(2) : "—"}
                                </td>
                                <td className="py-0.5 text-slate-600 whitespace-pre-line demo-blur">
                                  {d.task || <span className="text-slate-300">—</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              );
            })}
            <div className="flex items-center justify-between py-1.5 text-xs font-semibold">
              <span>Total</span>
              <span className="tabular-nums">
                {selected.timesheets.reduce((s, t) => s + t.totalHours, 0).toFixed(2)} h
              </span>
            </div>
          </div>
        )}
      </Section>

      {/* Staffing */}
      <Section title="Staffing">
        {selected.staffing ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
            <Field label="Code" value={selected.staffing.code} mono />
            <Field label="Project role" value={selected.staffing.projectRole} />
            <Field label="Job title" value={selected.staffing.role} />
            <Field
              label="Rate / day"
              value={money(selected.staffing.ratePerDay, selected.staffing.currency)}
              blur
            />
            <Field
              label="Days (logged / alloc.)"
              value={`${(
                selected.timesheets.reduce((s, t) => s + t.totalHours, 0) / 8
              ).toFixed(2)} / ${selected.staffing.daysAllocated ?? "—"}`}
              blur
              hint="Logged days = submitted, invoiced and paid timesheet hours ÷ 8. Draft, cancelled and deleted weeks are excluded. Shown against the days allocated on the staffing."
            />
            <Field
              label="Period"
              value={
                selected.staffing.startDate || selected.staffing.endDate
                  ? `${selected.staffing.startDate ?? "—"} → ${selected.staffing.endDate ?? "—"}`
                  : "—"
              }
            />
          </dl>
        ) : (
          <Empty>This payment isn&apos;t linked to a staffing (no invoice link).</Empty>
        )}
      </Section>

      {/* Project + SOW */}
      <Section title="Project & SOW">
        {selected.project ? (
          <div className="text-xs">
            <div className="mb-2">
              <span className="font-mono text-[11px] text-slate-500">{selected.project.code}</span>{" "}
              <span className="text-slate-800 demo-blur">{selected.project.name}</span>
            </div>
            {selected.sowContracts.length === 0 ? (
              <Empty>No contract linked to this project.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {selected.sowContracts.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-1.5">
                    <DownloadChip url={c.pdfUrl} title="Open contract PDF" emptyTitle="No PDF" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-slate-800">
                        {c.type}
                        {c.side ? <span className="text-slate-400"> · {c.side}</span> : null}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {c.signatureDate ? `Signed ${c.signatureDate}` : "No signature date"}
                        {c.expiryDate ? ` · expires ${c.expiryDate}` : ""}
                      </div>
                    </div>
                    <ValidityChip validity={c.validity} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <Empty>No project associated with this payment.</Empty>
        )}
      </Section>
        </div>
      ) : null}
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  mono,
  blur,
  hint,
}: {
  label: string;
  value: string;
  mono?: boolean;
  blur?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-400">
        {label}
        {hint ? <InfoTip text={hint} /> : null}
      </dt>
      <dd className={`text-slate-800 ${mono ? "font-mono text-[11px]" : ""} ${blur ? "demo-blur" : ""}`}>
        {value || "—"}
      </dd>
    </div>
  );
}

// Small info icon with a modern hover/focus tooltip bubble.
function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label="More info"
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-slate-300 text-[8px] font-bold text-slate-400 hover:border-slate-400 hover:text-slate-600"
      >
        i
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 hidden w-52 -translate-x-1/2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-normal normal-case tracking-normal text-white shadow-lg group-hover:block group-focus-within:block"
      >
        {text}
        <span className="absolute left-1/2 top-full h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-slate-900" />
      </span>
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-slate-500">{children}</p>;
}

function ValidityChip({ validity }: { validity: string }) {
  if (!validity) return null;
  const v = validity.toLowerCase();
  const tone = v.includes("valid")
    ? "success"
    : v.includes("expir")
    ? "danger"
    : v.includes("missing")
    ? "warning"
    : "neutral";
  return (
    <Badge tone={tone} className="shrink-0">
      {validity}
    </Badge>
  );
}
