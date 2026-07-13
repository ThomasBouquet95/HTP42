"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminTimesheetRecord, MemberInvoiceRecord, TimesheetStatus } from "@/lib/airtable";
import { TIMESHEET_STATUSES } from "@/lib/airtable";
import { StatusBadge, timesheetStatusLabel } from "@/components/status-badge";
import { WeekChip } from "@/components/week-chip";
import { Button } from "@/components/form-controls";
import { FilterBar, FilterMultiSelect, FilterDateRange, SegmentedTabs } from "@/components/filters";
import { StatusPill } from "@/components/badge";
import { TimesheetsByProject, TimesheetsByMember } from "./timesheets-breakdown";
import { TimesheetReviewClient } from "./review-client";
import { dayIsos, downloadTimesheetsCsv } from "./timesheets-export";

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;

// Statuses the admin can pick from the inline row dropdown. Only the
// review-lifecycle states are manually settable — Invoiced and Paid are
// system-driven (the invoice flow flips Approved → Invoiced, and the payment
// cascade flips Invoiced → Paid), so they're never offered here. Rows already
// in those states (or Deleted) render as a read-only badge instead of a select.
const ADMIN_EDITABLE_STATUSES: TimesheetStatus[] = [
  "Draft",
  "Submitted",
  "Approved",
  "Rejected",
  "Cancelled",
];
// System-driven states shown read-only in the Overview table.
const LOCKED_TIMESHEET_STATUSES: TimesheetStatus[] = ["Invoiced", "Paid", "Deleted"];

type Filters = {
  // Multi-select: a timesheet matches when its status is in this set. An empty
  // set means "no status filter" (show everything). Member / project /
  // staffing are likewise multi-select — empty means "no filter".
  status: TimesheetStatus[];
  memberCodes: string[];
  projectCodes: string[];
  from: string;
  to: string;
};

// Admins land on the billing lifecycle — Submitted (Under Review), Approved,
// Invoiced, Paid — which is the actionable pile. Drafts (members' work-in-
// progress), Rejected, Cancelled and Deleted are hidden by default but can be
// toggled on.
const DEFAULT_FILTERS: Filters = {
  status: ["Submitted", "Approved", "Invoiced", "Paid"],
  memberCodes: [],
  projectCodes: [],
  from: "",
  to: "",
};

type PaymentLink = { id: string; code: string; status: string };
type SowInfo = { reference: string; status: string; daysAllocated: number | null; url: string };
export type TimesheetView = "review" | "overview" | "byproject" | "bymember";
type Props = {
  timesheets: AdminTimesheetRecord[];
  invoices: MemberInvoiceRecord[];
  paymentByInvoiceId: Record<string, PaymentLink>;
  sowByStaffing: Record<string, SowInfo>;
  // Sub-tabs this role may see (level-two permissions). The first one is the
  // landing tab. A Project Manager, for example, only gets "review".
  allowedViews: TimesheetView[];
  // When set, this role only sees timesheets for these projects (Project
  // Manager scoping). Null means "all projects" (unscoped admin roles).
  scopeProjects: string[] | null;
};

// Invoices tied to a timesheet: same staffing first, else same member+project
// (covers invoices created before the staffing link existed).
function relatedInvoicesFor(
  t: AdminTimesheetRecord,
  invoices: MemberInvoiceRecord[],
): MemberInvoiceRecord[] {
  const byStaffing = invoices.filter(
    (i) => i.staffingRecordId && i.staffingRecordId === t.staffingRecordId,
  );
  if (byStaffing.length > 0) return byStaffing;
  return invoices.filter(
    (i) => i.memberRecordId === t.memberRecordId && i.projectCode && i.projectCode === t.projectCode,
  );
}

