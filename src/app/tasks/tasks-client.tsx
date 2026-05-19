"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TaskPriority, TaskRecord, TaskStatus, TaskVisibility } from "@/lib/airtable";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/airtable";

type ProjectOpt = { id: string; code: string; name: string };
type MemberOpt = { id: string; code: string; name: string };

// Tabs map directly onto the Visibility field on Airtable: tasks created from
// the Personal tab are private (only the creator sees them, even when linked
// to a project); tasks created from the Shared tab are visible to everyone
// staffed on the linked project.
type Mode = TaskVisibility;
type View = "kanban" | "list";

type Subtask = { id: string; title: string; done: boolean };

type Filters = {
  status: "All" | TaskStatus;
  priority: "All" | TaskPriority;
  project: "All" | string;
  search: string;
};

const DEFAULT_FILTERS: Filters = {
  status: "All",
  priority: "All",
  project: "All",
  search: "",
};

const STATUS_ORDER: TaskStatus[] = ["To do", "In Progress", "Done", "Cancelled"];

// Subtasks are persisted inside the existing Airtable "Description" field as
// markdown-style checklist lines (`[ ] foo` / `[x] bar`) so the change needs
// no schema migration. Anything that doesn't look like a checklist line is
// preserved as a plain (unchecked) subtask on read, and re-serialized cleanly
// on save.
function parseSubtasks(raw: string | null | undefined): Subtask[] {
  if (!raw) return [];
  const lines = raw.split(/\r?\n/);
  const out: Subtask[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = /^\[( |x|X)\]\s*(.*)$/.exec(trimmed);
    if (m) {
      const title = m[2].trim();
      if (!title) continue;
      out.push({ id: crypto.randomUUID(), title, done: m[1].toLowerCase() === "x" });
    } else {
      out.push({ id: crypto.randomUUID(), title: trimmed, done: false });
    }
  }
  return out;
}
function serializeSubtasks(list: Subtask[]): string {
  return list
    .map((s) => `[${s.done ? "x" : " "}] ${s.title.trim()}`)
    .filter((l) => l.replace(/^\[.\]\s*/, "").length > 0)
    .join("\n");
}
function subtaskProgress(raw: string | null | undefined): { done: number; total: number } {
  const list = parseSubtasks(raw);
  return { done: list.filter((s) => s.done).length, total: list.length };
}

