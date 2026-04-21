"use client";

import { useState, type FormEvent } from "react";
import type { MemberRecord } from "@/lib/airtable";

type Props = { initial: MemberRecord };

export function ProfileForm({ initial }: Props) {
  const [fullName, setFullName] = useState(initial.fullName);
  const [introduction, setIntroduction] = useState(initial.introduction);
  const [country, setCountry] = useState(initial.country);
  const [phone, setPhone] = useState(initial.phone);
  const [legalEntity, setLegalEntity] = useState(initial.legalEntity);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; message: string } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNotice(null);
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fullName, introduction, country, phone, legalEntity }),
      });
      if (res.ok) {
        setNotice({ kind: "ok", message: "Profile saved." });
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setNotice({ kind: "err", message: data.error ?? "Unable to save." });
      }
    } catch {
      setNotice({ kind: "err", message: "Network error. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 bg-white rounded-lg border border-slate-200 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <ReadOnly label="Member code" value={initial.memberCode} mono />
        <ReadOnly label="Email" value={initial.email} />
        <ReadOnly label="Role" value={initial.role || "—"} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" value={fullName} onChange={setFullName} required />
        <Field label="Country" value={country} onChange={setCountry} />
        <Field label="Phone" value={phone} onChange={setPhone} type="tel" />
        <Field label="Legal entity" value={legalEntity} onChange={setLegalEntity} />
      </div>
      <TextArea label="Introduction" value={introduction} onChange={setIntroduction} />

      {notice ? (
        <div
          className={`rounded-md p-3 text-sm ${
            notice.kind === "ok"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {notice.message}
        </div>
      ) : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function ReadOnly({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm ${mono ? "font-mono" : ""}`}>
        {value || "—"}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  type,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type={type ?? "text"}
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
