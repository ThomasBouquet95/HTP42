"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/form-controls";
import { SegmentedTabs } from "@/components/filters";
import type { PagePerms } from "@/lib/permissions";

type PageDef = { key: string; label: string; category: string; href: string };

export function RolesClient({
  roles,
  pages,
  initial,
  superAdminRole,
  noAccessRoles = [],
}: {
  roles: string[];
  pages: PageDef[];
  initial: Record<string, PagePerms>;
  superAdminRole: string;
  noAccessRoles?: string[];
}) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, PagePerms>>(initial);
  const [role, setRole] = useState(roles[0] ?? "");
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);

  // Group pages by category, preserving order.
  const grouped = useMemo(() => {
    const out: { category: string; pages: PageDef[] }[] = [];
    for (const p of pages) {
      let g = out.find((x) => x.category === p.category);
      if (!g) {
        g = { category: p.category, pages: [] };
        out.push(g);
      }
      g.pages.push(p);
    }
    return out;
  }, [pages]);

  const perms = state[role] ?? {};
  const dirty = JSON.stringify(state[role]) !== JSON.stringify(initial[role]);

  function setPerm(pageKey: string, next: { view: boolean; edit: boolean }) {
    setState((s) => ({ ...s, [role]: { ...s[role], [pageKey]: next } }));
  }
  function toggleView(pageKey: string) {
    const cur = perms[pageKey] ?? { view: false, edit: false };
    const view = !cur.view;
    setPerm(pageKey, { view, edit: view ? cur.edit : false }); // no view ⇒ no edit
  }
  function toggleEdit(pageKey: string) {
    const cur = perms[pageKey] ?? { view: false, edit: false };
    const edit = !cur.edit;
    setPerm(pageKey, { view: edit ? true : cur.view, edit }); // edit ⇒ view
  }
  function setAll(action: "view" | "edit", value: boolean) {
    setState((s) => {
      const next: PagePerms = { ...s[role] };
      for (const p of pages) {
        const cur = next[p.key] ?? { view: false, edit: false };
        if (action === "view") next[p.key] = { view: value, edit: value ? cur.edit : false };
        else next[p.key] = { view: value ? true : cur.view, edit: value };
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

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <p>
          <strong className="text-slate-800">{superAdminRole}</strong> always has full access and
          can&apos;t be restricted. Edit implies view.
        </p>
        {noAccessRoles.length ? (
          <p className="mt-1 text-slate-500">
            No admin access (member-only):{" "}
            {noAccessRoles.map((r, i) => (
              <span key={r}>
                {i > 0 ? ", " : ""}
                <span className="font-medium text-slate-700">{r}</span>
              </span>
            ))}
            , and unassigned members.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          ariaLabel="Role"
          value={role}
          onChange={setRole}
          options={roles.map((r) => ({ value: r, label: r }))}
        />
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
      </div>

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
                {g.pages.map((p) => {
                  const perm = perms[p.key] ?? { view: false, edit: false };
                  return (
                    <tr key={p.key} className="border-t border-slate-100">
                      <td className="px-4 py-2 text-slate-800">{p.label}</td>
                      <td className="px-3 py-2 text-center">
                        <Check checked={perm.view} onChange={() => toggleView(p.key)} label={`View ${p.label}`} />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Check checked={perm.edit} onChange={() => toggleEdit(p.key)} label={`Edit ${p.label}`} />
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-3">
        {dirty ? <span className="text-[11px] text-amber-600">Unsaved changes</span> : null}
        <Button tone="primary" size="sm" onClick={save} disabled={!dirty || savingRole === role}>
          {savingRole === role ? "Saving…" : "Save changes"}
        </Button>
      </div>

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

function Check({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`inline-flex h-5 w-5 items-center justify-center rounded border ${
        checked ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white hover:border-slate-400"
      }`}
    >
      {checked ? (
        <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M2.5 6.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </button>
  );
}
