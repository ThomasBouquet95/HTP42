"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TaskPriority, TaskRecord, TaskStatus } from "@/lib/airtable";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/airtable";

type ProjectOpt = { id: string; code: string; name: string };
type MemberOpt = { id: string; code: string; name: string };

// Two top-level modes, surfaced as a segmented control so the personal vs
// team distinction is immediately visible:
//   - "mine"   → everything I created or am assigned to (personal + project)
//   - "shared" → every project task I can see (because I'm staffed on it),
//                regardless of whether I'm assigned to it
type Mode = "mine" | "shared";

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

export function TasksClient({
  tasks,
  projects,
  members,
  currentMemberId,
}: {
  tasks: TaskRecord[];
  projects: ProjectOpt[];
  members: MemberOpt[];
  currentMemberId: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(tasks);
  useEffect(() => setRows(tasks), [tasks]);
  const [mode, setMode] = useState<Mode>("mine");
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

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return rows.filter((t) => {
      // Mode is the primary cut. "mine" = created or assigned (personal +
      // project flavors); "shared" = project tasks I can see (everything with
      // a project, since visibility is already enforced server-side).
      const created = t.createdByRecordId === currentMemberId;
      const assigned = t.assigneeRecordIds.includes(currentMemberId);
      if (mode === "mine") {
        if (!(created || assigned)) return false;
      } else {
        if (!t.projectRecordId) return false;
      }
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
  }, [rows, filters, mode, currentMemberId]);

  const counts = useMemo(() => {
    let mine = 0;
    let shared = 0;
    for (const t of rows) {
      const created = t.createdByRecordId === currentMemberId;
      const assigned = t.assigneeRecordIds.includes(currentMemberId);
      if (created || assigned) mine += 1;
      if (t.projectRecordId) shared += 1;
    }
    return { mine, shared };
  }, [rows, currentMemberId]);

  const grouped = useMemo(() => {
    const map = new Map<TaskStatus, TaskRecord[]>();
    for (const s of STATUS_ORDER) map.set(s, []);
    for (const t of filtered) {
      const s = (t.status || "To do") as TaskStatus;
      map.get(s)?.push(t);
    }
    // Within each status, sort by priority (Urgent first) then due date.
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
        throw new Error(d.error ?? "Update failed");
      }
      router.refresh();
    } catch (e) {
      setRows((rs) => rs.map((r) => (r.id === t.id ? { ...r, status: previous } : r)));
      setToast({ kind: "error", msg: e instanceof Error ? e.message : "Update failed" });
    }
  }

  async function remove(t: TaskRecord) {
    if (!confirm(`Delete task "${t.title}"? This can't be undone.`)) return;
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(t.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Delete failed");
      }
      setRows((rs) => rs.filter((r) => r.id !== t.id));
      setToast({ kind: "ok", msg: "Task deleted" });
      router.refresh();
    } catch (e) {
      setToast({ kind: "error", msg: e instanceof Error ? e.message : "Delete failed" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 p-0.5">
          {(
            [
              { v: "mine", label: "My tasks", count: counts.mine, hint: "Personal + project tasks where you're creator or assignee" },
              { v: "shared", label: "Shared (projects)", count: counts.shared, hint: "All project tasks you can see, even if not assigned" },
            ] as const
          ).map((opt) => {
            const active = mode === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => setMode(opt.v)}
                aria-pressed={active}
                title={opt.hint}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {opt.label}
                <span className={`text-[10px] tabular-nums ${active ? "text-slate-500" : "text-slate-400"}`}>
                  {opt.count}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-500">
          {mode === "mine"
            ? "Everything you created or are assigned to — including your personal tasks."
            : "All project tasks visible to you, including ones you're not personally on."}
        </p>
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
              placeholder="Title, description, project, assignee…"
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

      <div className="grid gap-3 lg:grid-cols-4">
        {STATUS_ORDER.map((s) => (
          <Column
            key={s}
            status={s}
            tasks={grouped.get(s) ?? []}
            currentMemberId={currentMemberId}
            projectsById={projectsById}
            membersById={membersById}
            onOpen={openEdit}
            onStatusChange={quickStatus}
          />
        ))}
      </div>

      <TaskModal
        open={modalOpen}
        editing={editing}
        projects={projects}
        members={members}
        currentMemberId={currentMemberId}
        onClose={closeModal}
        onSaved={(saved, mode) => {
          if (mode === "create") {
            setRows((rs) => [saved, ...rs]);
            setToast({ kind: "ok", msg: "Task created" });
          } else {
            setRows((rs) => rs.map((r) => (r.id === saved.id ? saved : r)));
            setToast({ kind: "ok", msg: "Task updated" });
          }
          closeModal();
          router.refresh();
        }}
        onError={(msg) => setToast({ kind: "error", msg })}
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
  tasks,
  currentMemberId,
  projectsById,
  membersById,
  onOpen,
  onStatusChange,
}: {
  status: TaskStatus;
  tasks: TaskRecord[];
  currentMemberId: string;
  projectsById: Map<string, ProjectOpt>;
  membersById: Map<string, MemberOpt>;
  onOpen: (t: TaskRecord) => void;
  onStatusChange: (t: TaskRecord, next: TaskStatus) => void;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
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
              currentMemberId={currentMemberId}
              projectsById={projectsById}
              membersById={membersById}
              onOpen={onOpen}
              onStatusChange={onStatusChange}
            />
          ))
        )}
      </ul>
    </section>
  );
}

