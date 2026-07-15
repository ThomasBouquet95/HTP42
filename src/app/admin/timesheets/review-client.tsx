"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminTimesheetRecord } from "@/lib/airtable";
import { Badge } from "@/components/badge";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/form-controls";
import { SearchInput } from "@/components/search-input";
import { SegmentedTabs } from "@/components/filters";
import { formatWeekRange } from "@/lib/dates";
import { dayIsos } from "./timesheets-export";
import { SowChip, type SowInfo } from "./timesheets-breakdown";

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;

type Group = {
  memberId: string;
  memberName: string;
  memberCode: string;
  underReview: AdminTimesheetRecord[];
  approved: AdminTimesheetRecord[];
  rejected: AdminTimesheetRecord[];
};

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Admin timesheet review, master-detail like Payment Review: a left rail of
// members (with a "to review" badge), and per-member Under review / Approved /
// Rejected sections. Approve/Reject (and override) happen here, not in Overview.
export function TimesheetReviewClient({
  timesheets,
  sowByStaffing,
  scopeProjects,
  onEdit,
}: {
  timesheets: AdminTimesheetRecord[];
  sowByStaffing?: Record<string, SowInfo>;
  // When set, this reviewer (a Project Manager) only sees these projects.
  // Rendered as a banner so the limited scope is explicit, not implied.
  scopeProjects?: string[] | null;
  onEdit?: (t: AdminTimesheetRecord) => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(timesheets);
  useEffect(() => setRows(timesheets), [timesheets]);

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const t of rows) {
      if (t.status !== "Submitted" && t.status !== "Approved" && t.status !== "Rejected") continue;
      const key = t.memberRecordId || t.memberCode || "—";
      const g =
        map.get(key) ??
        {
          memberId: key,
          memberName: t.memberName || t.memberCode,
          memberCode: t.memberCode,
          underReview: [],
          approved: [],
          rejected: [],
        };
      if (t.status === "Submitted") g.underReview.push(t);
      else if (t.status === "Approved") g.approved.push(t);
      else g.rejected.push(t);
      map.set(key, g);
    }
    const sortWeek = (a: AdminTimesheetRecord, b: AdminTimesheetRecord) =>
      (b.startDate ?? "").localeCompare(a.startDate ?? "");
    const list = [...map.values()];
    for (const g of list) {
      g.underReview.sort(sortWeek);
      g.approved.sort(sortWeek);
      g.rejected.sort(sortWeek);
    }
    // Members with pending reviews first, then most-recently-active.
    return list.sort(
      (a, b) => b.underReview.length - a.underReview.length || a.memberName.localeCompare(b.memberName),
    );
  }, [rows]);

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(groups[0]?.memberId ?? null);
  const [statusTab, setStatusTab] = useState<"underReview" | "approved" | "rejected">("underReview");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // One-time cutover helper: legacy timesheets still marked "Invoiced" from
  // before the approval workflow. Offer a one-click reset to Under review.
  const invoicedCount = useMemo(
    () => timesheets.filter((t) => t.status === "Invoiced").length,
    [timesheets],
  );
  const [migrating, setMigrating] = useState(false);
  async function resetLegacyInvoiced() {
    if (
      !window.confirm(
        `Reset ${invoicedCount} timesheet(s) still marked "Invoiced" back to Under review? Do this once, at cutover. It does not affect Paid weeks.`,
      )
    )
      return;
    setMigrating(true);
    try {
      const res = await fetch("/api/admin/timesheets/migrate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: "RESET-INVOICED-TO-UNDER-REVIEW" }),
      });
      const d = (await res.json().catch(() => ({}))) as { updated?: number; error?: string };
      if (!res.ok) throw new Error(d.error ?? "Reset failed.");
      setToast({ kind: "ok", msg: `Reset ${d.updated ?? 0} timesheet(s) to Under review` });
      router.refresh();
    } catch (e) {
      setToast({ kind: "error", msg: e instanceof Error ? e.message : "Reset failed." });
    } finally {
      setMigrating(false);
    }
  }
  const legacyBanner =
    invoicedCount > 0 ? (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
        <span>
          <strong>{invoicedCount}</strong> timesheet{invoicedCount === 1 ? "" : "s"} still marked
          &ldquo;Invoiced&rdquo; from before the approval workflow.
        </span>
        <button
          type="button"
          onClick={resetLegacyInvoiced}
          disabled={migrating}
          className="ml-auto rounded-md bg-amber-600 px-2.5 py-1 font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
        >
          {migrating ? "Resetting…" : "Reset to Under review"}
        </button>
      </div>
    ) : null;

  // "Paid" is a payment status, not a timesheet one. Offer a one-click reset of
  // any timesheets stuck at Paid back to Approved.
  const paidCount = useMemo(
    () => timesheets.filter((t) => t.status === "Paid").length,
    [timesheets],
  );
  async function resetPaid() {
    if (
      !window.confirm(
        `Reset ${paidCount} timesheet(s) marked "Paid" back to Approved? Paid is a payment status, not a timesheet one.`,
      )
    )
      return;
    setMigrating(true);
    try {
      const res = await fetch("/api/admin/timesheets/migrate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: "RESET-PAID-TO-APPROVED" }),
      });
      const d = (await res.json().catch(() => ({}))) as { updated?: number; error?: string };
      if (!res.ok) throw new Error(d.error ?? "Reset failed.");
      setToast({ kind: "ok", msg: `Reset ${d.updated ?? 0} timesheet(s) to Approved` });
      router.refresh();
    } catch (e) {
      setToast({ kind: "error", msg: e instanceof Error ? e.message : "Reset failed." });
    } finally {
      setMigrating(false);
    }
  }
  const paidBanner =
    paidCount > 0 ? (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
        <span>
          <strong>{paidCount}</strong> timesheet{paidCount === 1 ? "" : "s"} marked
          &ldquo;Paid&rdquo;. A timesheet stops at Approved (paid is tracked on the payment).
        </span>
        <button
          type="button"
          onClick={resetPaid}
          disabled={migrating}
          className="ml-auto rounded-md bg-amber-600 px-2.5 py-1 font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
        >
          {migrating ? "Resetting…" : "Reset to Approved"}
        </button>
      </div>
    ) : null;

  // Scope banner: spell out that this reviewer only sees the projects they
  // manage, and name them. Shown for Project Managers (scopeProjects set).
  const scopeBanner =
    scopeProjects && scopeProjects.length > 0 ? (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5 text-xs text-brand-800">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="currentColor" aria-hidden>
          <path d="M8 1a4 4 0 0 0-4 4v2H3.5A1.5 1.5 0 0 0 2 8.5v5A1.5 1.5 0 0 0 3.5 15h9a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 12.5 7H12V5a4 4 0 0 0-4-4Zm2.5 6h-5V5a2.5 2.5 0 0 1 5 0v2Z" />
        </svg>
        <span>
          You review timesheets only for the {scopeProjects.length} project
          {scopeProjects.length === 1 ? "" : "s"} you manage:
        </span>
        <span className="font-semibold demo-blur">{scopeProjects.join(", ")}</span>
      </div>
    ) : null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) => g.memberName.toLowerCase().includes(q) || g.memberCode.toLowerCase().includes(q),
    );
  }, [groups, search]);

  // Keep a valid selection as the list changes.
  useEffect(() => {
    if (groups.length === 0) setSelectedId(null);
    else if (!groups.some((g) => g.memberId === selectedId)) setSelectedId(groups[0].memberId);
  }, [groups, selectedId]);

  const selected = useMemo(
    () => groups.find((g) => g.memberId === selectedId) ?? null,
    [groups, selectedId],
  );

  // Hours actually logged per staffing (across the whole logged lifecycle, not
  // just the review states) so a heading can show used-vs-agreed for the admin.
  const usedByStaffing = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of rows) {
      if (!["Submitted", "Approved", "Invoiced", "Paid"].includes(t.status)) continue;
      if (!t.staffingCode) continue;
      m.set(t.staffingCode, (m.get(t.staffingCode) ?? 0) + t.totalHours);
    }
    return m;
  }, [rows]);

  // Projects the selected member has timesheets on (via their staffings), with
  // the count still under review — the actionable ones lead the selector.
  const memberProjects = useMemo(() => {
    if (!selected) return [] as { code: string; name: string; pending: number }[];
    const m = new Map<string, { code: string; name: string; pending: number }>();
    const ensure = (t: AdminTimesheetRecord) => {
      const code = t.projectCode || "—";
      const e = m.get(code) ?? { code, name: t.projectName || t.projectCode || "—", pending: 0 };
      m.set(code, e);
      return e;
    };
    for (const t of selected.underReview) ensure(t).pending += 1;
    for (const t of selected.approved) ensure(t);
    for (const t of selected.rejected) ensure(t);
    return [...m.values()].sort(
      (a, b) => b.pending - a.pending || a.name.localeCompare(b.name),
    );
  }, [selected]);
  const [projectFilter, setProjectFilter] = useState<string>("all");
  useEffect(() => setProjectFilter("all"), [selectedId]);
  const byProject = (list: AdminTimesheetRecord[]) =>
    projectFilter === "all" ? list : list.filter((t) => (t.projectCode || "—") === projectFilter);
  const staffingCodeForProject = (code: string) =>
    [...(selected?.underReview ?? []), ...(selected?.approved ?? []), ...(selected?.rejected ?? [])].find(
      (t) => (t.projectCode || "—") === code,
    )?.staffingCode ?? "";

  async function decide(id: string, action: "approve" | "reject", comment: string) {
    const previous = rows.find((r) => r.id === id)?.status;
    if (!previous) return;
    const next = action === "approve" ? "Approved" : "Rejected";
    setSavingId(id);
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: next } : r)));
    try {
      const res = await fetch(`/api/admin/timesheets/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, comment: comment.trim() || undefined }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? `Update failed (HTTP ${res.status})`);
      }
      setToast({ kind: "ok", msg: action === "approve" ? "Timesheet approved" : "Timesheet rejected" });
      router.refresh();
    } catch (e) {
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: previous } : r)));
      setToast({ kind: "error", msg: e instanceof Error ? e.message : "Update failed" });
    } finally {
      setSavingId(null);
    }
  }

  if (groups.length === 0) {
    return (
      <div className="space-y-4">
        {scopeBanner}
        {legacyBanner}
        {paidBanner}
        <div className="rounded-lg border border-slate-200 bg-white p-10 text-center">
          <div className="text-sm font-medium text-slate-800">Nothing to review</div>
          <p className="mt-1 text-xs text-slate-500">
            {scopeProjects && scopeProjects.length > 0
              ? "Submitted timesheets on your projects appear here for approval, grouped by member."
              : "Submitted timesheets appear here for approval, grouped by member."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {scopeBanner}
      {legacyBanner}
      {paidBanner}
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* Member list */}
      <div className="self-start overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Search members…" className="w-full" />
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
                      <div className={`truncate text-sm font-medium demo-blur ${active ? "text-brand-800" : "text-slate-900"}`}>
                        {g.memberName || g.memberCode || "—"}
                      </div>
                      {g.memberCode ? (
                        <div className="font-mono text-[10px] text-slate-400">{g.memberCode}</div>
                      ) : null}
                    </div>
                    {g.underReview.length > 0 ? (
                      <Badge tone="warning">{g.underReview.length} to review</Badge>
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

          <ProjectSelector
            projects={memberProjects}
            value={projectFilter}
            onChange={setProjectFilter}
            sowByStaffing={sowByStaffing}
            staffingCodeByProject={staffingCodeForProject}
          />

          <SegmentedTabs
            ariaLabel="Review status"
            value={statusTab}
            onChange={setStatusTab}
            options={[
              {
                value: "underReview",
                label: "Under review",
                badge: <CountBadge n={byProject(selected.underReview).length} tone="warning" />,
              },
              {
                value: "approved",
                label: "Approved",
                badge: <CountBadge n={byProject(selected.approved).length} tone="muted" />,
              },
              {
                value: "rejected",
                label: "Rejected",
                badge: <CountBadge n={byProject(selected.rejected).length} tone="muted" />,
              },
            ]}
          />

          <ProjectGroups
            items={byProject(
              statusTab === "underReview"
                ? selected.underReview
                : statusTab === "approved"
                  ? selected.approved
                  : selected.rejected,
            )}
            empty={
              statusTab === "underReview"
                ? "Nothing under review for this member."
                : statusTab === "approved"
                  ? "No approved timesheets yet."
                  : "No rejected timesheets."
            }
            savingId={savingId}
            onDecide={decide}
            onEdit={onEdit}
            sowByStaffing={sowByStaffing}
            usedByStaffing={usedByStaffing}
          />
        </div>
      ) : null}

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
    </div>
  );
}

// Small count pill for the status tabs — amber for the actionable
// "under review", muted slate otherwise. Hidden at zero.
function CountBadge({ n, tone }: { n: number; tone: "warning" | "muted" }) {
  if (n === 0) return null;
  const cls =
    tone === "warning" ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-600";
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold ${cls}`}>
      {n}
    </span>
  );
}

