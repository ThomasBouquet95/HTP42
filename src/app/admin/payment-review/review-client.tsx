"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DownloadChip } from "@/components/download-chip";
import { ConfirmDialog } from "@/components/modal";
import { PaidDateModal } from "@/components/paid-date-modal";
import { SearchInput } from "@/components/search-input";
import { SegmentedTabs } from "@/components/filters";
import { Badge } from "@/components/badge";
import { StatusBadge, type ReviewInfo } from "@/components/status-badge";
import { Button } from "@/components/form-controls";
import type { TimesheetStatus } from "@/lib/airtable";

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
    memberNote: string;
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
  timesheetApproval: {
    total: number;
    approved: number;
    pending: number;
    rejected: number;
    allApproved: boolean;
  };
  timesheets: Array<{
    id: string;
    code: string;
    startDate: string | null;
    endDate: string | null;
    totalHours: number;
    status: TimesheetStatus;
    review?: ReviewInfo;
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
  // All outflow payment bundles for the member; the client buckets them by
  // payment status for the sub-tabs.
  bundles: ReviewBundle[];
};

// The review sub-tabs, in workflow order. Payments are reviewed by an admin
// only (client review is a timesheet concern, not a payment one), so there is a
// single "Review" queue rather than an admin/client split.
export type ReviewBucket = "review" | "toBePaid" | "paid" | "rejected" | "cancelled";

// Which bucket a bundle falls in, from its payment status.
export function bucketOfBundle(b: ReviewBundle): ReviewBucket {
  const s = b.payment.status;
  if (s === "Paid") return "paid";
  if (s === "Rejected") return "rejected";
  if (s === "Canceled") return "cancelled";
  if (s === "To be paid" || s === "Scheduled") return "toBePaid";
  // Under Review (or any legacy/blank status) awaits the admin's review.
  return "review";
}