function TaskCard({
  task: t,
  currentMemberId,
  projectsById,
  membersById,
  onOpen,
  onStatusChange,
}: {
  task: TaskRecord;
  currentMemberId: string;
  projectsById: Map<string, ProjectOpt>;
  membersById: Map<string, MemberOpt>;
  onOpen: (t: TaskRecord) => void;
  onStatusChange: (t: TaskRecord, next: TaskStatus) => void;
}) {
  const personal = !t.projectRecordId;
  const project = t.projectRecordId ? projectsById.get(t.projectRecordId) : null;
  const isMine = t.createdByRecordId === currentMemberId;
  const isAssigned = t.assigneeRecordIds.includes(currentMemberId);
  const dueClass = dueDateClass(t.dueDate, t.status);
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
              <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.5 font-medium">
                Personal
              </span>
            ) : (
              <span
                className="inline-flex items-center rounded-full bg-brand-50 text-brand-700 px-1.5 py-0.5 font-medium font-mono"
                title={project?.name ?? t.projectName}
              >
                {project?.code || t.projectCode}
              </span>
            )}
            {t.dueDate ? (
              <span className={`tabular-nums ${dueClass}`}>
                Due {t.dueDate}
              </span>
            ) : null}
            {t.effortHours != null ? (
              <span className="text-slate-500">{t.effortHours}h</span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
            {isMine ? <span title="You created this">Created by you</span> : (
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
    </li>
  );
}

function TaskModal({
  open,
  editing,
  projects,
  members,
  currentMemberId,
  onClose,
  onSaved,
  onError,
  onDelete,
}: {
  open: boolean;
  editing: TaskRecord | null;
  projects: ProjectOpt[];
  members: MemberOpt[];
  currentMemberId: string;
  onClose: () => void;
  onSaved: (t: TaskRecord, mode: "create" | "edit") => void;
  onError: (msg: string) => void;
  onDelete: (t: TaskRecord) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("To do");
  const [priority, setPriority] = useState<TaskPriority | "">("Medium");
  const [dueDate, setDueDate] = useState("");
  const [effort, setEffort] = useState("");
  const [projectId, setProjectId] = useState("");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Reload form values whenever a different task is opened. Personal tasks
  // (no project) default the creator to themselves as the sole assignee.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description);
      setStatus((editing.status as TaskStatus) || "To do");
      setPriority(editing.priority || "");
      setDueDate(editing.dueDate ?? "");
      setEffort(editing.effortHours != null ? String(editing.effortHours) : "");
      setProjectId(editing.projectRecordId);
      setAssignees(editing.assigneeRecordIds);
    } else {
      setTitle("");
      setDescription("");
      setStatus("To do");
      setPriority("Medium");
      setDueDate("");
      setEffort("");
      setProjectId("");
      setAssignees([currentMemberId]);
    }
  }, [open, editing, currentMemberId]);

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

  async function submit() {
    if (!title.trim()) return onError("Title is required.");
    setSubmitting(true);
    try {
      const body = {
        title: title.trim(),
        description,
        status,
        priority,
        dueDate: dueDate || null,
        effortHours: effort === "" ? null : Number(effort),
        projectRecordId: projectId,
        assigneeRecordIds: assignees,
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
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      const saved = data.task ?? null;
      if (saved) {
        onSaved(saved, editing ? "edit" : "create");
      } else if (!editing && data.id) {
        // Fall-back synth — POST returns just the id; rebuild a minimal
        // record so the UI updates without another fetch round-trip.
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
          },
          "create",
        );
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : "Save failed");
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
          <h2 className="text-sm font-semibold text-slate-900">
            {editing ? "Edit task" : "New task"}
          </h2>
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
                Only the creator can change the title or description.
              </span>
            ) : null}
          </label>

          <label className="block">
            <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
              Description
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs disabled:bg-slate-50"
              disabled={!isOwner}
              placeholder="Details, links, subtasks ([ ] item)…"
            />
          </label>

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
              Project
            </span>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs disabled:bg-slate-50"
              disabled={!isOwner}
            >
              <option value="">Personal (no project)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code}
                  {p.name ? ` — ${p.name}` : ""}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[10px] text-slate-500">
              {projectId
                ? "Task will be visible to everyone staffed on this project."
                : "Personal tasks are only visible to you and anyone you assign."}
            </span>
          </label>

          <div>
            <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
              Assignees
            </span>
            <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
              {members.length === 0 ? (
                <div className="text-slate-400">No members available.</div>
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
            className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? "Saving…" : editing ? "Save changes" : "Create task"}
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