// On-top project selector for the chosen member: subtabs when there are a few
// projects, a dropdown when there are many. Shows the picked project's SOW
// link inline. Hidden when the member has a single project (nothing to pick).
function ProjectSelector({
  projects,
  value,
  onChange,
}: {
  projects: { code: string; name: string; pending: number }[];
  value: string;
  onChange: (v: string) => void;
  sowByStaffing?: Record<string, SowInfo>;
  staffingCodeByProject: (code: string) => string;
}) {
  if (projects.length <= 1) return null;

  // Projects awaiting review lead as pills; the rest (fully approved/rejected)
  // are tucked into a dropdown so a member with many projects stays scannable.
  const pending = projects.filter((p) => p.pending > 0);
  const others = projects.filter((p) => p.pending === 0);
  const otherActive = others.some((p) => p.code === value);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="inline-flex flex-wrap items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
        <ProjChip active={value === "all"} onClick={() => onChange("all")}>
          All
        </ProjChip>
        {pending.map((p) => (
          <ProjChip key={p.code} active={value === p.code} onClick={() => onChange(p.code)}>
            <span className="truncate">{p.code}</span>
            <span className="ml-1 inline-flex items-center rounded-full bg-amber-100 px-1 text-[9px] font-semibold text-amber-800">
              {p.pending}
            </span>
          </ProjChip>
        ))}
      </div>
      {others.length > 0 ? (
        <select
          value={otherActive ? value : ""}
          onChange={(e) => onChange(e.target.value || "all")}
          title="Other projects (fully reviewed)"
          className={`h-7 max-w-[12rem] rounded-md border px-2 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 ${
            otherActive ? "border-brand-300 font-medium text-brand-800" : "border-slate-300 text-slate-600"
          }`}
        >
          <option value="">Reviewed… ({others.length})</option>
          {others.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

function ProjChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex max-w-[10rem] items-center rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

// The active status's timesheets, grouped by project. Each project heading
// carries its SOW link and the member's total hours on that project.
function ProjectGroups({
  items,
  empty,
  savingId,
  onDecide,
  onEdit,
  sowByStaffing,
  usedByStaffing,
}: {
  items: AdminTimesheetRecord[];
  empty: string;
  savingId: string | null;
  onDecide: (id: string, action: "approve" | "reject", comment: string) => void;
  onEdit?: (t: AdminTimesheetRecord) => void;
  sowByStaffing?: Record<string, SowInfo>;
  usedByStaffing?: Map<string, number>;
}) {
  const groups = useMemo(() => {
    const m = new Map<
      string,
      { code: string; name: string; staffingCode: string; hours: number; sheets: AdminTimesheetRecord[] }
    >();
    for (const t of items) {
      const code = t.projectCode || "—";
      const g =
        m.get(code) ??
        { code, name: t.projectName || t.projectCode || "—", staffingCode: t.staffingCode, hours: 0, sheets: [] };
      g.hours += t.totalHours;
      if (!g.staffingCode) g.staffingCode = t.staffingCode;
      g.sheets.push(t);
      m.set(code, g);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
        {empty}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const sow = sowByStaffing?.[g.staffingCode];
        const agreed = sow?.daysAllocated != null ? sow.daysAllocated * 8 : null;
        const used = usedByStaffing?.get(g.staffingCode) ?? 0;
        const over = agreed != null && used > agreed;
        const pct = agreed && agreed > 0 ? Math.min(100, (used / agreed) * 100) : used > 0 ? 100 : 0;
        return (
          <div key={g.code}>
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-800 demo-blur">{g.name}</span>
              <span className="font-mono text-[10px] text-slate-400">{g.code}</span>
              <SowChip sow={sow} />
              {/* Hours used vs agreed — prominent meter so an admin can sanity-
                  check effort against the staffing allocation at a glance. */}
              <div
                className={`ml-auto inline-flex items-center gap-2 rounded-md border px-2 py-1 ${
                  over ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"
                }`}
                title="Hours logged (all statuses) vs hours agreed on the staffing"
              >
                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full ${over ? "bg-rose-500" : "bg-emerald-500"}`}
                    style={{ width: `${Math.max(pct, used > 0 ? 4 : 0)}%` }}
                  />
                </div>
                <span className={`text-xs font-semibold tabular-nums ${over ? "text-rose-700" : "text-slate-800"}`}>
                  {used.toFixed(1)}
                  {agreed != null ? ` / ${agreed.toFixed(0)}` : ""} h
                </span>
                <span className="text-[10px] uppercase tracking-wide text-slate-400">
                  {agreed != null ? "used / agreed" : "used"}
                </span>
              </div>
            </div>
            <div className="space-y-3">
              {g.sheets.map((t) => (
                <ReviewCard key={t.id} t={t} saving={savingId === t.id} onDecide={onDecide} onEdit={onEdit} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CardChevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={`h-3 w-3 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <path d="M4.5 3 7.5 6 4.5 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ReviewCard({
  t,
  saving,
  onDecide,
  onEdit,
}: {
  t: AdminTimesheetRecord;
  saving: boolean;
  onDecide: (id: string, action: "approve" | "reject", comment: string) => void;
  onEdit?: (t: AdminTimesheetRecord) => void;
}) {
  const decided = t.status === "Approved" || t.status === "Rejected";
  // Under review AND configured for client review → the client decides by email;
  // the admin isn't the reviewer here (but can still override).
  const clientPending = t.status === "Submitted" && t.reviewMethod === "Client";
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  // Decided and client-pending cards stay clean: the admin Approve/Reject is an
  // override, revealed on demand so it isn't mistaken for the primary action.
  const [overriding, setOverriding] = useState(false);
  const dates = dayIsos(t.startDate);
  const showActions = (t.status === "Submitted" && !clientPending) || overriding;

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      {/* Header: click to expand the day breakdown; edit sits alongside. */}
      <div className="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-50">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <CardChevron open={open} />
          <span className="text-[11px] font-medium text-slate-700">
            {t.startDate && t.endDate ? formatWeekRange(t.startDate, t.endDate) : "—"}
          </span>
          {clientPending ? (
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
              Awaiting client
            </span>
          ) : t.reviewMethod === "Client" ? (
            <span className="text-[10px] text-slate-400">client</span>
          ) : null}
          <StatusBadge
            status={t.status}
            review={{
              reviewMethod: t.reviewMethod || undefined,
              reviewedBy: t.reviewedBy || undefined,
              reviewedAt: t.reviewedAt,
              reviewComment: t.reviewComment || undefined,
            }}
          />
        </button>
        <span className="text-sm font-semibold tabular-nums text-slate-900">
          {t.totalHours.toFixed(1)} h
        </span>
        {onEdit ? (
          <button
            type="button"
            onClick={() => onEdit(t)}
            title="Edit this week's hours and tasks"
            aria-label="Edit timesheet"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-brand-50 hover:text-brand-700"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3L11 2.5z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : null}
      </div>

      {open ? (
        <dl className="border-t border-slate-100 px-3 py-1.5 text-[11px]">
          {DAY_KEYS.map((k) => (
            <div key={k} className="flex gap-3 py-0.5">
              <dt className="w-24 shrink-0 text-slate-500">
                {k.slice(0, 3).replace(/^./, (c) => c.toUpperCase())}
                {dates[k] ? <span className="ml-1 text-slate-400">{dates[k]}</span> : null}
              </dt>
              <dd className="w-12 shrink-0 tabular-nums text-slate-700">
                {t[k].hours ? t[k].hours.toFixed(2) : <span className="text-slate-300">—</span>}
              </dd>
              <dd className="min-w-0 flex-1 whitespace-pre-line text-slate-600 demo-blur">
                {t[k].task || <span className="text-slate-300">—</span>}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {/* Actions: Approve/Reject for under-review; for decided rows a subtle
          Override link keeps the card clean until the admin opts in. */}
      <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2">
        {showActions ? (
          <>
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={overriding ? "Reason for override (optional)" : "Comment (optional)"}
              className="h-8 min-w-0 flex-1 rounded-md border border-slate-300 px-2.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
            />
            <Button
              tone={overriding ? "secondary" : "primary"}
              size="sm"
              disabled={saving || t.status === "Approved"}
              onClick={() => onDecide(t.id, "approve", comment)}
            >
              Approve
            </Button>
            <Button
              tone={overriding ? "secondary" : "danger"}
              size="sm"
              disabled={saving || t.status === "Rejected"}
              onClick={() => onDecide(t.id, "reject", comment)}
            >
              Reject
            </Button>
          </>
        ) : clientPending ? (
          <>
            <span className="min-w-0 flex-1 truncate text-[11px] text-amber-700">
              Awaiting the client&apos;s decision, sent by email. No admin action needed.
            </span>
            <button
              type="button"
              onClick={() => setOverriding(true)}
              className="shrink-0 text-[11px] font-medium text-slate-500 hover:text-slate-800"
            >
              Override
            </button>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500">
              {t.reviewedBy ? `${t.status} by ${t.reviewedBy}` : t.status}
              {t.reviewComment ? `: “${t.reviewComment}”` : ""}
            </span>
            <button
              type="button"
              onClick={() => setOverriding(true)}
              className="shrink-0 text-[11px] font-medium text-slate-500 hover:text-slate-800"
            >
              Override
            </button>
          </>
        )}
      </div>
    </div>
  );
}
