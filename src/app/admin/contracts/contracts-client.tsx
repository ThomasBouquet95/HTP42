"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ContractRecord } from "@/lib/airtable";

type Props = {
  contracts: ContractRecord[];
};

type StageFilter = "All" | string;
type StatusFilter = "All" | string;
type TypeFilter = "All" | string;

type Filters = {
  search: string;
  type: TypeFilter;
  contactType: "All" | string;
  stage: StageFilter;
  status: StatusFilter;
  validity: "All" | "Valid" | "Expired" | "Other";
};

// Admins typically open this tab to chase what's actively in motion —
// signed contracts that are still valid. Default the validity filter to
// "Valid" (drops Expired + Unknown), everything else open.
const DEFAULT_FILTERS: Filters = {
  search: "",
  type: "All",
  contactType: "All",
  stage: "All",
  status: "All",
  validity: "Valid",
};

export function ContractsAdminClient({ contracts: initialContracts }: Props) {
  const router = useRouter();
  // Local mirror of the server-side list so optimistic edits / uploads
  // reflect immediately while the server round-trip lands.
  const [contracts, setContracts] = useState<ContractRecord[]>(initialContracts);
  useEffect(() => setContracts(initialContracts), [initialContracts]);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [openId, setOpenId] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // PATCH the editable lifecycle fields. Optimistic: we patch the local
  // mirror first, surface a toast, and roll back on failure.
  async function patchContract(
    id: string,
    patch: { contractType?: string; stage?: string; contractStatus?: string },
  ) {
    const previous = contracts.find((c) => c.id === id);
    if (!previous) return;
    setContracts((rs) =>
      rs.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
    setSavingIds((s) => new Set(s).add(id));
    try {
      const res = await fetch(`/api/admin/contracts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Update failed (HTTP ${res.status})`);
      }
      setToast({ kind: "ok", msg: "Contract updated" });
      router.refresh();
    } catch (e) {
      setContracts((rs) => rs.map((r) => (r.id === id ? previous : r)));
      setToast({ kind: "error", msg: e instanceof Error ? e.message : "Update failed" });
    } finally {
      setSavingIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }

  async function uploadPdf(id: string, file: File): Promise<boolean> {
    setSavingIds((s) => new Set(s).add(id));
    try {
      const form = new FormData();
      form.append("pdf", file);
      const res = await fetch(`/api/admin/contracts/${encodeURIComponent(id)}/upload`, {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
        contract?: ContractRecord;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `Upload failed (HTTP ${res.status})`);
      if (data.contract) {
        setContracts((rs) =>
          rs.map((r) => (r.id === id ? (data.contract as ContractRecord) : r)),
        );
      }
      setToast({ kind: "ok", msg: "PDF uploaded — notification sent" });
      router.refresh();
      return true;
    } catch (e) {
      setToast({ kind: "error", msg: e instanceof Error ? e.message : "Upload failed" });
      return false;
    } finally {
      setSavingIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }

  // Build dropdown option lists from the real values present in the
  // dataset — no hardcoded enums, since Airtable's contract type/stage
  // lists evolve and we don't want stale dropdowns.
  const typeOptions = useMemo(
    () => uniqueSortedValues(contracts.map((c) => c.contractType)),
    [contracts],
  );
  const contactTypeOptions = useMemo(
    () => uniqueSortedValues(contracts.map((c) => c.contactType)),
    [contracts],
  );
  const stageOptions = useMemo(
    () => uniqueSortedValues(contracts.map((c) => c.stage)),
    [contracts],
  );
  const statusOptions = useMemo(
    () => uniqueSortedValues(contracts.map((c) => c.contractStatus)),
    [contracts],
  );

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return contracts.filter((c) => {
      if (filters.type !== "All" && c.contractType !== filters.type) return false;
      if (filters.contactType !== "All" && c.contactType !== filters.contactType) return false;
      if (filters.stage !== "All" && c.stage !== filters.stage) return false;
      if (filters.status !== "All" && c.contractStatus !== filters.status) return false;
      if (filters.validity !== "All") {
        const bucket = validityBucket(c.validity);
        if (bucket !== filters.validity) return false;
      }
      if (!q) return true;
      // Search hits the fields a finance admin would naturally type into
      // the box: project code, member, counterparty, signatory, type.
      const hay = [
        c.projectCode,
        c.company,
        c.contractType,
        c.contactType,
        c.signatory,
        c.stage,
        c.contractStatus,
        c.validity,
        ...c.memberCodes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [contracts, filters]);

  // Validity counts include EVERY contract (not just filtered) so the
  // little pill counters next to the dropdowns reflect the inventory, not
  // whatever subset the user is staring at right now.
  const validityCounts = useMemo(() => {
    const out = { Valid: 0, Expired: 0, Other: 0 };
    for (const c of contracts) {
      const b = validityBucket(c.validity);
      out[b] += 1;
    }
    return out;
  }, [contracts]);

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  const openContract = openId ? contracts.find((c) => c.id === openId) ?? null : null;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Select
            label="Search"
            renderAs="search"
            value={filters.search}
            onChange={(v) => update("search", v)}
            placeholder="Project, member, company, signatory…"
          />
          <Select
            label="Contract type"
            value={filters.type}
            onChange={(v) => update("type", v as StageFilter)}
            options={[
              { value: "All", label: "All types" },
              ...typeOptions.map((t) => ({ value: t, label: t })),
            ]}
          />
          <Select
            label="Counterparty"
            value={filters.contactType}
            onChange={(v) => update("contactType", v)}
            options={[
              { value: "All", label: "All counterparties" },
              ...contactTypeOptions.map((t) => ({ value: t, label: t })),
            ]}
          />
          <Select
            label="Stage"
            value={filters.stage}
            onChange={(v) => update("stage", v as StageFilter)}
            options={[
              { value: "All", label: "All stages" },
              ...stageOptions.map((s) => ({ value: s, label: s })),
            ]}
          />
          <Select
            label="Status"
            value={filters.status}
            onChange={(v) => update("status", v as StatusFilter)}
            options={[
              { value: "All", label: "All statuses" },
              ...statusOptions.map((s) => ({ value: s, label: s })),
            ]}
          />
        </div>

        {/* Validity tabs: Valid / Expired / Other / All. Picks up the
            three meaningful buckets from the Airtable Validity field
            (which has free-form values like "Valid – interdependent with
            Client Master Contract") and routes anything outside
            Valid/Expired to the catch-all "Other" pill. */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs">
            {(
              [
                { value: "Valid", label: "Valid", count: validityCounts.Valid },
                { value: "Expired", label: "Expired", count: validityCounts.Expired },
                { value: "Other", label: "Other", count: validityCounts.Other },
                {
                  value: "All",
                  label: "All",
                  count:
                    validityCounts.Valid + validityCounts.Expired + validityCounts.Other,
                },
              ] as const
            ).map((tab) => {
              const active = filters.validity === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => update("validity", tab.value)}
                  aria-pressed={active}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                    active
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {tab.label}{" "}
                  <span className={`text-[10px] ${active ? "text-slate-500" : "text-slate-400"}`}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>
              {filtered.length} contract{filtered.length === 1 ? "" : "s"}
            </span>
            <ActiveFilterChips filters={filters} onClear={update} />
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Main table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-2 py-1.5 font-medium">Project / Member</th>
              <th className="text-left px-2 py-1.5 font-medium">Type</th>
              <th className="text-left px-2 py-1.5 font-medium">Counterparty</th>
              <th className="text-left px-2 py-1.5 font-medium hidden md:table-cell">Effective</th>
              <th className="text-left px-2 py-1.5 font-medium hidden md:table-cell">Expiry</th>
              <th className="text-left px-2 py-1.5 font-medium">Stage</th>
              <th className="text-left px-2 py-1.5 font-medium hidden lg:table-cell">Status</th>
              <th className="text-left px-2 py-1.5 font-medium">Validity</th>
              <th className="text-left px-2 py-1.5 font-medium">PDF</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center text-slate-500 py-10 text-xs">
                  No contracts match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setOpenId(c.id)}
                  className="border-t border-slate-100 cursor-pointer hover:bg-slate-50 align-top"
                  title="Click for the full contract"
                >
                  <td className="px-2 py-1.5">
                    <div className="font-mono text-[10px] text-slate-500">
                      {c.projectCode || "—"}
                    </div>
                    <div className="font-mono text-[10px] text-brand-700">
                      {c.memberCodes.join(", ") || "—"}
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    {c.contractType ? <TypePill type={c.contractType} /> : <Dash />}
                  </td>
                  <td className="px-2 py-1.5 demo-blur">
                    <div className="truncate max-w-[16rem]">{c.company || "—"}</div>
                    <div className="text-[10px] text-slate-500">
                      {c.contactType || ""}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 hidden md:table-cell whitespace-nowrap text-slate-700">
                    {c.effectiveDate || <Dash />}
                  </td>
                  <td className="px-2 py-1.5 hidden md:table-cell whitespace-nowrap text-slate-700">
                    {c.expiryDate || <Dash />}
                  </td>
                  <td className="px-2 py-1.5">
                    {c.stage ? <StagePill stage={c.stage} /> : <Dash />}
                  </td>
                  <td className="px-2 py-1.5 hidden lg:table-cell">
                    {c.contractStatus ? (
                      <StatusPill status={c.contractStatus} />
                    ) : (
                      <Dash />
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {c.validity ? <ValidityPill validity={c.validity} /> : <Dash />}
                  </td>
                  {/* PDF cell: stopPropagation so clicking the link
                      downloads the file instead of also opening the
                      detail modal. */}
                  <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                    {c.pdf?.url ? (
                      <a
                        href={c.pdf.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-700 hover:text-brand-800 font-medium"
                        title={c.pdf.filename || "Download"}
                      >
                        Download
                      </a>
                    ) : (
                      <span className="text-[10px] text-slate-400">
                        Click row to upload
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {openContract ? (
        <ContractDetailModal
          contract={openContract}
          saving={savingIds.has(openContract.id)}
          typeOptions={typeOptions}
          stageOptions={stageOptions}
          statusOptions={statusOptions}
          onClose={() => setOpenId(null)}
          onPatch={(patch) => patchContract(openContract.id, patch)}
          onUpload={(file) => uploadPdf(openContract.id, file)}
        />
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

function uniqueSortedValues(values: string[]): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const trimmed = v.trim();
    if (trimmed) set.add(trimmed);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

// Buckets the free-form Validity field into the three meaningful pills.
// Anything that includes "Valid" (case-insensitive) is Valid; "Expired"
// is Expired; everything else falls into "Other" (Unknown, edge cases).
function validityBucket(v: string): "Valid" | "Expired" | "Other" {
  const s = v.trim().toLowerCase();
  if (!s) return "Other";
  if (s.includes("expired")) return "Expired";
  if (s.includes("valid") || s === "active") return "Valid";
  return "Other";
}

function ActiveFilterChips({
  filters,
  onClear,
}: {
  filters: Filters;
  onClear: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
}) {
  const chips: { label: string; clear: () => void }[] = [];
  if (filters.type !== "All") {
    chips.push({ label: filters.type, clear: () => onClear("type", "All") });
  }
  if (filters.contactType !== "All") {
    chips.push({ label: filters.contactType, clear: () => onClear("contactType", "All") });
  }
  if (filters.stage !== "All") {
    chips.push({ label: filters.stage, clear: () => onClear("stage", "All") });
  }
  if (filters.status !== "All") {
    chips.push({ label: filters.status, clear: () => onClear("status", "All") });
  }
  if (chips.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {chips.map((c) => (
        <button
          key={c.label}
          type="button"
          onClick={c.clear}
          className="inline-flex items-center gap-1 rounded-full bg-brand-50 border border-brand-200 px-2 py-0.5 text-[11px] font-medium text-brand-700 hover:bg-brand-100"
          title="Clear this filter"
        >
          {c.label}
          <span aria-hidden>×</span>
        </button>
      ))}
    </span>
  );
}

// Reusable pill components. Colours are derived from the value content so
// new free-form contract types / stages / statuses pick up a sensible
// default rather than rendering as raw text.

function TypePill({ type }: { type: string }) {
  const t = type.toLowerCase();
  let cls = "bg-slate-50 text-slate-700 border-slate-200";
  if (t === "msa" || t.includes("msa")) cls = "bg-violet-50 text-violet-700 border-violet-200";
  else if (t === "nda" || t === "cda") cls = "bg-amber-50 text-amber-700 border-amber-200";
  else if (t.includes("sow") || t === "sow") cls = "bg-sky-50 text-sky-700 border-sky-200";
  else if (t.includes("service")) cls = "bg-emerald-50 text-emerald-700 border-emerald-200";
  else if (t.includes("framework")) cls = "bg-teal-50 text-teal-700 border-teal-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {type}
    </span>
  );
}

function StagePill({ stage }: { stage: string }) {
  const s = stage.toLowerCase();
  let cls = "bg-slate-100 text-slate-700 border-slate-200";
  if (s === "signed") cls = "bg-emerald-50 text-emerald-700 border-emerald-200";
  else if (s === "draft") cls = "bg-slate-100 text-slate-700 border-slate-200";
  else if (s.includes("review")) cls = "bg-sky-50 text-sky-700 border-sky-200";
  else if (s.includes("negotiation")) cls = "bg-amber-50 text-amber-700 border-amber-200";
  else if (s.includes("pending")) cls = "bg-orange-50 text-orange-700 border-orange-200";
  else if (s === "terminated" || s === "expired") cls = "bg-red-50 text-red-700 border-red-200";
  else if (s === "superseded") cls = "bg-violet-50 text-violet-700 border-violet-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {stage}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase();
  let cls = "bg-slate-50 text-slate-700 border-slate-200";
  if (s === "on track") cls = "bg-emerald-50 text-emerald-700 border-emerald-200";
  else if (s === "action required") cls = "bg-orange-50 text-orange-700 border-orange-200";
  else if (s === "awaiting response") cls = "bg-amber-50 text-amber-700 border-amber-200";
  else if (s === "blocked") cls = "bg-red-50 text-red-700 border-red-200";
  else if (s === "active") cls = "bg-sky-50 text-sky-700 border-sky-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {status}
    </span>
  );
}

function ValidityPill({ validity }: { validity: string }) {
  const bucket = validityBucket(validity);
  const cls =
    bucket === "Valid"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : bucket === "Expired"
      ? "bg-red-50 text-red-700 border-red-200"
      : "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}
      title={validity}
    >
      {bucket}
    </span>
  );
}

function Dash() {
  return <span className="text-slate-300">—</span>;
}

// Detail modal: every field in one place, with sensitive bits (company,
// signatory, contact details, clauses) tagged for demo-mode blur.
function ContractDetailModal({
  contract: c,
  saving,
  typeOptions,
  stageOptions,
  statusOptions,
  onClose,
  onPatch,
  onUpload,
}: {
  contract: ContractRecord;
  saving: boolean;
  typeOptions: string[];
  stageOptions: string[];
  statusOptions: string[];
  onClose: () => void;
  onPatch: (patch: {
    contractType?: string;
    stage?: string;
    contractStatus?: string;
  }) => Promise<void>;
  onUpload: (file: File) => Promise<boolean>;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-upload of the same filename
    if (!file) return;
    setUploading(true);
    try {
      await onUpload(file);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/60 px-3 py-6 sm:items-center sm:py-10"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              {c.contractType ? <TypePill type={c.contractType} /> : null}
              {c.stage ? <StagePill stage={c.stage} /> : null}
              {c.contractStatus ? <StatusPill status={c.contractStatus} /> : null}
              {c.validity ? <ValidityPill validity={c.validity} /> : null}
            </div>
            <h2 className="mt-1 truncate text-base font-semibold text-slate-900 demo-blur">
              {c.company || "—"}
            </h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              {c.projectCode ? (
                <Link
                  href={`/admin/projects?project=${encodeURIComponent(c.projectCode)}`}
                  className="font-mono text-brand-700 hover:text-brand-800 hover:underline"
                  title="Open the project in the admin"
                  onClick={(e) => e.stopPropagation()}
                >
                  {c.projectCode}
                </Link>
              ) : null}
              {c.memberCodes.length > 0 ? (
                <span className="font-mono text-brand-700">
                  {c.memberCodes.join(", ")}
                </span>
              ) : null}
              {c.contactType ? <span>· {c.contactType}</span> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* PDF actions: download if attached, otherwise upload. Always
            visible — uploading triggers a Graph email to HTP42's inbox
            so finance can keep a paper trail outside Airtable. */}
        <div className="border-b border-slate-200 px-5 py-3">
          {c.pdf?.url ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Signed PDF
                </div>
                <div className="truncate text-xs text-slate-700">
                  {c.pdf.filename || "contract.pdf"}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={c.pdf.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-brand-300 bg-white px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
                >
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading || saving}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {uploading ? "Uploading…" : "Replace"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-amber-50 px-3 py-2 ring-1 ring-amber-200">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                  No PDF on file
                </div>
                <div className="text-xs text-amber-700">
                  Upload the signed contract — finance gets an email copy.
                </div>
              </div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || saving}
                className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {uploading ? "Uploading…" : "Upload PDF"}
              </button>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleFile}
          />
        </div>

        {/* Inline editors for Type / Stage / Status — the three fields
            admins legitimately need to touch after a contract is filed.
            Free-form input via a datalist so admins can type a new value
            (auto-created in Airtable via typecast on the API side) or
            pick from values already in the dataset. */}
        <div className="grid gap-3 border-b border-slate-200 px-5 py-3 sm:grid-cols-3">
          <EditableField
            label="Contract type"
            value={c.contractType}
            options={typeOptions}
            disabled={saving}
            onCommit={(v) => onPatch({ contractType: v })}
          />
          <EditableField
            label="Stage"
            value={c.stage}
            options={stageOptions}
            disabled={saving}
            onCommit={(v) => onPatch({ stage: v })}
          />
          <EditableField
            label="Contract status"
            value={c.contractStatus}
            options={statusOptions}
            disabled={saving}
            onCommit={(v) => onPatch({ contractStatus: v })}
          />
        </div>

        {/* Body — KV grid grouped into Lifecycle, Signing, Terms, Clauses. */}
        <div className="space-y-5 px-5 py-4 text-xs">
          <Section title="Lifecycle">
            <Kv label="Signature date" value={c.signatureDate} />
            <Kv label="Effective date" value={c.effectiveDate} />
            <Kv label="Expiry date" value={c.expiryDate} />
            <Kv label="Duration" value={c.duration} />
            <Kv label="Notice period" value={c.noticePeriod} />
          </Section>

          <Section title="Signing">
            <Kv label="Signatory" value={c.signatory} sensitive />
            <Kv label="Contact details" value={c.contactDetails} sensitive multiline />
          </Section>

          <Section title="Terms">
            <Kv label="Confidentiality" value={c.confidentiality} multiline />
            <Kv label="Non-solicitation" value={c.nonSolicitation} />
            <Kv label="Intellectual property" value={c.intellectualProperty} />
            <Kv label="Exclusivity" value={c.exclusivity} />
            <Kv label="Governing law" value={c.governingLaw} />
            <Kv label="Consultant visibility" value={c.consultantVisibility} />
          </Section>

          {c.clauses ? (
            <Section title="Specific clauses / comments">
              <div className="col-span-full whitespace-pre-line text-slate-700 demo-blur">
                {c.clauses}
              </div>
            </Section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Editable lifecycle field. Renders as a labelled input backed by a
// datalist of values already in the dataset so admins get autocomplete
// without being locked into a frozen enum — if they type a brand-new
// value the API typecasts it into a fresh Airtable choice. We commit on
// blur or Enter; Escape reverts to the saved value.
function EditableField({
  label,
  value,
  options,
  disabled,
  onCommit,
}: {
  label: string;
  value: string;
  options: string[];
  disabled?: boolean;
  onCommit: (value: string) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const listId = `contract-${label.replace(/\s+/g, "-").toLowerCase()}-options`;

  function commit() {
    const next = draft.trim();
    if (next === value.trim()) return;
    void onCommit(next);
  }

  return (
    <label className="block text-xs">
      <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <input
        type="text"
        list={listId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            setDraft(value);
            (e.target as HTMLInputElement).blur();
          }
        }}
        disabled={disabled}
        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 disabled:opacity-60"
        placeholder="—"
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h3>
      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Kv({
  label,
  value,
  sensitive,
  multiline,
}: {
  label: string;
  value: string;
  sensitive?: boolean;
  multiline?: boolean;
}) {
  return (
    <div className="grid grid-cols-[10rem_minmax(0,1fr)] gap-2 sm:contents">
      <dt className="text-[11px] uppercase tracking-wide text-slate-500 sm:pt-0.5">
        {label}
      </dt>
      <dd
        className={`text-slate-800 ${sensitive ? "demo-blur" : ""} ${multiline ? "whitespace-pre-line" : ""}`}
      >
        {value || <Dash />}
      </dd>
    </div>
  );
}

// Top-of-page filter control. Splits into a labelled <input type="search">
// when renderAs === "search", otherwise a labelled <select>. Same look as
// /admin/timesheets so the two pages feel like siblings.
function Select(
  props:
    | {
        label: string;
        value: string;
        onChange: (v: string) => void;
        options: { value: string; label: string }[];
        renderAs?: undefined;
      }
    | {
        label: string;
        value: string;
        onChange: (v: string) => void;
        renderAs: "search";
        placeholder?: string;
      },
) {
  if (props.renderAs === "search") {
    return (
      <label className="block text-sm">
        <span className="block text-slate-600 mb-1">{props.label}</span>
        <input
          type="search"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder}
          className="block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
        />
      </label>
    );
  }
  return (
    <label className="block text-sm">
      <span className="block text-slate-600 mb-1">{props.label}</span>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
      >
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