const EMPTY_NOTES: Record<ReviewBucket, string> = {
  review: "Nothing awaiting review for this member.",
  toBePaid: "Nothing awaiting payment for this member.",
  paid: "No paid payments yet.",
  rejected: "No rejected payments.",
  cancelled: "No cancelled payments.",
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

// One distinct, non-yellow colour per payment status, shared by the status
// pill and the card ring so a status reads the same everywhere. "To be paid"
// is indigo (in flight), clearly different from "Under review" sky.
const PAY_META: Record<string, { label: string; pill: string; ring: string }> = {
  "Under Review": {
    label: "Under review",
    pill: "border-sky-200 bg-sky-50 text-sky-700",
    ring: "border-sky-300 ring-1 ring-sky-100",
  },
  Scheduled: {
    label: "Scheduled",
    pill: "border-indigo-200 bg-indigo-50 text-indigo-700",
    ring: "border-indigo-200 ring-1 ring-indigo-100",
  },
  "To be paid": {
    label: "To be paid",
    pill: "border-indigo-200 bg-indigo-50 text-indigo-700",
    ring: "border-indigo-200 ring-1 ring-indigo-100",
  },
  Paid: {
    label: "Paid",
    pill: "border-emerald-200 bg-emerald-50 text-emerald-700",
    ring: "border-slate-200",
  },
  Rejected: {
    label: "Rejected",
    pill: "border-rose-200 bg-rose-50 text-rose-700",
    ring: "border-slate-200",
  },
  Canceled: {
    label: "Canceled",
    pill: "border-slate-200 bg-slate-100 text-slate-500 line-through",
    ring: "border-slate-200",
  },
};
function payMeta(status: string) {
  return (
    PAY_META[status] ?? {
      label: status || "Under review",
      pill: "border-sky-200 bg-sky-50 text-sky-700",
      ring: "border-sky-300 ring-1 ring-sky-100",
    }
  );
}
function PayStatusPill({ status }: { status: string }) {
  const meta = payMeta(status);
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${meta.pill}`}>
      {meta.label}
    </span>
  );
}
export function PaymentReviewClient({
  groups,
  initialMemberId,
}: {
  groups: MemberGroup[];
  initialMemberId?: string;
}) {
  const router = useRouter();
  const [data, setData] = useState(groups);
  useEffect(() => setData(groups), [groups]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    initialMemberId ?? groups[0]?.memberId ?? null,
  );
  // Jump to a member when another view (By project / By member) links here.
  useEffect(() => {
    if (initialMemberId) setSelectedId(initialMemberId);
  }, [initialMemberId]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sectionTab, setSectionTab] = useState<ReviewBucket>("review");
  const [paidTargetId, setPaidTargetId] = useState<string | null>(null);
  // Note the admin is leaving for the member, carried into the paid-date step.
  const [pendingNote, setPendingNote] = useState("");
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

  // Bucket the selected member's bundles for the sub-tabs.
  const buckets = useMemo(() => {
    const b: Record<ReviewBucket, ReviewBundle[]> = {
      review: [],
      toBePaid: [],
      paid: [],
      rejected: [],
      cancelled: [],
    };
    for (const bundle of selected?.bundles ?? []) b[bucketOfBundle(bundle)].push(bundle);
    return b;
  }, [selected]);

  // Per-member counts for the rail (actionable = under review + to be paid).
  const countsByMember = useMemo(() => {
    const m = new Map<string, { review: number; toPay: number; total: number }>();
    for (const g of data) {
      let review = 0;
      let toPay = 0;
      for (const bd of g.bundles) {
        const bk = bucketOfBundle(bd);
        if (bk === "review") review += 1;
        else if (bk === "toBePaid") toPay += 1;
      }
      m.set(g.memberId, { review, toPay, total: g.bundles.length });
    }
    return m;
  }, [data]);

  // On (re)selecting a member, default the actionable cards open (under review +
  // to be paid) and terminal ones collapsed.
  useEffect(() => {
    const actionable = (selected?.bundles ?? []).filter((b) => {
      const bk = bucketOfBundle(b);
      return bk === "review" || bk === "toBePaid";
    });
    setOpenItems(new Set(actionable.map((b) => b.payment.id)));
  }, [selected]);

  // Keep a valid selection as the (filtered) list changes.
  useEffect(() => {
    if (data.length === 0) {
      setSelectedId(null);
    } else if (!data.some((g) => g.memberId === selectedId)) {
      setSelectedId(data[0].memberId);
    }
  }, [data, selectedId]);

  async function setStatus(id: string, status: string, paymentDate?: string, memberNote?: string) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/payments/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentStatus: status, paymentDate, memberNote }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? `Update failed (HTTP ${res.status})`);
      }
      // Optimistically update the bundle's status; the buckets memo re-sorts it
      // into the right sub-tab. router.refresh() then reconciles from the server.
      setData((ds) =>
        ds.map((g) => ({
          ...g,
          bundles: g.bundles.map((b) =>
            b.payment.id === id
              ? { ...b, payment: { ...b.payment, status, paymentDate: paymentDate ?? b.payment.paymentDate } }
              : b,
          ),
        })),
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

  // A payment can only advance to paid once its linked timesheets are approved.
  // If some are still under review, warn first; on confirm we auto-approve them
  // (the point of paying is that the work is accepted) and then run the action.
  const [approveConfirm, setApproveConfirm] = useState<
    { ids: string[]; count: number; onProceed: () => void } | null
  >(null);

  function guardApproval(b: ReviewBundle, proceed: () => void) {
    // Under-review / rejected weeks are the ones that block; Invoiced/Paid are
    // already past approval.
    const pending = b.timesheets
      .filter((t) => t.status === "Submitted" || t.status === "Rejected")
      .map((t) => t.id);
    if (b.timesheetApproval.allApproved || pending.length === 0) {
      proceed();
      return;
    }
    setApproveConfirm({ ids: pending, count: pending.length, onProceed: proceed });
  }

  async function approveTimesheets(ids: string[]) {
    const results = await Promise.all(
      ids.map((id) =>
        fetch(`/api/admin/timesheets/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "approve", comment: "Auto-approved on payment" }),
        }),
      ),
    );
    // A failed approval (e.g. a 403 for a scoped Project Manager) must block the
    // payment from advancing — throw so the caller skips onProceed and toasts.
    const failed = results.filter((r) => !r.ok).length;
    if (failed > 0) {
      throw new Error(`${failed} linked timesheet${failed === 1 ? "" : "s"} could not be approved.`);
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
                        {countsByMember.get(g.memberId)?.total ?? 0} payment
                        {(countsByMember.get(g.memberId)?.total ?? 0) === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {(countsByMember.get(g.memberId)?.review ?? 0) > 0 ? (
                        <Badge tone="warning">
                          {countsByMember.get(g.memberId)?.review} to review
                        </Badge>
                      ) : null}
                      {(countsByMember.get(g.memberId)?.toPay ?? 0) > 0 ? (
                        <Badge tone="info">{countsByMember.get(g.memberId)?.toPay} to pay</Badge>
                      ) : null}
                    </div>
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

          <div className="overflow-x-auto">
            <SegmentedTabs
              ariaLabel="Payment status"
              value={sectionTab}
              onChange={setSectionTab}
              options={[
                { value: "review", label: "Review", badge: <TabCount n={buckets.review.length} tone="warning" /> },
                { value: "toBePaid", label: "To be paid", badge: <TabCount n={buckets.toBePaid.length} tone="info" /> },
                { value: "paid", label: "Paid", badge: <TabCount n={buckets.paid.length} tone="muted" /> },
                { value: "rejected", label: "Rejected", badge: <TabCount n={buckets.rejected.length} tone="muted" /> },
                { value: "cancelled", label: "Cancelled", badge: <TabCount n={buckets.cancelled.length} tone="muted" /> },
              ]}
            />
          </div>

          {buckets[sectionTab].length === 0 ? (
            <EmptyNote>{EMPTY_NOTES[sectionTab]}</EmptyNote>
          ) : (
            <div className="space-y-3">
              {buckets[sectionTab].map((b) => (
                <BundleDetail
                  key={b.payment.id}
                  bundle={b}
                  saving={savingId === b.payment.id}
                  open={openItems.has(b.payment.id)}
                  onToggle={() => toggleItem(b.payment.id)}
                  expandedTs={expandedTs}
                  toggleTs={toggleTs}
                  // Approve = advance to "To be paid". This is the ONLY step
                  // that validates timesheets: the guard auto-approves any
                  // linked week still under review / rejected (with a popup).
                  onApprove={(note) =>
                    guardApproval(b, () => setStatus(b.payment.id, "To be paid", undefined, note))
                  }
                  // Mark paid never re-checks timesheets (they were validated at
                  // the approve step); it just needs the payment date.
                  onMarkPaid={(note) => {
                    setPendingNote(note);
                    setPaidTargetId(b.payment.id);
                  }}
                  onSetStatus={(status, note) => setStatus(b.payment.id, status, undefined, note)}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}

      <PaidDateModal
        open={!!paidTargetId}
        busy={savingId === paidTargetId}
        onCancel={() => (savingId ? undefined : (setPaidTargetId(null), setPendingNote("")))}
        onConfirm={(date) => paidTargetId && setStatus(paidTargetId, "Paid", date, pendingNote)}
      />

      <ConfirmDialog
        open={!!approveConfirm}
        title="Approve linked timesheets?"
        message={`${approveConfirm?.count ?? 0} linked timesheet${
          approveConfirm?.count === 1 ? " is" : "s are"
        } not yet approved (under review or rejected). Approving this payment will automatically approve ${
          approveConfirm?.count === 1 ? "it" : "them"
        }. Continue?`}
        confirmLabel="Approve and continue"
        onCancel={() => setApproveConfirm(null)}
        onConfirm={async () => {
          const c = approveConfirm;
          setApproveConfirm(null);
          if (!c) return;
          try {
            await approveTimesheets(c.ids);
            c.onProceed();
          } catch {
            setToast({ kind: "error", msg: "Could not approve the linked timesheets." });
          }
        }}
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

// Count pill for the status tabs: amber for the actionable "under review",
// brand for "to be paid", muted for "past". Hidden at zero.
function TabCount({ n, tone }: { n: number; tone: "warning" | "info" | "muted" }) {
  if (n === 0) return null;
  const cls =
    tone === "warning"
      ? "bg-amber-100 text-amber-800"
      : tone === "info"
        ? "bg-brand-100 text-brand-800"
        : "bg-slate-200 text-slate-600";
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold ${cls}`}>
      {n}
    </span>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
      {children}
    </div>
  );
}

function BundleDetail({
  bundle: selected,
  saving = false,
  open,
  onToggle,
  expandedTs,
  toggleTs,
  onApprove,
  onMarkPaid,
  onSetStatus,
}: {
  bundle: ReviewBundle;
  saving?: boolean;
  open: boolean;
  onToggle: () => void;
  expandedTs: Set<string>;
  toggleTs: (id: string) => void;
  onApprove: (note: string) => void;
  onMarkPaid: (note: string) => void;
  onSetStatus: (status: string, note: string) => void;
}) {
  const status = selected.payment.status || "Under Review";
  const isToPay = status === "To be paid" || status === "Scheduled";
  const isPaid = status === "Paid";
  const isRejected = status === "Rejected";
  const isCanceled = status === "Canceled";
  const isUnderReview = !isToPay && !isPaid && !isRejected && !isCanceled;
  const [note, setNote] = useState(selected.payment.memberNote ?? "");
  return (
    <div className={`overflow-hidden rounded-lg border bg-white ${payMeta(status).ring}`}>
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
              <PayStatusPill status={status} />
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
            {isPaid && selected.payment.paymentDate ? (
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
        <div className="mt-3 space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Note to the member (optional) — shown on their invoice, e.g. why it was rejected"
            className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
          />
          <div className="flex flex-wrap items-center gap-2">
            {/* Advance to "To be paid": from Under review (validates timesheets)
                or reviving a Rejected payment. */}
            {isUnderReview ? (
              <Button tone="primary" size="sm" disabled={saving} onClick={() => onApprove(note)}>
                Approve → To be paid
              </Button>
            ) : null}
            {isRejected ? (
              <Button tone="primary" size="sm" disabled={saving} onClick={() => onApprove(note)}>
                Move to To be paid
              </Button>
            ) : null}
            {isToPay ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => onMarkPaid(note)}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Mark as paid
              </button>
            ) : null}
            {/* Reverse a Paid payment (correction): straight back to To be paid. */}
            {isPaid ? (
              <Button tone="secondary" size="sm" disabled={saving} onClick={() => onSetStatus("To be paid", note)}>
                Back to To be paid
              </Button>
            ) : null}
            {/* Back to Under review is available from every non-review state. */}
            {isToPay || isRejected || isCanceled || isPaid ? (
              <Button
                tone="secondary"
                size="sm"
                disabled={saving}
                onClick={() => onSetStatus("Under Review", note)}
              >
                Back to Under review
              </Button>
            ) : null}
            {isUnderReview || isToPay ? (
              <Button tone="danger" size="sm" disabled={saving} onClick={() => onSetStatus("Rejected", note)}>
                Reject
              </Button>
            ) : null}
            {isUnderReview || isToPay || isRejected || isPaid ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => onSetStatus("Canceled", note)}
                className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel payment
              </button>
            ) : null}
            <Link
              href={`/admin/payments?payment=${encodeURIComponent(selected.payment.id)}`}
              className="ml-auto text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              Open in Payments →
            </Link>
          </div>
        </div>
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
              {selected.invoice?.code || selected.payment.invoiceReference ? (
                <a
                  href={`/admin/invoices?search=${encodeURIComponent(
                    selected.invoice?.code || selected.payment.invoiceReference || "",
                  )}`}
                  className="mt-0.5 inline-block font-medium text-brand-700 hover:underline"
                >
                  View in Invoices
                </a>
              ) : null}
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
          <div className="flex items-center gap-3">
            <ApprovalRollup rollup={selected.timesheetApproval} />
            {selected.staffing ? (
              <a
                href={`/print/staffing/${encodeURIComponent(selected.staffing.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                Download PDF ↗
              </a>
            ) : null}
          </div>
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
                    <StatusBadge status={t.status} review={t.review} />
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

// At-a-glance approval state for the linked timesheets. Green when every week is
// approved; amber/rose warning (with an explanation) when any week is still
// under review or was rejected, so an admin immediately spots the anomaly.
function ApprovalRollup({
  rollup,
}: {
  rollup: ReviewBundle["timesheetApproval"];
}) {
  if (rollup.total === 0) return null;

  if (rollup.allApproved) {
    return (
      <Badge tone="success" className="gap-1">
        <span aria-hidden>✅</span>
        All timesheets approved
      </Badge>
    );
  }

  const parts: string[] = [];
  if (rollup.pending > 0) parts.push(`${rollup.pending} under review`);
  if (rollup.rejected > 0) parts.push(`${rollup.rejected} rejected`);
  const tone = rollup.rejected > 0 ? "danger" : "warning";

  return (
    <span className="inline-flex items-center gap-1">
      <Badge tone={tone} className="gap-1">
        <span aria-hidden>{rollup.rejected > 0 ? "❌" : "⏳"}</span>
        {parts.join(" · ")}
      </Badge>
      <InfoTip text="This payment links a timesheet that is not approved. Invoiced and paid weeks were approved by construction, so an under review or rejected week here needs attention before payment." />
    </span>
  );
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
