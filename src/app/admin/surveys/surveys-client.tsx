"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, ConfirmDialog } from "@/components/modal";
import { Button, FormSelect } from "@/components/form-controls";
import { SearchInput } from "@/components/search-input";
import { TrashIcon } from "@/components/admin-icons";
import { Badge } from "@/components/badge";
import { StarRating } from "@/components/star-rating";
import type { SurveyRecord } from "@/lib/airtable";

type ProjectOpt = { code: string; name: string };
type Recipient = { name: string; email: string };

export function SurveysClient({
  surveys,
  projects,
}: {
  surveys: SurveyRecord[];
  projects: ProjectOpt[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [projectCode, setProjectCode] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([{ name: "", email: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<SurveyRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Consolidate by project code.
  const groups = useMemo(() => {
    const m = new Map<string, SurveyRecord[]>();
    for (const s of surveys) {
      const arr = m.get(s.projectCode) ?? [];
      arr.push(s);
      m.set(s.projectCode, arr);
    }
    return [...m.entries()]
      .map(([code, rows]) => {
        const done = rows.filter((r) => r.completedAt);
        const overallAvg = avg(done.map((r) => r.overallGrade));
        // Per-member averages across responses.
        const memberAgg = new Map<
          string,
          { name: string; grades: number[]; comments: { wentWell: string; improve: string }[] }
        >();
        for (const r of done) {
          for (const mr of r.memberRatings) {
            const e = memberAgg.get(mr.code) ?? { name: mr.name, grades: [], comments: [] };
            if (mr.grade != null) e.grades.push(mr.grade);
            if (mr.wentWell || mr.improve)
              e.comments.push({ wentWell: mr.wentWell, improve: mr.improve });
            memberAgg.set(mr.code, e);
          }
        }
        const members = [...memberAgg.entries()].map(([code, e]) => ({
          code,
          name: e.name,
          avg: avg(e.grades),
          count: e.grades.length,
        }));
        return {
          code,
          name: rows[0]?.projectName || code,
          rows: rows.slice().sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? "")),
          sent: rows.length,
          completed: done.length,
          overallAvg,
          members: members.sort((a, b) => a.name.localeCompare(b.name)),
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [surveys]);

  // Search across project code/name and the members rated within each group.
  const visibleGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.code.toLowerCase().includes(q) ||
        g.name.toLowerCase().includes(q) ||
        g.members.some((m) => m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q)),
    );
  }, [groups, search]);

  function toggle(code: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });
  }

  function setRecipient(i: number, patch: Partial<Recipient>) {
    setRecipients((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  async function create() {
    setError(null);
    if (!projectCode) return setError("Pick a project.");
    const clean = recipients
      .map((r) => ({ name: r.name.trim(), email: r.email.trim() }))
      .filter((r) => r.email);
    if (clean.length === 0) return setError("Add at least one recipient email.");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/surveys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectCode, recipients: clean }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        created?: number;
        failures?: string[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not create the survey.");
      setCreating(false);
      setProjectCode("");
      setRecipients([{ name: "", email: "" }]);
      if (data.failures && data.failures.length > 0) {
        setToast({ kind: "error", msg: `Created, but some emails failed: ${data.failures.length}` });
      } else {
        setToast({ kind: "ok", msg: `Sent ${data.created} survey${data.created === 1 ? "" : "s"}` });
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the survey.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/surveys/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setDeleteTarget(null);
      router.refresh();
    } catch {
      setToast({ kind: "error", msg: "Delete failed." });
    } finally {
      setDeleting(false);
    }
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/survey/${token}`;
    navigator.clipboard?.writeText(url).then(
      () => setToast({ kind: "ok", msg: "Link copied" }),
      () => setToast({ kind: "error", msg: "Couldn't copy" }),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by project or member…"
          className="flex-1"
        />
        <Button tone="primary" size="sm" onClick={() => setCreating(true)}>
          + New survey
        </Button>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No surveys yet. Click <span className="font-medium">+ New survey</span> to send one.
        </div>
      ) : visibleGroups.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No surveys match your search.
        </div>
      ) : (
        <div className="space-y-3">
          {visibleGroups.map((g) => {
            const open = expanded.has(g.code);
            return (
              <div key={g.code} className="rounded-lg border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => toggle(g.code)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <svg
                    viewBox="0 0 16 16"
                    className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden
                  >
                    <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-900 demo-blur">
                      <span className="font-mono text-xs text-slate-500">{g.code}</span> {g.name}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {g.completed} of {g.sent} responded
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">Overall</div>
                    {g.overallAvg == null ? (
                      <span className="text-xs text-slate-300">No responses</span>
                    ) : (
                      <StarRating value={g.overallAvg} readOnly size={16} />
                    )}
                  </div>
                </button>

                {/* Consolidated per-member averages (always visible). */}
                {g.members.length > 0 ? (
                  <div className="border-t border-slate-100 px-4 py-2">
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {g.members.map((m) => (
                        <div key={m.code} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate text-slate-700 demo-blur">{m.name}</span>
                          {m.avg == null ? (
                            <span className="text-slate-300">—</span>
                          ) : (
                            <StarRating value={m.avg} readOnly size={14} />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Individual responses. */}
                {open ? (
                  <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
                    {g.rows.map((r) => (
                      <div key={r.id} className="rounded-md border border-slate-200 bg-white p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-slate-900 demo-blur">
                              {r.recipientName || r.recipientEmail || "Recipient"}
                            </div>
                            <div className="truncate text-[11px] text-slate-500 demo-blur">
                              {r.recipientEmail}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <div className="text-right">
                              {r.completedAt ? (
                                <StarRating value={r.overallGrade} readOnly size={14} />
                              ) : (
                                <Badge tone="warning">Awaiting response</Badge>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(r)}
                              className="text-slate-400 hover:text-red-600"
                              aria-label="Delete survey"
                              title="Delete survey"
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </div>

                        {r.completedAt ? (
                          <div className="mt-2 space-y-2 text-xs">
                            <Comment label="Overall: went well" text={r.overallWentWell} />
                            <Comment label="Overall: improve" text={r.overallImprove} />
                            {r.memberRatings.length > 0 ? (
                              <div className="mt-1 space-y-1.5 border-t border-slate-100 pt-2">
                                {r.memberRatings.map((mr) => (
                                  <div key={mr.code}>
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-medium text-slate-700 demo-blur">
                                        {mr.name}
                                      </span>
                                      <StarRating value={mr.grade} readOnly size={13} />
                                    </div>
                                    <Comment label="Went well" text={mr.wentWell} small />
                                    <Comment label="Improve" text={mr.improve} small />
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="mt-2 flex items-center gap-3 text-[11px]">
                            <button
                              type="button"
                              onClick={() => copyLink(r.token)}
                              className="font-medium text-brand-600 hover:text-brand-700"
                            >
                              Copy link
                            </button>
                            {r.emailError ? (
                              <span className="text-amber-700" title={r.emailError}>
                                Email failed
                              </span>
                            ) : r.emailSent ? (
                              <span className="text-slate-400">Email sent</span>
                            ) : null}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {/* New survey modal */}
      <Modal
        open={creating}
        onClose={() => (saving ? undefined : setCreating(false))}
        busy={saving}
        title="New client survey"
        size="lg"
        footer={
          <>
            <Button tone="secondary" size="sm" onClick={() => setCreating(false)} disabled={saving}>
              Cancel
            </Button>
            <Button tone="primary" size="sm" onClick={create} disabled={saving}>
              {saving ? "Sending…" : "Send survey"}
            </Button>
          </>
        }
      >
        <FormSelect label="Project" value={projectCode} onChange={setProjectCode} required>
          <option value="">Select a project…</option>
          {projects.map((p) => (
            <option key={p.code} value={p.code}>
              {p.code}: {p.name}
            </option>
          ))}
        </FormSelect>
        <div className="mt-4">
          <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
            Recipients
          </span>
          <div className="mt-1 space-y-2">
            {recipients.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={r.name}
                  onChange={(e) => setRecipient(i, { name: e.target.value })}
                  placeholder="Name (optional)"
                  className="w-40 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                />
                <input
                  value={r.email}
                  onChange={(e) => setRecipient(i, { email: e.target.value })}
                  placeholder="email@client.com"
                  type="email"
                  className="flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                />
                {recipients.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setRecipients((rs) => rs.filter((_, j) => j !== i))}
                    className="text-slate-400 hover:text-red-600"
                    aria-label="Remove recipient"
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setRecipients((rs) => [...rs, { name: "", email: "" }])}
            className="mt-2 text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            + Add recipient
          </button>
        </div>
        <p className="mt-3 text-[11px] text-slate-400">
          Each recipient gets their own one-time link by email. The survey covers the overall
          engagement and every team member currently staffed on the project.
        </p>
        {error ? (
          <div className="mt-3 rounded-md bg-red-50 p-2.5 text-xs text-red-700">{error}</div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this survey?"
        message="This removes the recipient's survey and any response. This cannot be undone."
        confirmLabel="Delete"
        confirmTone="danger"
        busy={deleting}
        onCancel={() => (deleting ? undefined : setDeleteTarget(null))}
        onConfirm={confirmDelete}
      />

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

function Comment({ label, text, small }: { label: string; text: string; small?: boolean }) {
  if (!text) return null;
  return (
    <div className={small ? "text-[11px]" : "text-xs"}>
      <span className="text-slate-400">{label}: </span>
      <span className="whitespace-pre-line text-slate-700 demo-blur">{text}</span>
    </div>
  );
}

function avg(nums: (number | null)[]): number | null {
  const vals = nums.filter((n): n is number => n != null);
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((s, n) => s + n, 0) / vals.length) * 10) / 10;
}