export function TasksClient({
  tasks,
  projects,
  members,
  currentMemberId,
  isAdmin,
}: {
  tasks: TaskRecord[];
  projects: ProjectOpt[];
  members: MemberOpt[];
  currentMemberId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(tasks);
  useEffect(() => setRows(tasks), [tasks]);
  const [mode, setMode] = useState<Mode>("Personal");
  const [view, setView] = useState<View>("list");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TaskRecord | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  // All updates are optimistic: apply the patch locally first, fire the
  // request, and roll back + surface "Backend error" if it fails. Keeps the
  // UI snappy without a global loading curtain.
  function showError(msg: string) {
    setToast({ kind: "error", msg: msg || "Backend error" });
  }

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return rows.filter((t) => {
      // Mode maps 1:1 to the Visibility field — tasks created from the
      // Personal tab never show up in Shared and vice versa.
      if (t.visibility !== mode) return false;
      if (filters.status !== "All" && t.status !== filters.status) return false;
      if (filters.priority !== "All" && t.priority !== filters.priority) return false;
      if (filters.project !== "All" && t.projectRecordId !== filters.project) return false;
      if (q) {
        const blob = [
          t.title,
          t.description,
          t.projectCode,
          t.projectName,
          t.createdByName,
          ...t.assigneeNames,
        ]
          .join(" ")
          .toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filters, mode]);

  // Counts shown on the tab pills only include active work — Done and
  // Cancelled don't pad the number you're glancing at.
  const counts = useMemo(() => {
    let personal = 0;
    let shared = 0;
    for (const t of rows) {
      if (t.status === "Done" || t.status === "Cancelled") continue;
      if (t.visibility === "Personal") personal += 1;
      else shared += 1;
    }
    return { personal, shared };
  }, [rows]);

  const grouped = useMemo(() => {
    const map = new Map<TaskStatus, TaskRecord[]>();
    for (const s of STATUS_ORDER) map.set(s, []);
    for (const t of filtered) {
      const s = (t.status || "To do") as TaskStatus;
      map.get(s)?.push(t);
    }
    const prioRank: Record<TaskPriority | "", number> = {
      Urgent: 0,
      High: 1,
      Medium: 2,
      Low: 3,
      "": 4,
    };
    for (const [, list] of map) {
      list.sort((a, b) => {
        const pr = prioRank[a.priority] - prioRank[b.priority];
        if (pr !== 0) return pr;
        const ad = a.dueDate ?? "9999-12-31";
        const bd = b.dueDate ?? "9999-12-31";
        return ad.localeCompare(bd);
      });
    }
    return map;
  }, [filtered]);

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((p) => ({ ...p, [key]: value }));
  }
  function resetFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(t: TaskRecord) {
    setEditing(t);
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  // Optimistic status change — apply locally, PATCH, revert on failure.
  async function quickStatus(t: TaskRecord, next: TaskStatus) {
    if (t.status === next) return;
    const previous = t.status;
    setRows((rs) => rs.map((r) => (r.id === t.id ? { ...r, status: next } : r)));
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(t.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Backend error");
      }
      router.refresh();
    } catch (e) {
      setRows((rs) => rs.map((r) => (r.id === t.id ? { ...r, status: previous } : r)));
      showError(e instanceof Error ? e.message : "Backend error");
    }
  }

  async function remove(t: TaskRecord) {
    if (!confirm(`Delete task "${t.title}"? This can't be undone.`)) return;
    const snapshot = rows;
    setRows((rs) => rs.filter((r) => r.id !== t.id));
    setToast({ kind: "ok", msg: "Task deleted" });
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(t.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Backend error");
      }
      router.refresh();
    } catch (e) {
      setRows(snapshot);
      showError(e instanceof Error ? e.message : "Backend error");
    }
  }

  // Optimistic subtask toggle from the card / list — no modal needed.
  async function toggleSubtaskOnCard(t: TaskRecord, subtaskId: string) {
    const list = parseSubtasks(t.description);
    const next = list.map((s) => (s.id === subtaskId ? { ...s, done: !s.done } : s));
    const serialized = serializeSubtasks(next);
    const prev = t.description;
    setRows((rs) => rs.map((r) => (r.id === t.id ? { ...r, description: serialized } : r)));
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(t.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: serialized }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Backend error");
      }
    } catch (e) {
      setRows((rs) => rs.map((r) => (r.id === t.id ? { ...r, description: prev } : r)));
      showError(e instanceof Error ? e.message : "Backend error");
    }
  }

  const personalPalette = {
    activeBg: "bg-brand-600",
    activeText: "text-white",
    idleText: "text-brand-700 hover:bg-brand-50",
    dot: "bg-brand-500",
  };
  const sharedPalette = {
    activeBg: "bg-slate-500",
    activeText: "text-white",
    idleText: "text-slate-600 hover:bg-slate-100",
    dot: "bg-slate-400",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm">
          {(
            [
              { v: "Personal", label: "Personal tasks", count: counts.personal, palette: personalPalette },
              { v: "Shared", label: "Shared (projects)", count: counts.shared, palette: sharedPalette },
            ] as const
          ).map((opt) => {
            const active = mode === opt.v;
            const p = opt.palette;
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => setMode(opt.v)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active ? `${p.activeBg} ${p.activeText} shadow-sm` : p.idleText
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${active ? "bg-white/80" : p.dot}`}
                  aria-hidden
                />
                {opt.label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                    active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {opt.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Select
            label="Status"
            value={filters.status}
            onChange={(v) => update("status", v as Filters["status"])}
            options={[
              { value: "All", label: "All statuses" },
              ...TASK_STATUSES.map((s) => ({ value: s, label: s })),
            ]}
          />
          <Select
            label="Priority"
            value={filters.priority}
            onChange={(v) => update("priority", v as Filters["priority"])}
            options={[
              { value: "All", label: "All priorities" },
              ...TASK_PRIORITIES.map((p) => ({ value: p, label: p })),
            ]}
          />
          <Select
            label="Project"
            value={filters.project}
            onChange={(v) => update("project", v as Filters["project"])}
            options={[
              { value: "All", label: "All projects" },
              ...projects.map((p) => ({
                value: p.id,
                label: p.name ? `${p.code} — ${p.name}` : p.code,
              })),
            ]}
          />
          <label className="block lg:col-span-2">
            <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
              Search
            </span>
            <input
              type="search"
              value={filters.search}
              onChange={(e) => update("search", e.target.value)}
              placeholder="Title, project, assignee…"
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
          >
            Reset filters
          </button>
          <span className="text-xs text-slate-500">
            {filtered.length} task{filtered.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={openNew}
            className="ml-auto inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 h-8 text-xs font-medium text-white shadow-sm hover:bg-brand-700"
          >
            <PlusIcon /> New task
          </button>
        </div>
      </div>

      <div className="flex items-center">
        <div className="inline-flex items-center rounded-md border border-slate-200 bg-white p-0.5 shadow-sm">
          {(
            [
              { v: "list", label: "List" },
              { v: "kanban", label: "Board" },
            ] as const
          ).map((opt) => {
            const active = view === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => setView(opt.v)}
                aria-pressed={active}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  active ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {view === "kanban" ? (
        // Wider To do / In Progress columns, narrower Done / Cancelled — they
        // are terminal states that mostly need scanning, not editing.
        <div className="grid gap-3 lg:grid-cols-[2fr_2fr_1fr_1fr]">
          {STATUS_ORDER.map((s) => (
            <Column
              key={s}
              status={s}
              compact={s === "Done" || s === "Cancelled"}
              tasks={grouped.get(s) ?? []}
              currentMemberId={currentMemberId}
              projectsById={projectsById}
              membersById={membersById}
              onOpen={openEdit}
              onStatusChange={quickStatus}
              onToggleSubtask={toggleSubtaskOnCard}
            />
          ))}
        </div>
      ) : (
        <TaskList
          tasks={filtered}
          currentMemberId={currentMemberId}
          projectsById={projectsById}
          membersById={membersById}
          onOpen={openEdit}
          onStatusChange={quickStatus}
          onToggleSubtask={toggleSubtaskOnCard}
        />
      )}

      <TaskModal
        open={modalOpen}
        editing={editing}
        defaultVisibility={mode}
        projects={projects}
        members={members}
        currentMemberId={currentMemberId}
        isAdmin={isAdmin}
        onClose={closeModal}
        onSaved={(saved, m) => {
          if (m === "create") {
            setRows((rs) => [saved, ...rs]);
            setToast({ kind: "ok", msg: "Task created" });
          } else {
            setRows((rs) => rs.map((r) => (r.id === saved.id ? saved : r)));
            setToast({ kind: "ok", msg: "Task updated" });
          }
          closeModal();
          router.refresh();
        }}
        onError={showError}
        onDelete={remove}
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

function Column({
  status,
  compact,
  tasks,
  currentMemberId,
  projectsById,
  membersById,
  onOpen,
  onStatusChange,
  onToggleSubtask,
}: {
  status: TaskStatus;
  compact: boolean;
  tasks: TaskRecord[];
  currentMemberId: string;
  projectsById: Map<string, ProjectOpt>;
  membersById: Map<string, MemberOpt>;
  onOpen: (t: TaskRecord) => void;
  onStatusChange: (t: TaskRecord, next: TaskStatus) => void;
  onToggleSubtask: (t: TaskRecord, subtaskId: string) => void;
}) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white ${compact ? "opacity-95" : ""}`}>
      <header className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${statusDot(status)}`} aria-hidden />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            {status}
          </h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium tabular-nums text-slate-600">
            {tasks.length}
          </span>
        </div>
      </header>
      <ul className="divide-y divide-slate-100">
        {tasks.length === 0 ? (
          <li className="text-center text-[11px] text-slate-400 py-6">No tasks here.</li>
        ) : (
          tasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              compact={compact}
              currentMemberId={currentMemberId}
              projectsById={projectsById}
              membersById={membersById}
              onOpen={onOpen}
              onStatusChange={onStatusChange}
              onToggleSubtask={onToggleSubtask}
            />
          ))
        )}
      </ul>
    </section>
  );
}

function TaskCard({
  task: t,
  compact,
  currentMemberId,
  projectsById,
  membersById,
  onOpen,
  onStatusChange,
  onToggleSubtask,
}: {
  task: TaskRecord;
  compact: boolean;
  currentMemberId: string;
  projectsById: Map<string, ProjectOpt>;
  membersById: Map<string, MemberOpt>;
  onOpen: (t: TaskRecord) => void;
  onStatusChange: (t: TaskRecord, next: TaskStatus) => void;
  onToggleSubtask: (t: TaskRecord, subtaskId: string) => void;
}) {
  const personal = t.visibility === "Personal";
  const project = t.projectRecordId ? projectsById.get(t.projectRecordId) : null;
  const isMine = t.createdByRecordId === currentMemberId;
  const isAssigned = t.assigneeRecordIds.includes(currentMemberId);
  const dueClass = dueDateClass(t.dueDate, t.status);
  const progress = subtaskProgress(t.description);
  const subtasks = parseSubtasks(t.description);
  return (
    <li className="px-3 py-2 hover:bg-slate-50">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => onOpen(t)}
          className="flex-1 min-w-0 text-left"
        >
          <div className="text-sm font-medium text-slate-900 truncate">{t.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
            {t.priority ? (
              <span
                className={`inline-flex items-center rounded-full border px-1.5 py-0.5 font-medium ${priorityCls(t.priority)}`}
              >
                {t.priority}
              </span>
            ) : null}
            {personal ? (
              <span className="inline-flex items-center rounded-full bg-brand-50 text-brand-700 px-1.5 py-0.5 font-medium">
                Personal
              </span>
            ) : null}
            {project ? (
              <span
                className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 px-1.5 py-0.5 font-medium font-mono"
                title={project?.name ?? t.projectName}
              >
                {project?.code || t.projectCode}
              </span>
            ) : null}
            {t.dueDate ? (
              <span className={`tabular-nums ${dueClass}`}>Due {t.dueDate}</span>
            ) : null}
            {t.effortHours != null ? (
              <span className="text-slate-500">{t.effortHours}h</span>
            ) : null}
            {progress.total > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                <CheckListIcon />
                {progress.done}/{progress.total}
              </span>
            ) : null}
          </div>
          {!compact && !personal ? (
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
              {isMine ? (
                <span title="You created this">Created by you</span>
              ) : (
                <span>By {t.createdByName || "—"}</span>
              )}
              {t.assigneeRecordIds.length > 0 ? (
                <>
                  <span>·</span>
                  <span>
                    {t.assigneeRecordIds.length === 1
                      ? membersById.get(t.assigneeRecordIds[0])?.name ?? t.assigneeNames[0]
                      : `${t.assigneeRecordIds.length} assignees`}
                    {isAssigned ? " (incl. you)" : ""}
                  </span>
                </>
              ) : null}
            </div>
          ) : null}
        </button>
        <select
          value={t.status}
          onChange={(e) => onStatusChange(t, e.target.value as TaskStatus)}
          className={`rounded-md border px-1.5 py-0.5 text-[10px] ${statusSelectCls(t.status)}`}
          aria-label="Change status"
          onClick={(e) => e.stopPropagation()}
        >
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      {subtasks.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5 pl-0.5">
          {subtasks.slice(0, compact ? 2 : 4).map((s) => (
            <li key={s.id} className="flex items-center gap-1.5 text-[11px]">
              <input
                type="checkbox"
                checked={s.done}
                onChange={() => onToggleSubtask(t, s.id)}
                onClick={(e) => e.stopPropagation()}
                className="rounded border-slate-300"
              />
              <span className={s.done ? "text-slate-400 line-through" : "text-slate-600"}>
                {s.title}
              </span>
            </li>
          ))}
          {subtasks.length > (compact ? 2 : 4) ? (
            <li className="text-[10px] text-slate-400">
              +{subtasks.length - (compact ? 2 : 4)} more…
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

function TaskList({
  tasks,
  currentMemberId,
  projectsById,
  membersById,
  onOpen,
  onStatusChange,
  onToggleSubtask,
}: {
  tasks: TaskRecord[];
  currentMemberId: string;
  projectsById: Map<string, ProjectOpt>;
  membersById: Map<string, MemberOpt>;
  onOpen: (t: TaskRecord) => void;
  onStatusChange: (t: TaskRecord, next: TaskStatus) => void;
  onToggleSubtask: (t: TaskRecord, subtaskId: string) => void;
}) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white py-12 text-center text-xs text-slate-400">
        No tasks match the current filters.
      </div>
    );
  }
  const prioRank: Record<TaskPriority | "", number> = {
    Urgent: 0,
    High: 1,
    Medium: 2,
    Low: 3,
    "": 4,
  };
  const sorted = [...tasks].sort((a, b) => {
    const sa = STATUS_ORDER.indexOf(a.status as TaskStatus);
    const sb = STATUS_ORDER.indexOf(b.status as TaskStatus);
    if (sa !== sb) return sa - sb;
    const pr = prioRank[a.priority] - prioRank[b.priority];
    if (pr !== 0) return pr;
    const ad = a.dueDate ?? "9999-12-31";
    const bd = b.dueDate ?? "9999-12-31";
    return ad.localeCompare(bd);
  });
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full text-xs">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Task</th>
            <th className="px-3 py-2 text-left font-medium">Project</th>
            <th className="px-3 py-2 text-left font-medium">Status</th>
            <th className="px-3 py-2 text-left font-medium">Priority</th>
            <th className="px-3 py-2 text-left font-medium">Due</th>
            <th className="px-3 py-2 text-left font-medium">Assignees</th>
            <th className="px-3 py-2 text-left font-medium">Subtasks</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((t) => {
            const personal = t.visibility === "Personal";
            const project = t.projectRecordId ? projectsById.get(t.projectRecordId) : null;
            const subtasks = parseSubtasks(t.description);
            const progress = { done: subtasks.filter((s) => s.done).length, total: subtasks.length };
            const isAssigned = t.assigneeRecordIds.includes(currentMemberId);
            return (
              <tr key={t.id} className="align-top hover:bg-slate-50">
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onOpen(t)}
                    className="text-left font-medium text-slate-900 hover:text-brand-700"
                  >
                    {t.title}
                  </button>
                  {personal ? (
                    <div className="mt-0.5">
                      <span className="inline-flex items-center rounded-full bg-brand-50 text-brand-700 px-1.5 py-0.5 text-[10px] font-medium">
                        Personal
                      </span>
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  {project ? (
                    <span
                      className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 px-1.5 py-0.5 text-[10px] font-medium font-mono"
                      title={project?.name ?? t.projectName}
                    >
                      {project?.code || t.projectCode}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <select
                    value={t.status}
                    onChange={(e) => onStatusChange(t, e.target.value as TaskStatus)}
                    className={`rounded-md border px-1.5 py-0.5 text-[10px] ${statusSelectCls(t.status)}`}
                    aria-label="Change status"
                  >
                    {TASK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  {t.priority ? (
                    <span
                      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${priorityCls(t.priority)}`}
                    >
                      {t.priority}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className={`px-3 py-2 tabular-nums ${dueDateClass(t.dueDate, t.status)}`}>
                  {t.dueDate || <span className="text-slate-400">—</span>}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {personal ? (
                    <span className="text-slate-400">—</span>
                  ) : t.assigneeRecordIds.length === 0 ? (
                    <span className="text-slate-400">—</span>
                  ) : t.assigneeRecordIds.length === 1 ? (
                    <span>
                      {membersById.get(t.assigneeRecordIds[0])?.name ?? t.assigneeNames[0]}
                      {isAssigned ? " (you)" : ""}
                    </span>
                  ) : (
                    <span>
                      {t.assigneeRecordIds.length} people{isAssigned ? " (incl. you)" : ""}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {progress.total === 0 ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <details>
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium hover:bg-slate-200">
                        <CheckListIcon />
                        {progress.done}/{progress.total}
                      </summary>
                      <ul className="mt-1.5 space-y-0.5">
                        {subtasks.map((s) => (
                          <li key={s.id} className="flex items-center gap-1.5 text-[11px]">
                            <input
                              type="checkbox"
                              checked={s.done}
                              onChange={() => onToggleSubtask(t, s.id)}
                              className="rounded border-slate-300"
                            />
                            <span className={s.done ? "text-slate-400 line-through" : "text-slate-700"}>
                              {s.title}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TaskModal({
  open,
  editing,
  defaultVisibility,
  projects,
  members,
  currentMemberId,
  isAdmin,
  onClose,
  onSaved,
  onError,
  onDelete,
}: {
  open: boolean;
  editing: TaskRecord | null;
  defaultVisibility: TaskVisibility;
  projects: ProjectOpt[];
  members: MemberOpt[];
  currentMemberId: string;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: (t: TaskRecord, mode: "create" | "edit") => void;
  onError: (msg: string) => void;
  onDelete: (t: TaskRecord) => void;
}) {
  const [title, setTitle] = useState("");
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSubtask, setNewSubtask] = useState("");
  const [status, setStatus] = useState<TaskStatus>("To do");
  const [priority, setPriority] = useState<TaskPriority | "">("Medium");
  const [dueDate, setDueDate] = useState("");
  const [effort, setEffort] = useState("");
  const [projectId, setProjectId] = useState("");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<TaskVisibility>("Personal");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setSubtasks(parseSubtasks(editing.description));
      setStatus((editing.status as TaskStatus) || "To do");
      setPriority(editing.priority || "");
      setDueDate(editing.dueDate ?? "");
      setEffort(editing.effortHours != null ? String(editing.effortHours) : "");
      setProjectId(editing.projectRecordId);
      setAssignees(editing.assigneeRecordIds);
      setVisibility(editing.visibility);
    } else {
      setTitle("");
      setSubtasks([]);
      setStatus("To do");
      setPriority("Medium");
      setDueDate("");
      setEffort("");
      setProjectId("");
      // Personal tasks default to no assignees (the section is hidden anyway);
      // shared tasks default to the creator as a single assignee.
      setAssignees(defaultVisibility === "Shared" ? [currentMemberId] : []);
      setVisibility(defaultVisibility);
    }
    setNewSubtask("");
  }, [open, editing, currentMemberId, defaultVisibility]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, submitting, onClose]);

  if (!open) return null;

  const isOwner = !editing || editing.createdByRecordId === currentMemberId;
  const isPersonal = visibility === "Personal";

  function addSubtask() {
    const t = newSubtask.trim();
    if (!t) return;
    setSubtasks((p) => [...p, { id: crypto.randomUUID(), title: t, done: false }]);
    setNewSubtask("");
  }
  function updateSubtask(id: string, patch: Partial<Subtask>) {
    setSubtasks((p) => p.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function removeSubtask(id: string) {
    setSubtasks((p) => p.filter((s) => s.id !== id));
  }

  async function submit() {
    if (!title.trim()) return onError("Title is required.");
    if (visibility === "Shared" && !projectId) {
      return onError("Shared tasks must be linked to a project.");
    }
    setSubmitting(true);
    try {
      const cleanedSubtasks = subtasks.filter((s) => s.title.trim().length > 0);
      const body = {
        title: title.trim(),
        description: serializeSubtasks(cleanedSubtasks),
        status,
        priority,
        dueDate: dueDate || null,
        effortHours: effort === "" ? null : Number(effort),
        projectRecordId: projectId,
        // Personal tasks ignore the assignees array; force it to empty.
        assigneeRecordIds: isPersonal ? [] : assignees,
        visibility,
      };
      const url = editing ? `/api/tasks/${encodeURIComponent(editing.id)}` : "/api/tasks";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        task?: TaskRecord;
        id?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Backend error");
      const saved = data.task ?? null;
      if (saved) {
        onSaved(saved, editing ? "edit" : "create");
      } else if (!editing && data.id) {
        onSaved(
          {
            id: data.id,
            title: body.title,
            description: body.description,
            status: body.status,
            priority: body.priority as TaskPriority | "",
            dueDate: body.dueDate,
            effortHours: body.effortHours,
            projectRecordId: body.projectRecordId,
            projectCode: projects.find((p) => p.id === body.projectRecordId)?.code ?? "",
            projectName: projects.find((p) => p.id === body.projectRecordId)?.name ?? "",
            assigneeRecordIds: body.assigneeRecordIds,
            assigneeCodes: body.assigneeRecordIds.map(
              (id) => members.find((m) => m.id === id)?.code ?? "",
            ),
            assigneeNames: body.assigneeRecordIds.map(
              (id) => members.find((m) => m.id === id)?.name ?? "",
            ),
            createdByRecordId: currentMemberId,
            createdByCode: "",
            createdByName: "",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            visibility: body.visibility,
          },
          "create",
        );
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : "Backend error");
    } finally {
      setSubmitting(false);
    }
  }

  function toggleAssignee(id: string) {
    setAssignees((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 px-3 py-6 sm:items-center sm:py-10"
      role="dialog"
      aria-modal="true"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="relative w-full max-w-2xl rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">
              {editing ? "Edit task" : "New task"}
            </h2>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                isPersonal
                  ? "bg-brand-50 text-brand-700"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${isPersonal ? "bg-brand-500" : "bg-slate-400"}`}
                aria-hidden
              />
              {isPersonal ? "Personal" : "Shared"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          {isOwner ? (
            <div>
              <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
                Visibility
              </span>
              <div className="mt-1 inline-flex items-center rounded-md border border-slate-200 bg-white p-0.5">
                {(["Personal", "Shared"] as const).map((opt) => {
                  const active = visibility === opt;
                  const cls = opt === "Personal" ? "bg-brand-600" : "bg-slate-500";
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setVisibility(opt)}
                      aria-pressed={active}
                      className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                        active ? `${cls} text-white shadow-sm` : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              <span className="ml-2 text-[10px] text-slate-500">
                {isPersonal
                  ? "Only you can see this task, even if linked to a project."
                  : "Visible to everyone staffed on the linked project."}
              </span>
            </div>
          ) : null}

          <label className="block">
            <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
              Title <span className="text-red-500">*</span>
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs disabled:bg-slate-50"
              disabled={!isOwner}
              maxLength={300}
              autoFocus
            />
            {!isOwner ? (
              <span className="mt-1 block text-[10px] text-slate-500">
                Only the creator can change the title or subtasks.
              </span>
            ) : null}
          </label>

          <div>
            <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
              Subtasks{" "}
              <span className="ml-1 text-slate-400 normal-case">
                {subtasks.length > 0
                  ? `(${subtasks.filter((s) => s.done).length}/${subtasks.length} done)`
                  : ""}
              </span>
            </span>
            <ul className="mt-1 space-y-1 rounded-md border border-slate-200 bg-slate-50 p-2">
              {subtasks.length === 0 ? (
                <li className="px-1 py-1 text-[11px] text-slate-400">
                  No subtasks yet. Add one below.
                </li>
              ) : (
                subtasks.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 rounded bg-white px-2 py-1">
                    <input
                      type="checkbox"
                      checked={s.done}
                      onChange={() => updateSubtask(s.id, { done: !s.done })}
                      disabled={!isOwner && !assignees.includes(currentMemberId)}
                      className="rounded border-slate-300"
                      aria-label={`Mark "${s.title}" ${s.done ? "incomplete" : "done"}`}
                    />
                    <input
                      type="text"
                      value={s.title}
                      onChange={(e) => updateSubtask(s.id, { title: e.target.value })}
                      disabled={!isOwner}
                      className={`flex-1 border-0 bg-transparent px-0 py-0 text-xs focus:outline-none focus:ring-0 ${
                        s.done ? "text-slate-400 line-through" : "text-slate-800"
                      }`}
                    />
                    {isOwner ? (
                      <button
                        type="button"
                        onClick={() => removeSubtask(s.id)}
                        aria-label="Remove subtask"
                        className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </button>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
            {isOwner ? (
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  type="text"
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSubtask();
                    }
                  }}
                  placeholder="Add a subtask and hit Enter…"
                  className="flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
                />
                <button
                  type="button"
                  onClick={addSubtask}
                  disabled={!newSubtask.trim()}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
                Status
              </span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
                Priority
              </span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority | "")}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              >
                <option value="">—</option>
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
                Due date
              </span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
                Effort (h)
              </span>
              <input
                type="number"
                step="0.5"
                min="0"
                value={effort}
                onChange={(e) => setEffort(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
                placeholder="0"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
              Project {visibility === "Shared" ? <span className="text-red-500">*</span> : null}
            </span>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs disabled:bg-slate-50"
              disabled={!isOwner}
            >
              <option value="">{isPersonal ? "No project" : "Pick a project…"}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code}
                  {p.name ? ` — ${p.name}` : ""}
                </option>
              ))}
            </select>
          </label>

          {isPersonal ? null : (
            <div>
              <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
                Assignees
                <span className="ml-1 text-slate-400 normal-case">
                  {isAdmin ? "(admin: anyone in the network)" : "(your teammates)"}
                </span>
              </span>
              <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
                {members.length === 0 ? (
                  <div className="text-slate-400">
                    No teammates yet — you're not on any shared projects.
                  </div>
                ) : (
                  members.map((m) => {
                    const checked = assignees.includes(m.id);
                    return (
                      <label
                        key={m.id}
                        className={`flex items-center gap-2 rounded px-1.5 py-1 hover:bg-white ${
                          !isOwner ? "opacity-60" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAssignee(m.id)}
                          disabled={!isOwner}
                          className="rounded border-slate-300"
                        />
                        <span className="font-mono text-[10px] text-slate-500">{m.code}</span>
                        <span className="truncate">{m.name}</span>
                        {m.id === currentMemberId ? (
                          <span className="ml-auto text-[10px] text-slate-400">(you)</span>
                        ) : null}
                      </label>
                    );
                  })
                )}
              </div>
              {!isOwner ? (
                <span className="mt-1 block text-[10px] text-slate-500">
                  Only the creator can change the assignees.
                </span>
              ) : null}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          {editing && isOwner ? (
            <button
              type="button"
              onClick={() => onDelete(editing)}
              disabled={submitting}
              className="mr-auto rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Delete
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !title.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Saving…
              </>
            ) : editing ? (
              "Save changes"
            ) : (
              "Create task"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function statusDot(s: TaskStatus): string {
  if (s === "To do") return "bg-slate-400";
  if (s === "In Progress") return "bg-amber-500";
  if (s === "Done") return "bg-emerald-500";
  return "bg-red-400";
}

function statusSelectCls(s: TaskStatus | "" | string): string {
  if (s === "Done") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (s === "In Progress") return "border-amber-200 bg-amber-50 text-amber-700";
  if (s === "Cancelled") return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-white text-slate-600";
}

function priorityCls(p: TaskPriority | "" | string): string {
  if (p === "Urgent") return "border-red-200 bg-red-50 text-red-700";
  if (p === "High") return "border-orange-200 bg-orange-50 text-orange-700";
  if (p === "Medium") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-white text-slate-600";
}

function dueDateClass(due: string | null, status: TaskStatus | "" | string): string {
  if (!due || status === "Done" || status === "Cancelled") return "text-slate-500";
  const today = new Date().toISOString().slice(0, 10);
  if (due < today) return "text-red-600 font-medium";
  if (due === today) return "text-amber-700 font-medium";
  return "text-slate-500";
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M8 3v10M3 8h10" strokeLinecap="round" />
    </svg>
  );
}

function CheckListIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 4l1.5 1.5L7 3M3 9l1.5 1.5L7 8M3 13.5L4.5 15 7 12.5M10 4h3M10 9h3M10 13h3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
