"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  ClientRecord,
  Currency,
  ProjectRecord,
  ProjectStatus,
  ProjectType,
  SowSigned,
} from "@/lib/airtable";

type Props = {
  mode: "create" | "edit";
  clients: ClientRecord[];
  projectTypes: readonly ProjectType[];
  projectStatuses: readonly ProjectStatus[];
  currencies: readonly Currency[];
  sowOptions: readonly SowSigned[];
  existing?: ProjectRecord;
};

function numStr(n: number | null): string {
  return n == null ? "" : String(n);
}

export function ProjectForm({
  mode,
  clients,
  projectTypes,
  projectStatuses,
  currencies,
  sowOptions,
  existing,
}: Props) {
  const router = useRouter();
  const [projectCode, setProjectCode] = useState(existing?.projectCode ?? "");
  const [projectName, setProjectName] = useState(existing?.projectName ?? "");
  const [clientId, setClientId] = useState<string>(existing?.clientRecordIds[0] ?? "");
  const [type, setType] = useState<string>(existing?.type ?? "");
  const [objective, setObjective] = useState(existing?.objective ?? "");
  const [startDate, setStartDate] = useState(existing?.startDate ?? "");
  const [endDate, setEndDate] = useState(existing?.endDate ?? "");
  const [currency, setCurrency] = useState<string>(existing?.currency ?? "");
  const [totalAmount, setTotalAmount] = useState(numStr(existing?.totalAmount ?? null));
  const [fxToEur, setFxToEur] = useState(numStr(existing?.fxToEur ?? null));
  const [status, setStatus] = useState<string>(existing?.status ?? "");
  const [sowSigned, setSowSigned] = useState<string>(existing?.sowSigned ?? "");
  const [sowValidityDate, setSowValidityDate] = useState(existing?.sowValidityDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const body = {
        projectCode,
        projectName,
        clientRecordIds: clientId ? [clientId] : [],
        type,
        objective,
        startDate: startDate || null,
        endDate: endDate || null,
        currency,
        totalAmount: totalAmount === "" ? null : Number(totalAmount),
        fxToEur: fxToEur === "" ? null : Number(fxToEur),
        status,
        sowSigned,
        sowValidityDate: sowValidityDate || null,
      };
      const url =
        mode === "create" ? "/api/admin/projects" : `/api/admin/projects/${existing!.id}`;
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
      router.push("/admin/projects");
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
        <Field label="Project code" value={projectCode} onChange={setProjectCode} required />
        <Field label="Project name" value={projectName} onChange={setProjectName} required />
        <Select label="Client" value={clientId} onChange={setClientId}>
          <option value="">— None —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.clientCode} — {c.clientName}
            </option>
          ))}
        </Select>
        <Select label="Type" value={type} onChange={setType}>
          <option value="">—</option>
          {projectTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Select label="Status" value={status} onChange={setStatus}>
          <option value="">—</option>
          {projectStatuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select label="Currency" value={currency} onChange={setCurrency}>
          <option value="">—</option>
          {currencies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Field
          label="Total amount"
          value={totalAmount}
          onChange={setTotalAmount}
          type="number"
        />
        <Field label="FX to EUR" value={fxToEur} onChange={setFxToEur} type="number" />
        <Field label="Start date" value={startDate} onChange={setStartDate} type="date" />
        <Field label="End date" value={endDate} onChange={setEndDate} type="date" />
        <Select label="SOW signed" value={sowSigned} onChange={setSowSigned}>
          <option value="">—</option>
          {sowOptions.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
        <Field
          label="SOW validity date"
          value={sowValidityDate}
          onChange={setSowValidityDate}
          type="date"
        />
      </div>
      <TextArea label="Objective" value={objective} onChange={setObjective} />
      {error ? <div className="rounded-md bg-red-50 text-red-700 p-3 text-sm">{error}</div> : null}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push("/admin/projects")}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {saving ? "Saving…" : mode === "create" ? "Create project" : "Save changes"}
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
  type = "text",
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
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        step={type === "number" ? "any" : undefined}
        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 bg-white"
      >
        {children}
      </select>
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
