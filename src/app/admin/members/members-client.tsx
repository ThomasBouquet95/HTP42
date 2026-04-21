"use client";

import { useMemo, useState } from "react";
import type {
  Currency,
  MemberAdminRecord,
  MemberRole,
  MemberStatus,
} from "@/lib/airtable";

type Props = {
  members: MemberAdminRecord[];
  roles: readonly MemberRole[];
  statuses: readonly MemberStatus[];
  currencies: readonly Currency[];
};

export function MembersAdminClient({ members, roles, statuses, currencies }: Props) {
  const [rows, setRows] = useState<MemberAdminRecord[]>(members);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<MemberAdminRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((m) =>
      [m.memberCode, m.fullName, m.email, m.role, m.status, m.country]
        .some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [rows, search]);

  function startEdit(m: MemberAdminRecord) {
    setEditing(m.id);
    setDraft({ ...m });
    setError(null);
  }

  function cancelEdit() {
    setEditing(null);
    setDraft(null);
    setError(null);
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/members/${draft.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: draft.fullName,
          email: draft.email,
          introduction: draft.introduction,
          country: draft.country,
          phone: draft.phone,
          legalEntity: draft.legalEntity,
          title: draft.title,
          role: draft.role || undefined,
          status: draft.status || undefined,
          dailyRate: draft.dailyRate,
          currency: draft.currency,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Save failed (${res.status})`);
      }
      const data = (await res.json()) as { member: MemberAdminRecord };
      setRows((prev) => prev.map((m) => (m.id === data.member.id ? data.member : m)));
      cancelEdit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search members…"
          className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      {error ? (
        <div className="rounded-md bg-red-50 text-red-700 p-3 text-sm">{error}</div>
      ) : null}

      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <Th>Code</Th>
              <Th>Full name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Country</Th>
              <Th>Phone</Th>
              <Th>Legal entity</Th>
              <Th>Daily rate</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center text-slate-500 py-10">
                  No members match.
                </td>
              </tr>
            ) : (
              filtered.map((m) =>
                editing === m.id && draft ? (
                  <tr key={m.id} className="border-t border-slate-100 bg-amber-50/30">
                    <td className="px-3 py-2 font-mono">{m.memberCode}</td>
                    <td className="px-3 py-2">
                      <Input value={draft.fullName} onChange={(v) => setDraft({ ...draft, fullName: v })} />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="email"
                        value={draft.email}
                        onChange={(v) => setDraft({ ...draft, email: v })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={draft.role || ""}
                        onChange={(v) => setDraft({ ...draft, role: v as MemberRole | "" })}
                        options={[{ value: "", label: "—" }, ...roles.map((r) => ({ value: r, label: r }))]}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={draft.status}
                        onChange={(v) => setDraft({ ...draft, status: v as MemberStatus })}
                        options={statuses.map((s) => ({ value: s, label: s }))}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input value={draft.country} onChange={(v) => setDraft({ ...draft, country: v })} />
                    </td>
                    <td className="px-3 py-2">
                      <Input value={draft.phone} onChange={(v) => setDraft({ ...draft, phone: v })} />
                    </td>
                    <td className="px-3 py-2">
                      <Input value={draft.legalEntity} onChange={(v) => setDraft({ ...draft, legalEntity: v })} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <input
                          type="number"
                          value={draft.dailyRate ?? ""}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              dailyRate: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                          className="w-20 rounded-md border border-slate-300 px-2 py-1"
                        />
                        <select
                          value={draft.currency || ""}
                          onChange={(e) =>
                            setDraft({ ...draft, currency: e.target.value as Currency | "" })
                          }
                          className="rounded-md border border-slate-300 bg-white px-1 py-1"
                        >
                          <option value="">—</option>
                          {currencies.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={save}
                        disabled={saving}
                        className="rounded-md bg-brand-600 text-white px-2 py-1 text-xs font-medium disabled:opacity-60"
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="ml-2 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium"
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={m.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2 font-mono">{m.memberCode}</td>
                    <td className="px-3 py-2">{m.fullName}</td>
                    <td className="px-3 py-2">{m.email}</td>
                    <td className="px-3 py-2">{m.role || "—"}</td>
                    <td className="px-3 py-2">{m.status}</td>
                    <td className="px-3 py-2">{m.country || "—"}</td>
                    <td className="px-3 py-2">{m.phone || "—"}</td>
                    <td className="px-3 py-2">{m.legalEntity || "—"}</td>
                    <td className="px-3 py-2">
                      {m.dailyRate ? `${m.dailyRate.toLocaleString()} ${m.currency || ""}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => startEdit(m)}
                        className="text-brand-600 hover:text-brand-700 text-xs font-medium"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ),
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="text-left px-3 py-2 font-medium">{children}</th>;
}
function Input({
  value,
  onChange,
  type,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <input
      type={type ?? "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-slate-300 px-2 py-1"
    />
  );
}
function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-slate-300 bg-white px-2 py-1"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
