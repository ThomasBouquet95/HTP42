"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ClientRecord } from "@/lib/airtable";

type Props = {
  mode: "create" | "edit";
  existing?: ClientRecord;
};

export function ClientForm({ mode, existing }: Props) {
  const router = useRouter();
  const [clientCode, setClientCode] = useState(existing?.clientCode ?? "");
  const [clientName, setClientName] = useState(existing?.clientName ?? "");
  const [industry, setIndustry] = useState(existing?.industry ?? "");
  const [country, setCountry] = useState(existing?.country ?? "");
  const [keyContact, setKeyContact] = useState(existing?.keyContact ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const body = { clientCode, clientName, industry, country, keyContact, notes };
      const url =
        mode === "create" ? "/api/admin/clients" : `/api/admin/clients/${existing!.id}`;
      const method = mode === "create" ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Save failed.");
      }
      router.push("/admin/clients");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 bg-white rounded-lg border border-slate-200 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client code" value={clientCode} onChange={setClientCode} required />
        <Field label="Client name" value={clientName} onChange={setClientName} required />
        <Field label="Industry" value={industry} onChange={setIndustry} />
        <Field label="Country" value={country} onChange={setCountry} />
        <Field label="Key contact" value={keyContact} onChange={setKeyContact} />
      </div>
      <TextArea label="Notes" value={notes} onChange={setNotes} />
      {error ? <div className="rounded-md bg-red-50 text-red-700 p-3 text-sm">{error}</div> : null}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push("/admin/clients")}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {saving ? "Saving…" : mode === "create" ? "Create client" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
      />
    </label>
  );
}