export function AdminTimesheetsClient({ timesheets, invoices, paymentByInvoiceId, sowByStaffing, allowedViews, scopeProjects }: Props) {
  const router = useRouter();
  // Overview (filterable table) · By project · By member — the two breakdown
  // views live in their own tabs instead of inline cards above the table.
  // A role may be limited to a subset of tabs (e.g. Project Manager → Review
  // only); land on Overview when it's allowed, else the first allowed tab.
  const [view, setView] = useState<TimesheetView>(
    allowedViews.includes("overview") ? "overview" : allowedViews[0] ?? "overview",
  );
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  // Jumping from a breakdown group into the Overview, pre-filtered to that
  // project + member.
  function drillToOverview(projectCode: string | null, memberCode: string | null) {
    // Group keys use "—" as the placeholder for "no project"; that isn't a real
    // code, so treat it as no filter rather than a value that matches nothing.
    const proj = projectCode && projectCode !== "—" ? [projectCode] : [];
    const mem = memberCode && memberCode !== "—" ? [memberCode] : [];
    setFilters({
      ...DEFAULT_FILTERS,
      status: [],
      projectCodes: proj,
      memberCodes: mem,
    });
    setView("overview");
  }
  // Local mirror so an inline Status change feels instant even before the
  // server round-trip lands.
  const [rows, setRows] = useState<AdminTimesheetRecord[]>(timesheets);
  useEffect(() => setRows(timesheets), [timesheets]);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  // Rows expanded inline to show the day-by-day comments + related invoices.
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  function toggleRow(id: string) {
    setExpandedRows((prev) => {
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

  async function updateStatus(id: string, next: TimesheetStatus) {
    const previous = rows.find((r) => r.id === id)?.status;
    if (!previous || previous === next) return;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: next } : r)));
    setSavingIds((s) => new Set(s).add(id));
    try {
      const res = await fetch(`/api/admin/timesheets/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? `Update failed (HTTP ${res.status})`);
      }
      setToast({ kind: "ok", msg: "Status updated" });
      router.refresh();
    } catch (e) {
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: previous } : r)));
      setToast({ kind: "error", msg: e instanceof Error ? e.message : "Update failed" });
    } finally {
      setSavingIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }

  // Record an audited review decision (approve/reject) for a Submitted row.
  // Same optimistic pattern as updateStatus, but hits the decision path of the
  // admin API ({ action, comment }) instead of a raw { status } write.

  // Open the printable (Save-as-PDF) staffing report in a new tab. It lives at
  // /print/staffing/[id] (no app header) and auto-opens the print dialog.
  function openStaffingPrint(staffingId: string) {
    if (!staffingId) return;
    window.open(`/print/staffing/${encodeURIComponent(staffingId)}`, "_blank", "noopener");
  }

  const memberOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of rows) {
      if (t.memberCode) map.set(t.memberCode, t.memberName || t.memberCode);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const projectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of rows) {
      if (t.projectCode) map.set(t.projectCode, t.projectName || t.projectCode);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((t) => {
      if (filters.status.length > 0 && !filters.status.includes(t.status)) return false;
      if (filters.memberCodes.length && !filters.memberCodes.includes(t.memberCode)) return false;
      if (filters.projectCodes.length && !filters.projectCodes.includes(t.projectCode)) return false;
      if (filters.from && (t.startDate ?? "") < filters.from) return false;
      if (filters.to && (t.startDate ?? "") > filters.to) return false;
      return true;
    });
  }, [rows, filters]);

  // Aggregations always exclude Deleted timesheets so totals reflect real
  // logged effort. Deleted rows still render in the table for context.
  const countable = useMemo(
    () => filtered.filter((t) => t.status !== "Deleted"),
    [filtered],
  );

  const total = useMemo(() => countable.reduce((s, t) => s + t.totalHours, 0), [countable]);

  const byMember = useMemo(() => {
    const map = new Map<string, { code: string; name: string; hours: number; weeks: number }>();
    for (const t of countable) {
      const cur = map.get(t.memberCode) ?? {
        code: t.memberCode,
        name: t.memberName || t.memberCode,
        hours: 0,
        weeks: 0,
      };
      cur.hours += t.totalHours;
      cur.weeks += 1;
      map.set(t.memberCode, cur);
    }
    return [...map.values()].sort((a, b) => b.hours - a.hours);
  }, [countable]);

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function exportCsv() {
    // Exports cover the whole "officially logged" lifecycle: Submitted,
    // Invoiced, Paid. Drafts and Deleted are always excluded (see
    // downloadTimesheetsCsv / toCsvRows).
    downloadTimesheetsCsv(filtered);
  }

  // Open a printable (Save-as-PDF) report of the currently filtered timesheets.
  // The active filters are passed to the print route, which re-applies them
  // server-side and auto-opens the print dialog (same pattern as the staffing
  // PDF). Like the CSV, it covers the Submitted/Invoiced/Paid lifecycle.
  function exportPdf() {
    const p = new URLSearchParams();
    if (filters.status.length > 0) p.set("status", filters.status.join(","));
    if (filters.memberCodes.length) p.set("member", filters.memberCodes.join(","));
    if (filters.projectCodes.length) p.set("project", filters.projectCodes.join(","));
    if (filters.from) p.set("from", filters.from);
    if (filters.to) p.set("to", filters.to);
    window.open(`/print/timesheets?${p.toString()}`, "_blank", "noopener");
  }

  // Count of timesheets awaiting a decision, for the Review tab badge.
  const underReviewCount = rows.filter((r) => r.status === "Submitted").length;

  // Only render the tabs this role is allowed to see. A single-tab role (e.g.
  // Project Manager → Review) still gets the content, just without a picker.
  const allTabs = [
    {
      value: "review" as const,
      label: "Review",
      badge:
        underReviewCount > 0 ? (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">
            {underReviewCount}
          </span>
        ) : undefined,
    },
    { value: "overview" as const, label: "Overview" },
    { value: "byproject" as const, label: "By project" },
    { value: "bymember" as const, label: "By member" },
  ];
  const tabs = allTabs.filter((t) => allowedViews.includes(t.value));

  return (
    <div className="space-y-4">
      {tabs.length > 1 ? (
        <SegmentedTabs ariaLabel="Timesheets view" value={view} onChange={setView} options={tabs} />
      ) : null}

      {view === "review" ? (
        <TimesheetReviewClient timesheets={rows} sowByStaffing={sowByStaffing} scopeProjects={scopeProjects} />
      ) : view === "byproject" ? (
        <TimesheetsByProject timesheets={rows} sowByStaffing={sowByStaffing} onDrill={drillToOverview} />
      ) : view === "bymember" ? (
        <TimesheetsByMember timesheets={rows} sowByStaffing={sowByStaffing} onDrill={drillToOverview} />
      ) : (
      <>
      {/* Filter bar */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterBar>
            <FilterMultiSelect
              label="Status"
              selected={filters.status}
              onChange={(v) => update("status", v as TimesheetStatus[])}
              options={TIMESHEET_STATUSES.map((s) => ({ value: s, label: s }))}
            />
            <FilterMultiSelect
              label="Member"
              selected={filters.memberCodes}
              onChange={(v) => update("memberCodes", v)}
              options={memberOptions.map(([code, name]) => ({ value: code, label: `${code} · ${name}` }))}
            />
            <FilterMultiSelect
              label="Project"
              selected={filters.projectCodes}
              onChange={(v) => update("projectCodes", v)}
              options={projectOptions.map(([code, name]) => ({
                value: code,
                label: name && name !== code ? `${code} · ${name}` : code,
              }))}
            />
            <FilterDateRange
              label="Week"
              from={filters.from}
              to={filters.to}
              onFrom={(v) => update("from", v)}
              onTo={(v) => update("to", v)}
            />
          </FilterBar>
          <div className="flex gap-2">
            <Button tone="secondary" size="sm" onClick={() => setFilters(DEFAULT_FILTERS)}>
              Reset
            </Button>
            <Button tone="primary" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
              Export CSV
            </Button>
            <Button tone="secondary" size="sm" onClick={exportPdf} disabled={filtered.length === 0}>
              Export PDF
            </Button>
          </div>
        </div>
        <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          {countable.length} timesheet{countable.length === 1 ? "" : "s"} ·{" "}
          <span className="font-semibold text-slate-800">{total.toFixed(2)} h</span> ·{" "}
          {byMember.length} member{byMember.length === 1 ? "" : "s"}
        </div>
      </div>

      {/* Main table. Rows open the detail modal; the status chip stays inline. */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-6 px-1 py-1.5" />
              <th className="text-left px-2 py-1.5 font-medium whitespace-nowrap">Week</th>
              <th className="text-left px-2 py-1.5 font-medium">Member</th>
              <th className="text-left px-2 py-1.5 font-medium">Staffing</th>
              <th className="text-left px-2 py-1.5 font-medium">Status</th>
              {DAY_KEYS.map((k) => (
                <th key={k} className="text-right px-2 py-1.5 font-medium normal-case tracking-normal">
                  {k.slice(0, 3).replace(/^./, (c) => c.toUpperCase())}
                </th>
              ))}
              <th className="text-right px-2 py-1.5 font-medium">Total</th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={12} className="text-center text-slate-500 py-10">
                  No timesheets match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((t) => {
                const open = expandedRows.has(t.id);
                const dates = dayIsos(t.startDate);
                return (
                <Fragment key={t.id}>
                <tr
                  onClick={() => toggleRow(t.id)}
                  aria-expanded={open}
                  className="border-t border-slate-100 align-top cursor-pointer hover:bg-slate-50"
                  title="Click to show the day-by-day comments"
                >
                  <td className="px-1 py-1.5 text-center">
                    <svg
                      viewBox="0 0 16 16"
                      className={`inline h-3 w-3 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden
                    >
                      <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <WeekChip startIso={t.startDate} endIso={t.endDate} />
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="font-mono text-[10px] text-slate-500">{t.memberCode}</div>
                    <div className="demo-blur">{t.memberName || "—"}</div>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="font-mono text-[10px] text-slate-500">{t.staffingCode}</div>
                    <div className="truncate max-w-[16rem] demo-blur">{t.projectName || t.projectCode || "—"}</div>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <AdminStatusSelect
                      value={t.status}
                      disabled={savingIds.has(t.id) || LOCKED_TIMESHEET_STATUSES.includes(t.status)}
                      onChange={(v) => updateStatus(t.id, v)}
                    />
                  </td>
                  {DAY_KEYS.map((k) => (
                    <td key={k} className="px-2 py-1.5 text-right tabular-nums">
                      {t[k].hours ? t[k].hours.toFixed(2) : <span className="text-slate-300">—</span>}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
                    {t.totalHours.toFixed(2)}
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => openStaffingPrint(t.staffingRecordId)}
                      disabled={!t.staffingRecordId}
                      title="Open a printable PDF of this staffing's timesheets"
                      aria-label="Staffing timesheets PDF"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-40"
                    >
                      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                        <path d="M8 2v7m0 0L5.5 6.5M8 9l2.5-2.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M3 11v1.5A1.5 1.5 0 004.5 14h7a1.5 1.5 0 001.5-1.5V11" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </td>
                </tr>
                {open ? (
                  <tr className="border-t border-slate-100 bg-slate-50/60">
                    <td />
                    <td colSpan={11} className="px-3 py-2">
                      <table className="w-full text-xs">
                        <tbody>
                          {DAY_KEYS.map((k) => (
                            <tr key={k} className="align-top">
                              <td className="w-28 py-0.5 pr-2 whitespace-nowrap text-slate-600">
                                {k.slice(0, 3).replace(/^./, (c) => c.toUpperCase())}
                                {dates[k] ? (
                                  <span className="ml-1 text-slate-400">{dates[k]}</span>
                                ) : null}
                              </td>
                              <td className="w-14 py-0.5 pr-3 text-right tabular-nums">
                                {t[k].hours ? t[k].hours.toFixed(2) : <span className="text-slate-300">—</span>}
                              </td>
                              <td className="py-0.5 whitespace-pre-line text-slate-700 demo-blur">
                                {t[k].task || <span className="text-slate-300">—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <RelatedInvoices
                        invoices={relatedInvoicesFor(t, invoices)}
                        paymentByInvoiceId={paymentByInvoiceId}
                      />
                    </td>
                  </tr>
                ) : null}
                </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      </>
      )}

      {toast ? (
        <div
          role="status"
          className={`pointer-events-none fixed bottom-4 right-4 z-[70] rounded-lg border px-3 py-2 text-xs shadow-lg ${
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

// Related invoices for an expanded timesheet row: the invoices on the same
// staffing, each linked to the payment that settles it (when there is one).
function RelatedInvoices({
  invoices,
  paymentByInvoiceId,
}: {
  invoices: MemberInvoiceRecord[];
  paymentByInvoiceId: Record<string, PaymentLink>;
}) {
  return (
    <div className="mt-3 border-t border-slate-100 pt-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Related invoices
      </div>
      {invoices.length === 0 ? (
        <p className="mt-1 text-[11px] text-slate-400">No invoices on this staffing yet.</p>
      ) : (
        <ul className="mt-1 divide-y divide-slate-100">
          {invoices.map((inv) => {
            const payment = paymentByInvoiceId[inv.id];
            return (
              <li key={inv.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-[11px]">
                {/* Left: amount, PDF, then the invoice code + date. */}
                <span className="w-24 shrink-0 font-semibold tabular-nums text-slate-900 demo-blur">
                  {inv.amount != null
                    ? `${inv.amount.toLocaleString("en-US")} ${inv.currency || ""}`.trim()
                    : "—"}
                </span>
                {inv.pdf?.url ? (
                  <a
                    href={inv.pdf.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-medium text-brand-600 hover:bg-slate-50"
                  >
                    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                      <path d="M9 2H4.5A1.5 1.5 0 003 3.5v9A1.5 1.5 0 004.5 14h7a1.5 1.5 0 001.5-1.5V6z" strokeLinejoin="round" />
                      <path d="M9 2v4h4" strokeLinejoin="round" />
                    </svg>
                    PDF
                  </a>
                ) : (
                  <span className="w-12 shrink-0 text-slate-300">no PDF</span>
                )}
                <span className="font-mono text-slate-600">{inv.invoiceCode || "—"}</span>
                {inv.submissionDate ? (
                  <span className="text-slate-400">{inv.submissionDate.slice(0, 10)}</span>
                ) : null}
                {/* Status + the settling payment, kept inline on the left. */}
                <div className="flex shrink-0 items-center gap-2">
                  {inv.status ? <StatusPill status={inv.status} /> : null}
                  {payment ? (
                    <a
                      href={`/admin/payments?payment=${encodeURIComponent(payment.id)}`}
                      className="inline-flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-1.5 py-0.5 font-mono text-[10px] text-brand-700 hover:bg-brand-100"
                      title={`Open payment${payment.status ? ` (${payment.status})` : ""}`}
                    >
                      Payment #{payment.code}
                      {payment.status ? <span className="font-sans text-slate-500">· {payment.status}</span> : null}
                      <span aria-hidden>↗</span>
                    </a>
                  ) : (
                    <span className="text-slate-300">no payment yet</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Inline status editor for the admin table. Looks like the StatusBadge with a
// small chevron tacked on so admins can see at a glance that it's editable.
// Mirrors StatusBadge: neutral → amber → blue → solid green across the
// Draft → Submitted → Invoiced → Paid lifecycle; Deleted is a red tombstone.
const STATUS_CHIP: Record<TimesheetStatus, string> = {
  Draft: "bg-slate-100 text-slate-600 border-slate-200",
  Submitted: "bg-amber-50 text-amber-700 border-amber-200",
  Approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Rejected: "bg-rose-50 text-rose-700 border-rose-200",
  Invoiced: "bg-blue-50 text-blue-700 border-blue-200",
  Paid: "bg-emerald-100 text-emerald-800 border-emerald-300",
  Cancelled: "bg-slate-100 text-slate-500 border-slate-200 line-through",
  Deleted: "bg-rose-50 text-rose-700 border-rose-200",
};

// A transparent <select> sits on top so a single click opens the native
// dropdown. Disabled rows (e.g. Deleted) drop the chevron and the overlay.
function AdminStatusSelect({
  value,
  disabled,
  onChange,
}: {
  value: TimesheetStatus;
  disabled?: boolean;
  onChange: (v: TimesheetStatus) => void;
}) {
  if (disabled) return <StatusBadge status={value} showIcon={false} />;
  const cls = STATUS_CHIP[value];
  return (
    <span
      className={`relative inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cls} ring-1 ring-transparent transition hover:ring-slate-300`}
      title="Click to change status"
    >
      <span>{timesheetStatusLabel(value)}</span>
      <svg
        viewBox="0 0 16 16"
        className="h-3 w-3 opacity-60"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as TimesheetStatus)}
        aria-label="Change status"
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {ADMIN_EDITABLE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {timesheetStatusLabel(s)}
          </option>
        ))}
      </select>
    </span>
  );
}

