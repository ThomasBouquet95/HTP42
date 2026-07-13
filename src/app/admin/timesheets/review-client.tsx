"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminTimesheetRecord } from "@/lib/airtable";
import { Badge } from "@/components/badge";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/form-controls";
import { SearchInput } from "@/components/search-input";
import { SegmentedTabs } from "@/components/filters";
import { WeekChip } from "@/components/week-chip";
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
}: {
  timesheets: AdminTimesheetRecord[];
  sowByStaffing?: Record<string, SowInfo>;
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
      <div className="rounded-lg border border-slate-200 bg-white p-10 text-center">
        <div className="text-sm font-medium text-slate-800">Nothing to review</div>
        <p className="mt-1 text-xs text-slate-500">
          Submitted timesheets appear here for approval, grouped by member.
        </p>
      </div>
    );
  }

  return (
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

          <SegmentedTabs
            ariaLabel="Review status"
            value={statusTab}
            onChange={setStatusTab}
            options={[
              {
                value: "underReview",
                label: "Under review",
                badge: <CountBadge n={selected.underReview.length} tone="warning" />,
              },
              {
                value: "approved",
                label: "Approved",
                badge: <CountBadge n={selected.approved.length} tone="muted" />,
              },
              {
                value: "rejected",
                label: "Rejected",
                badge: <CountBadge n={selected.rejected.length} tone="muted" />,
              },
            ]}
          />

          <ProjectGroups
            items={
              statusTab === "underReview"
                ? selected.underReview
                : statusTab === "approved"
                  ? selected.approved
                  : selected.rejected
            }
            empty={
              statusTab === "underReview"
                ? "Nothing under review for this member."
                : statusTab === "approved"
                  ? "No approved timesheets yet."
                  : "No rejected timesheets."
            }
            savingId={savingId}
            onDecide={decide}
            sowByStaffing={sowByStaffing}
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

// The active status's timesheets, grouped by project. Each project heading
// carries its SOW link and the member's total hours on that project.
function ProjectGroups({
  items,
  empty,
  savingId,
  onDecide,
  sowByStaffing,
}: {
  items: AdminTimesheetRecord[];
  empty: string;
  savingId: string | null;
  onDecide: (id: string, action: "approve" | "reject", comment: string) => void;
  sowByStaffing?: Record<string, SowInfo>;
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
      {groups.map((g) => (
        <div key={g.code}>
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-800 demo-blur">{g.name}</span>
            <span className="font-mono text-[10px] text-slate-400">{g.code}</span>
            <SowChip sow={sowByStaffing?.[g.staffingCode]} />
            <span className="ml-auto text-xs font-semibold tabular-nums text-slate-700">
              {g.hours.toFixed(1)} h
            </span>
          </div>
          <div className="space-y-3">
            {g.sheets.map((t) => (
              <ReviewCard key={t.id} t={t} saving={savingId === t.id} onDecide={onDecide} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReviewCard({
  t,
  saving,
  onDecide,
}: {
  t: AdminTimesheetRecord;
  saving: boolean;
  onDecide: (id: string, action: "approve" | "reject", comment: string) => void;
}) {
  const [open, setOpen] = useState(t.status === "Submitted");
  const [comment, setComment] = useState("");
  const dates = dayIsos(t.startDate);
  const decided = t.status === "Approved" || t.status === "Rejected";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <WeekChip startIso={t.startDate} endIso={t.endDate} />
          <span className="text-[11px] text-slate-500">
            {t.staffingCode}
            {t.reviewMethod === "Client" ? " · client review" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge
            status={t.status}
            review={{
              reviewMethod: t.reviewMethod || undefined,
              reviewedBy: t.reviewedBy || undefined,
              reviewedAt: t.reviewedAt,
              reviewComment: t.reviewComment || undefined,
            }}
          />
          <span className="text-sm font-semibold tabular-nums text-slate-900">{t.totalHours.toFixed(2)} h</span>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-[11px] font-medium text-brand-600 hover:text-brand-700"
          >
            {open ? "Hide" : "Details"}
          </button>
        </div>
      </div>

      {open ? (
        <dl className="mt-2 divide-y divide-slate-100 border-t border-slate-100 text-[11px]">
          {DAY_KEYS.map((k) => (
            <div key={k} className="flex gap-3 py-1">
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

      {decided && t.reviewComment ? (
        <p className="mt-2 whitespace-pre-line rounded-md bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
          &ldquo;{t.reviewComment}&rdquo;
          {t.reviewedBy ? <span className="ml-1 text-slate-400">— {t.reviewedBy}</span> : null}
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-2">
        <label className="block min-w-[14rem] flex-1">
          <span className="text-[10px] uppercase tracking-wide font-medium text-slate-400">
            {decided ? "Override decision (comment optional)" : "Comment (optional)"}
          </span>
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={decided ? "Reason for overriding" : "Add a note for this decision"}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
          />
        </label>
        <div className="flex gap-2">
          <Button
            tone={decided ? "secondary" : "primary"}
            size="sm"
            disabled={saving || t.status === "Approved"}
            onClick={() => onDecide(t.id, "approve", comment)}
          >
            Approve
          </Button>
          <Button
            tone={decided ? "secondary" : "danger"}
            size="sm"
            disabled={saving || t.status === "Rejected"}
            onClick={() => onDecide(t.id, "reject", comment)}
          >
            Reject
          </Button>
        </div>
      </div>
    </div>
  );
}
