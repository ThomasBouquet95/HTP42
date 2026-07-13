"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/form-controls";
import { SegmentedTabs } from "@/components/filters";
import type { PagePerms } from "@/lib/permissions";

export type RoleKind = "full" | "config" | "none";
type RowDef = { key: string; label: string; category: string; indent: boolean };
type RoleDef = { name: string; kind: RoleKind; perms: PagePerms };

export function RolesClient({
  roles,
  rows,
  canEdit,
}: {
  roles: RoleDef[];
  rows: RowDef[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const kindByRole = useMemo(
    () => Object.fromEntries(roles.map((r) => [r.name, r.kind])),
    [roles],
  );
  const initial = useMemo(
    () => Object.fromEntries(roles.map((r) => [r.name, r.perms])) as Record<string, PagePerms>,
    [roles],
  );
  const [state, setState] = useState<Record<string, PagePerms>>(initial);
  const [role, setRole] = useState(roles[0]?.name ?? "");
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);

  const kind = kindByRole[role] as RoleKind;
  const editable = kind === "config" && canEdit;
  const perms = state[role] ?? {};

  const grouped = useMemo(() => {
    const out: { category: string; rows: RowDef[] }[] = [];
    for (const r of rows) {
      let g = out.find((x) => x.category === r.category);
      if (!g) {
        g = { category: r.category, rows: [] };
        out.push(g);
      }
      g.rows.push(r);
    }
    return out;
  }, [rows]);

  const dirty = JSON.stringify(state[role]) !== JSON.stringify(initial[role]);

  function setPerm(pageKey: string, next: { view: boolean; edit: boolean }) {
    setState((s) => ({ ...s, [role]: { ...s[role], [pageKey]: next } }));
  }
  function toggleView(pageKey: string) {
    if (!editable) return;
    const cur = perms[pageKey] ?? { view: false, edit: false };
    const view = !cur.view;
    setPerm(pageKey, { view, edit: view ? cur.edit : false });
  }
  function toggleEdit(pageKey: string) {
    if (!editable) return;
    const cur = perms[pageKey] ?? { view: false, edit: false };
    const edit = !cur.edit;
    setPerm(pageKey, { view: edit ? true : cur.view, edit });
  }
  function setAll(action: "view" | "edit", value: boolean) {
    if (!editable) return;
    setState((s) => {
      const next: PagePerms = { ...s[role] };
      for (const r of rows) {
        const cur = next[r.key] ?? { view: false, edit: false };
        if (action === "view") next[r.key] = { view: value, edit: value ? cur.edit : false };
        else next[r.key] = { view: value ? true : cur.view, edit: value };
      }
      return { ...s, [role]: next };
    });
  }

  async function save() {
    setSavingRole(role);
    try {
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, perms: state[role] }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Save failed.");
      }
      setToast({ kind: "ok", msg: `Saved access for ${role}` });
      router.refresh();
    } catch (e) {
      setToast({ kind: "error", msg: e instanceof Error ? e.message : "Save failed." });
    } finally {
      setSavingRole(null);
    }
  }

  const banner =
    kind === "full"
      ? { cls: "border-emerald-200 bg-emerald-50 text-emerald-800", text: "Full access to every page — not configurable." }
      : kind === "none"
        ? { cls: "border-slate-200 bg-slate-50 text-slate-600", text: "No admin access — member-only. Not configurable." }
        : !canEdit
          ? { cls: "border-amber-200 bg-amber-50 text-amber-800", text: "View-only: you can see these settings but not change them." }
          : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          ariaLabel="Role"
          value={role}
          onChange={setRole}
          options={roles.map((r) => ({ value: r.name, label: r.name }))}
        />
        {editable ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-slate-400">Set all</span>
            <button type="button" onClick={() => setAll("view", true)} className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50">
              View
            </button>
            <button type="button" onClick={() => setAll("edit", true)} className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50">
              Edit
            </button>
            <button type="button" onClick={() => setAll("view", false)} className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50">
              None
            </button>
          </div>
        ) : null}
      </div>

      {banner ? (
        <div className={`rounded-lg border px-4 py-2 text-xs ${banner.cls}`}>{banner.text}</div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Page</th>
              <th className="w-24 px-3 py-2 text-center font-medium">View</th>
              <th className="w-24 px-3 py-2 text-center font-medium">Edit</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((g) => (
              <Fragment key={g.category}>
                <tr className="bg-slate-50/60">
                  <td colSpan={3} className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {g.category}
                  </td>
                </tr>
                {g.rows.map((r) => {
                  const perm = perms[r.key] ?? { view: false, edit: false };
                  return (
                    <tr key={r.key} className="border-t border-slate-100">
                      <td className={`py-2 text-slate-800 ${r.indent ? "pl-10 pr-4 text-slate-500" : "px-4"}`}>
                        {r.indent ? <span className="mr-1 text-slate-300">↳</span> : null}
                        {r.label}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Check checked={perm.view} disabled={!editable} onChange={() => toggleView(r.key)} label={`View ${r.label}`} />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Check checked={perm.edit} disabled={!editable} onChange={() => toggleEdit(r.key)} label={`Edit ${r.label}`} />
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {editable ? (
        <div className="flex items-center justify-end gap-3">
          {dirty ? <span className="text-[11px] text-amber-600">Unsaved changes</span> : null}
          <Button tone="primary" size="sm" onClick={save} disabled={!dirty || savingRole === role}>
            {savingRole === role ? "Saving…" : "Save changes"}
          </Button>
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

function Check({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`inline-flex h-5 w-5 items-center justify-center rounded border ${
        checked
          ? disabled
            ? "border-slate-300 bg-slate-300 text-white"
            : "border-brand-600 bg-brand-600 text-white"
          : "border-slate-300 bg-white"
      } ${disabled ? "cursor-not-allowed opacity-70" : "hover:border-slate-400"}`}
    >
      {checked ? (
        <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M2.5 6.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </button>
  );
}
