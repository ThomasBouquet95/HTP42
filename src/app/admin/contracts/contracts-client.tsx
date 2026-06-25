"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CONTRACT_SIDES,
  CONTRACT_STATUSES,
  CONTRACT_TYPES,
  computeValidity,
  type ComputedValidity,
  type ContractFieldChoices,
  type ContractRecord,
  type ContractSide,
  type ContractStatus,
  type ContractType,
} from "@/lib/airtable";

// All editable fields the PATCH route accepts. Mirrors
// ContractEditableFields in lib/airtable.ts.
type ContractPatch = {
  // Identity
  side?: ContractSide | "";
  contractType?: string;
  otherDescription?: string;
  clientRecordIds?: string[];
  projectRecordIds?: string[];
  projectCode?: string;
  memberRecordIds?: string[];
  // Signatories
  signatory1Name?: string;
  signatory1Role?: string;
  signatory1Company?: string;
  signatory2Name?: string;
  signatory2Role?: string;
  signatory2Company?: string;
  // Lifecycle
  signatureDate?: string;
  expiryDate?: string;
  stage?: string;
  contractStatus?: string;
  validity?: string;
  // Summary
  keyTerms?: string;
  // Legacy / detailed terms (collapsible)
  company?: string;
  contactType?: string;
  signatory?: string;
  contactDetails?: string;
  effectiveDate?: string;
  duration?: string;
  noticePeriod?: string;
  nonSolicitation?: string;
  confidentiality?: string;
  intellectualProperty?: string;
  exclusivity?: string;
  governingLaw?: string;
  consultantVisibility?: string;
  clauses?: string;
};

type MemberOpt = { id: string; code: string; name: string };
type ClientOpt = { id: string; code: string; name: string };
type ProjectOpt = { id: string; code: string; name: string };

type Props = {
  contracts: ContractRecord[];
  members: MemberOpt[];
  clients: ClientOpt[];
  projects: ProjectOpt[];
  fieldChoices: ContractFieldChoices;
};

type Filters = {
  search: string;
  type: "All" | string;
  side: "All" | ContractSide;
  stage: "All" | string;
  validity: "All" | ValidityBucket;
};

// Land on All by default — admins typically want the full picture and
// then filter down by side or type. (Most-recent-signature sort happens
// server-side.)
const DEFAULT_FILTERS: Filters = {
  search: "",
  type: "All",
  side: "All",
  stage: "All",
  validity: "All",
};

export function ContractsAdminClient({
  contracts: initialContracts,
  members,
  clients,
  projects,
  fieldChoices,
}: Props) {
  const router = useRouter();
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

  const clientsById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  // Save the whole draft patch from the modal. Optimistic: patch the
  // local mirror first, surface a toast, and roll back on failure. Also
  // refreshes the derived label arrays (memberCodes / clientCodes /
  // clientNames / projectCodes) so the table cells reflect the new
  // linkage without waiting for the server round-trip.
  async function saveContract(id: string, patch: ContractPatch) {
    if (Object.keys(patch).length === 0) {
      setOpenId(null);
      return;
    }
    const previous = contracts.find((c) => c.id === id);
    if (!previous) return;
    const optimistic: ContractRecord = { ...previous, ...patch };
    if (patch.memberRecordIds !== undefined) {
      optimistic.memberCodes = patch.memberRecordIds.map(
        (mid) => membersById.get(mid)?.code ?? mid,
      );
    }
    if (patch.clientRecordIds !== undefined) {
      optimistic.clientCodes = patch.clientRecordIds.map(
        (cid) => clientsById.get(cid)?.code ?? cid,
      );
      optimistic.clientNames = patch.clientRecordIds.map(
        (cid) => clientsById.get(cid)?.name ?? "",
      );
    }
    if (patch.projectRecordIds !== undefined) {
      optimistic.projectCodes = patch.projectRecordIds.map(
        (pid) => projectsById.get(pid)?.code ?? pid,
      );
    }
    setContracts((rs) => rs.map((r) => (r.id === id ? optimistic : r)));
    setSavingIds((s) => new Set(s).add(id));
    try {
      const res = await fetch(`/api/admin/contracts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Save failed (HTTP ${res.status})`);
      }
      setToast({ kind: "ok", msg: "Contract saved" });
      setOpenId(null);
      router.refresh();
    } catch (e) {
      setContracts((rs) => rs.map((r) => (r.id === id ? previous : r)));
      setToast({ kind: "error", msg: e instanceof Error ? e.message : "Save failed" });
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

  const typeOptions = useMemo(
    () => uniqueSortedValues(contracts.map((c) => c.contractType)),
    [contracts],
  );
  const stageOptions = useMemo(
    () => uniqueSortedValues(contracts.map((c) => c.stage)),
    [contracts],
  );

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return contracts.filter((c) => {
      if (filters.type !== "All" && c.contractType !== filters.type) return false;
      if (filters.side !== "All" && resolveSide(c) !== filters.side) return false;
      if (filters.stage !== "All" && c.stage !== filters.stage) return false;
      if (filters.validity !== "All") {
        const bucket = validityBucket(c.validity);
        if (bucket !== filters.validity) return false;
      }
      if (!q) return true;
      // Search hay covers every label an admin would type into the
      // box, including the canonical Side string so "client" / "network"
      // / "partner" return only the matching bucket.
      const hay = [
        resolveSide(c),
        c.side,
        c.projectCode,
        c.company,
        c.contractType,
        c.contactType,
        c.signatory,
        c.signatory1.name,
        c.signatory1.role,
        c.signatory1.company,
        c.signatory2.name,
        c.signatory2.role,
        c.signatory2.company,
        c.stage,
        c.contractStatus,
        c.validity,
        c.keyTerms,
        c.otherDescription,
        ...c.memberCodes,
        ...c.clientCodes,
        ...c.clientNames,
        ...c.projectCodes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [contracts, filters]);

  const sideCounts = useMemo(() => {
    const out: Record<ContractSide, number> = {
      Client: 0,
      "Network Member": 0,
      Partner: 0,
      Other: 0,
    };
    for (const c of contracts) out[resolveSide(c)] += 1;
    return out;
  }, [contracts]);

  const validityCounts = useMemo(() => {
    const out: Record<ValidityBucket, number> = {
      Valid: 0,
      Expired: 0,
      "N/A": 0,
    };
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
      <SideTabs
        active={filters.side}
        counts={sideCounts}
        onSelect={(b) => update("side", b)}
      />

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Select
            label="Search"
            renderAs="search"
            value={filters.search}
            onChange={(v) => update("search", v)}
            placeholder="Project, member, client, signatory…"
          />
          <Select
            label="Contract type"
            value={filters.type}
            onChange={(v) => update("type", v)}
            options={[
              { value: "All", label: "All types" },
              ...typeOptions.map((t) => ({ value: t, label: t })),
            ]}
          />
          <Select
            label="Status"
            value={filters.stage}
            onChange={(v) => update("stage", v)}
            options={[
              { value: "All", label: "All statuses" },
              ...stageOptions.map((s) => ({ value: s, label: s })),
            ]}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div className="inline-flex flex-wrap items-center rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs">
            {(
              [
                { value: "Valid", label: "Valid", count: validityCounts.Valid },
                { value: "Expired", label: "Expired", count: validityCounts.Expired },
                { value: "N/A", label: "N/A", count: validityCounts["N/A"] },
                {
                  value: "All",
                  label: "All",
                  count:
                    validityCounts.Valid +
                    validityCounts.Expired +
                    validityCounts["N/A"],
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

      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-2 py-1.5 font-medium">Side · Type</th>
              <th className="text-left px-2 py-1.5 font-medium">Counterparty</th>
              <th className="text-left px-2 py-1.5 font-medium hidden md:table-cell">Project / Member</th>
              <th className="text-left px-2 py-1.5 font-medium hidden md:table-cell">Signed</th>
              <th className="text-left px-2 py-1.5 font-medium hidden md:table-cell">Expires</th>
              <th className="text-left px-2 py-1.5 font-medium">Status</th>
              <th className="text-left px-2 py-1.5 font-medium">Validity</th>
              <th className="text-left px-2 py-1.5 font-medium">PDF</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-slate-500 py-10 text-xs">
                  No contracts match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const side = resolveSide(c);
                const flagged =
                  isCriticalType(c.contractType) &&
                  validityBucket(c.validity) === "Expired";
                const counterparty = counterpartyLabel(c);
                const projectLabel =
                  c.projectCodes.join(", ") || c.projectCode || "—";
                return (
                  <tr
                    key={c.id}
                    onClick={() => setOpenId(c.id)}
                    className={`border-t cursor-pointer align-top ${
                      flagged
                        ? "border-red-200 bg-red-50 hover:bg-red-100 ring-1 ring-inset ring-red-200"
                        : "border-slate-100 hover:bg-slate-50"
                    }`}
                    title={
                      flagged
                        ? "Expired MSA / SoW. Click to review."
                        : "Click for the full contract"
                    }
                  >
                    <td className="px-2 py-1.5">
                      <div className="flex flex-wrap items-center gap-1">
                        <SidePill side={side} />
                        {c.contractType ? <TypePill type={c.contractType} /> : null}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 demo-blur">
                      <div className="truncate max-w-[16rem]">{counterparty || "—"}</div>
                    </td>
                    <td className="px-2 py-1.5 hidden md:table-cell">
                      <div className="font-mono text-[10px] text-slate-500">
                        {projectLabel}
                      </div>
                      <div className="font-mono text-[10px] text-brand-700">
                        {c.memberCodes.join(", ") || ""}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 hidden md:table-cell whitespace-nowrap text-slate-700">
                      {c.signatureDate || <Dash />}
                    </td>
                    <td className="px-2 py-1.5 hidden md:table-cell whitespace-nowrap text-slate-700">
                      {c.expiryDate || <Dash />}
                    </td>
                    <td className="px-2 py-1.5">
                      {c.stage ? <StagePill stage={c.stage} /> : <Dash />}
                    </td>
                    <td className="px-2 py-1.5">
                      <ValidityPill validity={c.validity} />
                    </td>
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
                          Open to upload
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {openContract ? (
        <ContractDetailModal
          contract={openContract}
          saving={savingIds.has(openContract.id)}
          members={members}
          clients={clients}
          projects={projects}
          fieldChoices={fieldChoices}
          onClose={() => setOpenId(null)}
          onSave={(patch) => saveContract(openContract.id, patch)}
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uniqueSortedValues(values: string[]): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const trimmed = v.trim();
    if (trimmed) set.add(trimmed);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

// Resolve the canonical contract side. New rows carry an explicit `side`
// field; legacy rows fall back to a derivation from Contact Type so the
// page works without first backfilling everything.
function resolveSide(c: ContractRecord): ContractSide {
  if (c.side) return c.side;
  const s = c.contactType.trim().toLowerCase();
  if (s === "client") return "Client";
  if (s === "network member" || s === "consultant" || s === "subcontractor") {
    return "Network Member";
  }
  return "Other";
}

// Human-readable counterparty label that switches by Side: a Network
// Member contract shows the linked member, a Client contract shows the
// linked client name, and Partner / Other fall back to the legacy
// Company / Consultant free-form field. Without this branch a Network
// Member contract whose row also carried a stale Client link would
// surface the client name — wrong counterparty visually.
function counterpartyLabel(c: ContractRecord): string {
  const side = resolveSide(c);
  if (side === "Network Member") {
    if (c.memberCodes.length > 0) return c.memberCodes.join(", ");
    return c.company;
  }
  if (side === "Client") {
    if (c.clientNames.some(Boolean)) return c.clientNames.filter(Boolean).join(", ");
    if (c.clientCodes.length > 0) return c.clientCodes.join(", ");
    return c.company;
  }
  // Partner / Other: free-form counterparty company.
  return c.company;
}

// Validity is computed server-side now (see computeValidity in
// lib/airtable.ts). The client just buckets the value that came back.
// Three values: Valid / Expired / N/A.
export type ValidityBucket = ComputedValidity;

function validityBucket(v: string): ValidityBucket {
  const s = v.trim().toLowerCase();
  if (s === "expired") return "Expired";
  if (s === "valid") return "Valid";
  return "N/A";
}

// Mirror of the server's computeValidity so the modal updates the
// validity pill instantly as the admin edits Status / Expiry, without
// waiting for a save round-trip.
function computeValidityLocal(stage: string, expiryDate: string): ComputedValidity {
  return computeValidity(stage, expiryDate);
}

function validityExplanation(stage: string, expiryDate: string): string {
  const v = computeValidityLocal(stage, expiryDate);
  if (v === "N/A") return "Status isn't Signed yet.";
  if (v === "Expired")
    return `Signed but the expiry date ${expiryDate ? `(${expiryDate}) ` : ""}has passed.`;
  if (expiryDate) return `Signed; in force until ${expiryDate}.`;
  return "Signed; no expiry on file.";
}

function isCriticalType(contractType: string): boolean {
  const s = contractType.trim().toLowerCase();
  return s.includes("msa") || s.includes("sow");
}

// ---------------------------------------------------------------------------
// Pills (status, type, side, validity)
// ---------------------------------------------------------------------------

function SidePill({ side }: { side: ContractSide }) {
  const cls =
    side === "Client"
      ? "bg-sky-50 text-sky-700 border-sky-200"
      : side === "Network Member"
      ? "bg-violet-50 text-violet-700 border-violet-200"
      : side === "Partner"
      ? "bg-teal-50 text-teal-700 border-teal-200"
      : "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}
    >
      {side}
    </span>
  );
}

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

// ---------------------------------------------------------------------------
// Top tab strip (Client / Network Member / Partner / Other / All)
// ---------------------------------------------------------------------------

function SideTabs({
  active,
  counts,
  onSelect,
}: {
  active: "All" | ContractSide;
  counts: Record<ContractSide, number>;
  onSelect: (value: "All" | ContractSide) => void;
}) {
  const total = counts.Client + counts["Network Member"] + counts.Partner + counts.Other;
  const tabs: Array<{
    value: "All" | ContractSide;
    label: string;
    hint: string;
    count: number;
  }> = [
    { value: "All", label: "All", hint: "Every contract", count: total },
    {
      value: "Client",
      label: "Client",
      hint: "MSA across projects · SoW per project · NDA",
      count: counts.Client,
    },
    {
      value: "Network Member",
      label: "Network",
      hint: "MSA across projects · SoW per staffing · NDA",
      count: counts["Network Member"],
    },
    {
      value: "Partner",
      label: "Partner",
      hint: "Potential partners · NDA",
      count: counts.Partner,
    },
    {
      value: "Other",
      label: "Other",
      hint: "IP Co., edge cases",
      count: counts.Other,
    },
  ];
  return (
    <div className="grid gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
      {tabs.map((t) => {
        const isActive = active === t.value;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onSelect(t.value)}
            aria-pressed={isActive}
            className={`group flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left transition-all ${
              isActive
                ? "border-brand-500 bg-brand-50 ring-1 ring-brand-200"
                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            <div className="min-w-0">
              <div
                className={`text-[13px] font-semibold leading-tight ${
                  isActive ? "text-brand-800" : "text-slate-900"
                }`}
              >
                {t.label}
              </div>
              <div className="truncate text-[10px] leading-tight text-slate-500">
                {t.hint}
              </div>
            </div>
            <div
              className={`shrink-0 text-sm font-semibold tabular-nums ${
                isActive ? "text-brand-700" : "text-slate-700"
              }`}
            >
              {t.count}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active filter chips + filter Select control
// ---------------------------------------------------------------------------

function ActiveFilterChips({
  filters,
  onClear,
}: {
  filters: Filters;
  onClear: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
}) {
  const chips: { label: string; clear: () => void }[] = [];
  if (filters.side !== "All") {
    chips.push({ label: filters.side, clear: () => onClear("side", "All") });
  }
  if (filters.type !== "All") {
    chips.push({ label: filters.type, clear: () => onClear("type", "All") });
  }
  if (filters.stage !== "All") {
    chips.push({ label: filters.stage, clear: () => onClear("stage", "All") });
  }
  if (filters.validity !== "All") {
    chips.push({ label: filters.validity, clear: () => onClear("validity", "All") });
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

// ---------------------------------------------------------------------------
// Contract detail modal — draft state + Save / Cancel
// ---------------------------------------------------------------------------

// The shape the form binds against. Mirrors the editable fields plus
// the three linked-record arrays. We hold the entire draft locally and
// only PATCH the diff against the original on Save.
type DraftForm = {
  side: ContractSide | "";
  contractType: string;
  otherDescription: string;
  clientRecordIds: string[];
  projectRecordIds: string[];
  memberRecordIds: string[];
  projectCode: string;
  signatory1Name: string;
  signatory1Role: string;
  signatory1Company: string;
  signatory2Name: string;
  signatory2Role: string;
  signatory2Company: string;
  signatureDate: string;
  expiryDate: string;
  stage: string;
  contractStatus: string;
  validity: string;
  keyTerms: string;
  // Detailed terms (collapsible)
  confidentiality: string;
  nonSolicitation: string;
  intellectualProperty: string;
  exclusivity: string;
  governingLaw: string;
  noticePeriod: string;
  duration: string;
  consultantVisibility: string;
  effectiveDate: string;
  clauses: string;
  // Legacy free-text bits we surface for back-compat only
  company: string;
  contactType: string;
  signatory: string;
  contactDetails: string;
};

function draftFromContract(c: ContractRecord): DraftForm {
  return {
    side: c.side || resolveSide(c),
    contractType: c.contractType,
    otherDescription: c.otherDescription,
    clientRecordIds: c.clientRecordIds.slice(),
    projectRecordIds: c.projectRecordIds.slice(),
    memberRecordIds: c.memberRecordIds.slice(),
    projectCode: c.projectCode,
    signatory1Name: c.signatory1.name,
    signatory1Role: c.signatory1.role,
    signatory1Company: c.signatory1.company,
    signatory2Name: c.signatory2.name,
    signatory2Role: c.signatory2.role,
    signatory2Company: c.signatory2.company,
    signatureDate: c.signatureDate,
    expiryDate: c.expiryDate,
    stage: c.stage,
    contractStatus: c.contractStatus,
    validity: c.validity,
    keyTerms: c.keyTerms,
    confidentiality: c.confidentiality,
    nonSolicitation: c.nonSolicitation,
    intellectualProperty: c.intellectualProperty,
    exclusivity: c.exclusivity,
    governingLaw: c.governingLaw,
    noticePeriod: c.noticePeriod,
    duration: c.duration,
    consultantVisibility: c.consultantVisibility,
    effectiveDate: c.effectiveDate,
    clauses: c.clauses,
    company: c.company,
    contactType: c.contactType,
    signatory: c.signatory,
    contactDetails: c.contactDetails,
  };
}

// Diff the current draft against the original. Only the changed keys
// land in the PATCH payload so we never accidentally clear a sibling
// field that wasn't touched.
function diffPatch(original: DraftForm, draft: DraftForm): ContractPatch {
  const patch: ContractPatch = {};
  const stringKeys: Array<keyof DraftForm & keyof ContractPatch> = [
    "side",
    "contractType",
    "otherDescription",
    "projectCode",
    "signatory1Name",
    "signatory1Role",
    "signatory1Company",
    "signatory2Name",
    "signatory2Role",
    "signatory2Company",
    "signatureDate",
    "expiryDate",
    "stage",
    "contractStatus",
    "validity",
    "keyTerms",
    "confidentiality",
    "nonSolicitation",
    "intellectualProperty",
    "exclusivity",
    "governingLaw",
    "noticePeriod",
    "duration",
    "consultantVisibility",
    "effectiveDate",
    "clauses",
    "company",
    "contactType",
    "signatory",
    "contactDetails",
  ];
  for (const key of stringKeys) {
    if (original[key] !== draft[key]) {
      // ContractPatch's string fields are all `string | undefined`,
      // so a string value is always assignable.
      (patch as Record<string, string | string[] | undefined>)[key] =
        draft[key] as string;
    }
  }
  if (!sameArray(original.clientRecordIds, draft.clientRecordIds)) {
    patch.clientRecordIds = draft.clientRecordIds;
  }
  if (!sameArray(original.projectRecordIds, draft.projectRecordIds)) {
    patch.projectRecordIds = draft.projectRecordIds;
  }
  if (!sameArray(original.memberRecordIds, draft.memberRecordIds)) {
    patch.memberRecordIds = draft.memberRecordIds;
  }
  return patch;
}

function sameArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function ContractDetailModal({
  contract: c,
  saving,
  members,
  clients,
  projects,
  fieldChoices,
  onClose,
  onSave,
  onUpload,
}: {
  contract: ContractRecord;
  saving: boolean;
  members: MemberOpt[];
  clients: ClientOpt[];
  projects: ProjectOpt[];
  fieldChoices: ContractFieldChoices;
  onClose: () => void;
  onSave: (patch: ContractPatch) => Promise<void>;
  onUpload: (file: File) => Promise<boolean>;
}) {
  const original = useMemo(() => draftFromContract(c), [c]);
  const [draft, setDraft] = useState<DraftForm>(original);
  useEffect(() => setDraft(original), [original]);
  const [showSecondSignatory, setShowSecondSignatory] = useState<boolean>(
    () =>
      Boolean(
        c.signatory2.name || c.signatory2.role || c.signatory2.company,
      ),
  );

  // Close-with-confirm if there are unsaved changes. Escape and the
  // backdrop click both route through here so an admin doesn't lose a
  // draft by accident — same pattern as the timesheet modal.
  const patchPreview = useMemo(() => diffPatch(original, draft), [original, draft]);
  const isDirty = Object.keys(patchPreview).length > 0;
  function requestClose() {
    if (isDirty) {
      const ok = window.confirm(
        "You have unsaved changes on this contract. Discard them?",
      );
      if (!ok) return;
    }
    onClose();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty]);

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      await onUpload(file);
    } finally {
      setUploading(false);
    }
  }

  // Local update helper bound to the draft. Changing Side or Type
  // clears stale linked records that no longer apply — e.g. switching
  // from Network Member to Client should drop the member link, and
  // switching Type from SOW to MSA should drop the project link. Without
  // this, the PATCH carries old links into Airtable and the contract
  // appears "linked" on a relationship that doesn't exist.
  function set<K extends keyof DraftForm>(key: K, value: DraftForm[K]) {
    setDraft((d) => {
      const next = { ...d, [key]: value };
      if (key === "side") {
        const newSide = value as ContractSide | "";
        // Only the side that owns each link keeps its entries.
        if (newSide !== "Network Member") next.memberRecordIds = [];
        if (newSide !== "Client") next.clientRecordIds = [];
      }
      if (key === "contractType") {
        const t = String(value).toLowerCase();
        // SOW is the only type that links to a project. Anything else
        // drops the project link so admins don't accidentally tie an
        // NDA / MSA to a specific project.
        if (!t.includes("sow")) next.projectRecordIds = [];
      }
      return next;
    });
  }

  // Conditional sections based on Side + Type.
  // Per the rules:
  //   Client + MSA / NDA → Client link only
  //   Client + SOW       → Client link + Project link
  //   Network Member +
  //     MSA / NDA        → Member link only (covers every project)
  //     SOW              → Member link + Project link (one per staffing)
  //   Partner + NDA      → free-form counterparty (Company text)
  //   Other              → free-form
  const sideIsClient = draft.side === "Client";
  const sideIsNetwork = draft.side === "Network Member";
  const sideIsPartner = draft.side === "Partner";
  const typeIsSow = draft.contractType.toLowerCase().includes("sow");
  const typeIsOther = draft.contractType === "Other";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/60 px-3 py-6 sm:items-center sm:py-10"
      role="dialog"
      aria-modal="true"
      onClick={requestClose}
    >
      {/* Constrain the panel height so only the body scrolls. The
          header + PDF strip + footer stay pinned, so an admin in a long
          form can always reach Save / Cancel without scrolling the whole
          modal. max-w-4xl gives the form a touch more horizontal room
          now that some sections need three columns. */}
      <div
        className="relative flex w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200"
        style={{ maxHeight: "calc(100vh - 4rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <SidePill side={(draft.side || "Other") as ContractSide} />
              {draft.contractType ? <TypePill type={draft.contractType} /> : null}
              {draft.stage ? <StagePill stage={draft.stage} /> : null}
              <ValidityPill
                validity={computeValidityLocal(draft.stage, draft.expiryDate)}
              />
            </div>
            <h2 className="mt-1 truncate text-base font-semibold text-slate-900 demo-blur">
              {counterpartyLabel(c) || "—"}
            </h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              {c.projectCodes.length > 0 ? (
                <Link
                  href={`/admin/projects?project=${encodeURIComponent(c.projectCodes[0])}`}
                  className="font-mono text-brand-700 hover:text-brand-800 hover:underline"
                  title="Open the project"
                  onClick={(e) => e.stopPropagation()}
                >
                  {c.projectCodes.join(", ")}
                </Link>
              ) : c.projectCode ? (
                <span className="font-mono text-slate-500">{c.projectCode}</span>
              ) : null}
              {c.memberCodes.length > 0 ? (
                <span className="font-mono text-brand-700">
                  {c.memberCodes.join(", ")}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {saving ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700 ring-1 ring-brand-200"
                role="status"
                aria-live="polite"
              >
                <Spinner /> Saving…
              </span>
            ) : null}
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close"
              className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
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
        </div>

        {/* PDF actions */}
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

        {/* Form body — scrolls within the panel so the sticky footer
            and the PDF / header strips stay visible. */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 text-xs">
          {/* Identity */}
          <section className="space-y-3">
            <SectionHeader title="Identity" hint="Which side of the contract this is and what it covers." />
            <div className="space-y-3">
              <SegmentedField
                label="Side"
                value={draft.side || ""}
                options={CONTRACT_SIDES.map((s) => ({ value: s, label: s }))}
                onChange={(v) => set("side", v as ContractSide | "")}
              />
              <SegmentedField
                label="Type"
                value={CONTRACT_TYPES.includes(draft.contractType as ContractType)
                  ? draft.contractType
                  : draft.contractType
                  ? "Other"
                  : ""}
                hint={
                  draft.contractType &&
                  !CONTRACT_TYPES.includes(draft.contractType as ContractType)
                    ? `Legacy value: "${draft.contractType}". Pick one of the canonical types or set Other and describe it below.`
                    : undefined
                }
                options={CONTRACT_TYPES.map((t) => ({ value: t, label: t }))}
                onChange={(v) => set("contractType", v)}
              />
              {typeIsOther ? (
                <TextField
                  label="Describe the contract"
                  hint="A few words is enough — e.g. service agreement, framework contract, MoU."
                  value={draft.otherDescription}
                  onChange={(v) => set("otherDescription", v)}
                  placeholder="Service agreement, MoU, framework, …"
                />
              ) : null}

              {sideIsClient ? (
                <ClientPicker
                  label="Client"
                  hint={
                    typeIsSow
                      ? "SOW covers one client + one project."
                      : "MSA / NDA covers a client across all projects."
                  }
                  clients={clients}
                  selectedIds={draft.clientRecordIds}
                  onChange={(ids) => set("clientRecordIds", ids)}
                />
              ) : null}

              {sideIsNetwork ? (
                <MemberPicker
                  label="Network member"
                  hint={
                    typeIsSow
                      ? "SOW covers one member + one project (one staffing)."
                      : "MSA / NDA covers a network member across all projects."
                  }
                  members={members}
                  selectedIds={draft.memberRecordIds}
                  onChange={(ids) => set("memberRecordIds", ids)}
                />
              ) : null}

              {sideIsPartner ? (
                <TextField
                  label="Partner (company name)"
                  hint="No Airtable link for partners yet — type the company name."
                  value={draft.company}
                  onChange={(v) => set("company", v)}
                  placeholder="Acme Health"
                  sensitive
                />
              ) : null}

              {/* SOW always carries a Project link, on both Client and
                  Network sides. */}
              {typeIsSow ? (
                <ProjectPicker
                  label="Project"
                  hint={
                    sideIsClient
                      ? "Which project this SOW covers."
                      : sideIsNetwork
                      ? "Which project this SOW staffs the member onto."
                      : "Which project this SOW covers."
                  }
                  projects={projects}
                  selectedIds={draft.projectRecordIds}
                  onChange={(ids) => set("projectRecordIds", ids)}
                />
              ) : null}

              {/* Side = Other → free-form counterparty company. */}
              {!sideIsClient && !sideIsNetwork && !sideIsPartner ? (
                <TextField
                  label="Counterparty (company name)"
                  value={draft.company}
                  onChange={(v) => set("company", v)}
                  placeholder="—"
                  sensitive
                />
              ) : null}
            </div>
          </section>

          {/* Lifecycle: Status first (the actionable thing), then dates,
              then computed validity. Contract Status is gone — we
              collapsed it into Status. */}
          <section className="space-y-3 border-t border-slate-100 pt-4">
            <SectionHeader
              title="Lifecycle"
              hint="Status drives validity. Signed + (no expiry or future expiry) → Valid; signed + past expiry → Expired; everything else → N/A."
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <SegmentedField
                label="Status"
                value={
                  CONTRACT_STATUSES.includes(draft.stage as ContractStatus)
                    ? draft.stage
                    : draft.stage
                    ? ""
                    : ""
                }
                hint={
                  draft.stage &&
                  !CONTRACT_STATUSES.includes(draft.stage as ContractStatus)
                    ? `Legacy value: "${draft.stage}". Pick a canonical status to keep the table tidy.`
                    : undefined
                }
                options={CONTRACT_STATUSES.map((s) => ({ value: s, label: s }))}
                onChange={(v) => set("stage", v)}
              />
              <DateField
                label="Signature date"
                value={draft.signatureDate}
                onChange={(v) => set("signatureDate", v)}
              />
              <DateField
                label="Expiry date"
                value={draft.expiryDate}
                onChange={(v) => set("expiryDate", v)}
              />
              <div className="sm:col-span-3">
                <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Validity (computed)
                </span>
                <div
                  className="mt-1 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600"
                  title="Computed from Status + Expiry Date on every page load. Not manually editable."
                >
                  <ValidityPill
                    validity={computeValidityLocal(draft.stage, draft.expiryDate)}
                  />
                  <span>
                    {validityExplanation(draft.stage, draft.expiryDate)}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Signatories */}
          <section className="space-y-3 border-t border-slate-100 pt-4">
            <SectionHeader title="Signatories" hint="Who signed the contract. Add a second only if two parties signed." />
            <SignatoryRow
              index={1}
              name={draft.signatory1Name}
              role={draft.signatory1Role}
              company={draft.signatory1Company}
              onChange={(patch) =>
                setDraft((d) => ({
                  ...d,
                  signatory1Name: patch.name ?? d.signatory1Name,
                  signatory1Role: patch.role ?? d.signatory1Role,
                  signatory1Company: patch.company ?? d.signatory1Company,
                }))
              }
            />
            {showSecondSignatory ? (
              <SignatoryRow
                index={2}
                name={draft.signatory2Name}
                role={draft.signatory2Role}
                company={draft.signatory2Company}
                onChange={(patch) =>
                  setDraft((d) => ({
                    ...d,
                    signatory2Name: patch.name ?? d.signatory2Name,
                    signatory2Role: patch.role ?? d.signatory2Role,
                    signatory2Company: patch.company ?? d.signatory2Company,
                  }))
                }
                onRemove={() => {
                  setShowSecondSignatory(false);
                  setDraft((d) => ({
                    ...d,
                    signatory2Name: "",
                    signatory2Role: "",
                    signatory2Company: "",
                  }));
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowSecondSignatory(true)}
                className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                + Add a second signatory
              </button>
            )}
          </section>

          {/* Key terms */}
          <section className="space-y-3 border-t border-slate-100 pt-4">
            <SectionHeader
              title="Key terms"
              hint="One bullet per line. Press Enter to start a new bullet."
            />
            <BulletTextarea
              value={draft.keyTerms}
              onChange={(v) => set("keyTerms", v)}
              rows={8}
              placeholder={
                "• 12-month renewable term\n• Confidentiality 3 years\n• IP assigned to HTP42"
              }
            />
          </section>

        </div>

        {/* Footer: Cancel / Save */}
        <div className="flex items-center justify-between gap-3 rounded-b-2xl border-t border-slate-200 bg-slate-50 px-5 py-3">
          <div className="text-[11px] text-slate-500">
            {isDirty
              ? `${Object.keys(patchPreview).length} unsaved change${
                  Object.keys(patchPreview).length === 1 ? "" : "s"
                }`
              : "No changes yet."}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={requestClose}
              disabled={saving}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSave(patchPreview)}
              disabled={saving || !isDirty}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form pieces used inside the modal
// ---------------------------------------------------------------------------

// Textarea that auto-prefills "• " on the first keystroke and inserts
// "\n• " when the admin hits Enter. Backspace at the start of a bullet
// removes the marker so the bullet collapses naturally. Pasting multi-
// line text re-bullets every non-empty line so a quick paste from a
// Word doc lands tidy.
function BulletTextarea({
  value,
  onChange,
  rows = 6,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const BULLET = "• ";

  const setCaret = (pos: number) => {
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.selectionStart = el.selectionEnd = pos;
    });
  };

  const handleFocus = () => {
    if (value.length === 0) {
      onChange(BULLET);
      setCaret(BULLET.length);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const v = el.value;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const insert = "\n" + BULLET;
      const next = v.slice(0, start) + insert + v.slice(end);
      onChange(next);
      setCaret(start + insert.length);
      return;
    }
    if (e.key === "Backspace" && start === end) {
      // If the caret sits right after a "• " marker that opens a line,
      // remove the whole marker in one keystroke instead of one space at
      // a time, so deleting an unwanted bullet feels snappy.
      const lineStart = v.lastIndexOf("\n", start - 1) + 1;
      const prefix = v.slice(lineStart, start);
      if (prefix === BULLET) {
        e.preventDefault();
        const next = v.slice(0, lineStart) + v.slice(start);
        onChange(next);
        setCaret(lineStart);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\n")) return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const v = el.value;
    // Re-bullet each non-empty line of the pasted block; the line we're
    // pasting into gets the first chunk appended so the existing bullet
    // is preserved.
    const lines = text.split(/\r?\n/);
    const bulleted = lines
      .map((line, i) => {
        const t = line.trim();
        if (!t) return "";
        if (i === 0) return t;
        return BULLET + t;
      })
      .filter((l, i) => i === 0 || l.length > 0)
      .join("\n");
    const next = v.slice(0, start) + bulleted + v.slice(end);
    onChange(next);
    setCaret(start + bulleted.length);
  };

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      rows={rows}
      placeholder={placeholder}
      className="block w-full resize-y rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs leading-snug focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 whitespace-pre-line"
    />
  );
}

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h3>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function SegmentedField({
  label,
  value,
  options,
  hint,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  hint?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-label={label}
        className="mt-1 inline-flex flex-wrap items-center rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs"
      >
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.value)}
              className={`rounded-md px-3 py-1 font-medium transition-colors ${
                active
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {hint ? <p className="mt-1 text-[11px] text-amber-700">{hint}</p> : null}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  sensitive,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  sensitive?: boolean;
}) {
  return (
    <label className="block text-xs">
      <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 ${
          sensitive ? "demo-blur" : ""
        }`}
      />
      {hint ? <p className="mt-1 text-[11px] text-slate-500">{hint}</p> : null}
    </label>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  span,
  sensitive,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  span?: 1 | 2;
  sensitive?: boolean;
}) {
  return (
    <label className={`block text-xs ${span === 2 ? "sm:col-span-2" : ""}`}>
      <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className={`mt-1 block w-full resize-y rounded-md border border-slate-300 bg-white px-2 py-1 text-xs leading-snug focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 whitespace-pre-line ${
          sensitive ? "demo-blur" : ""
        }`}
      />
    </label>
  );
}

// ComboboxField is the workhorse for singleSelect-backed fields. Renders
// a labelled input + datalist of the FULL Airtable choice list with a
// trailing chevron so admins know there's a dropdown. Typing a brand-new
// value works — Airtable creates the choice on save via typecast.
function ComboboxField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const hasOptions = options.length > 0;
  const listId = `combo-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <label className="block text-xs">
      <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
        {hasOptions ? (
          <span className="ml-1 font-normal normal-case tracking-normal text-slate-400">
            · {options.length} option{options.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </span>
      <span className="relative mt-1 block">
        <input
          type="text"
          list={hasOptions ? listId : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={hasOptions ? "Pick or type a new value…" : "Type a value…"}
          className={`block w-full rounded-md border border-slate-300 bg-white px-2 ${
            hasOptions ? "pr-7" : ""
          } py-1 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600`}
        />
        {hasOptions ? (
          <span
            aria-hidden
            className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400"
          >
            ▾
          </span>
        ) : null}
        {hasOptions ? (
          <datalist id={listId}>
            {options.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        ) : null}
      </span>
    </label>
  );
}

// DateField is a free-form date input. The Airtable dates are NOT real
// date fields (they're text / singleSelect that holds anything from
// "15/12/2025" to "MSA: Indefinite – SoW: …"), so we render a plain
// text input. Could upgrade to <input type="date"> later once the data
// is normalized.
// DateField upgrades to a native <input type="date"> when the stored
// value parses cleanly to ISO yyyy-mm-dd (or dd/mm/yyyy / dd.mm.yyyy).
// Falls back to a free-form text input + a small "use a date picker"
// toggle for legacy strings like "MSA: Indefinite – SoW: …" that admins
// still need to read and write. Both modes commit on every change so
// the draft stays in sync.
function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const iso = toIsoDate(value);
  // Mode tracks user intent — if the stored value happens to be a date,
  // start in "picker" mode; if it's free-form prose, start in "text".
  // Admin can flip via the tiny inline button regardless.
  const [mode, setMode] = useState<"picker" | "text">(iso ? "picker" : "text");
  useEffect(() => {
    setMode(toIsoDate(value) ? "picker" : "text");
  }, [value]);

  return (
    <label className="block text-xs">
      <span className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-slate-500">
        <span>{label}</span>
        <button
          type="button"
          onClick={() => setMode((m) => (m === "picker" ? "text" : "picker"))}
          className="ml-2 text-[10px] font-normal normal-case tracking-normal text-slate-400 hover:text-slate-700"
          title="Switch between date picker and free-text input"
        >
          {mode === "picker" ? "free text" : "use picker"}
        </button>
      </span>
      {mode === "picker" ? (
        <input
          type="date"
          value={iso ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. 15/12/2025 or Q2 2026"
          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
        />
      )}
    </label>
  );
}

// Best-effort parse of the messy historical date strings into ISO.
// Handles dd/mm/yyyy, dd.mm.yyyy, dd-mm-yyyy, yyyy-mm-dd (+ 2-digit
// years). Returns null when the string is something Airtable admins
// invented like "Late May 2026" — the field then falls back to text.
function toIsoDate(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!m) return null;
  let [, d, mo, y] = m;
  if (y.length === 2) y = String(2000 + Number(y));
  const dd = String(Number(d)).padStart(2, "0");
  const mm = String(Number(mo)).padStart(2, "0");
  if (Number(dd) < 1 || Number(dd) > 31) return null;
  if (Number(mm) < 1 || Number(mm) > 12) return null;
  return `${y}-${mm}-${dd}`;
}

function SignatoryRow({
  index,
  name,
  role,
  company,
  onChange,
  onRemove,
}: {
  index: 1 | 2;
  name: string;
  role: string;
  company: string;
  onChange: (patch: Partial<{ name: string; role: string; company: string }>) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Signatory {index}
        </span>
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="text-[11px] text-slate-500 hover:text-red-600"
          >
            Remove
          </button>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <TextField
          label="Name"
          value={name}
          onChange={(v) => onChange({ name: v })}
          sensitive
        />
        <TextField
          label="Role"
          value={role}
          onChange={(v) => onChange({ role: v })}
        />
        <TextField
          label="Company"
          value={company}
          onChange={(v) => onChange({ company: v })}
          sensitive
        />
      </div>
    </div>
  );
}

function ClientPicker({
  label,
  hint,
  clients,
  selectedIds,
  onChange,
}: {
  label: string;
  hint?: string;
  clients: ClientOpt[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const byId = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const remaining = useMemo(
    () =>
      clients
        .filter((c) => !selectedIds.includes(c.id))
        .sort((a, b) => a.code.localeCompare(b.code)),
    [clients, selectedIds],
  );
  return (
    <ChipPicker
      label={label}
      hint={hint}
      selected={selectedIds.map((id) => ({
        id,
        label: byId.get(id)?.code ?? id,
        title: byId.get(id)?.name,
      }))}
      addPlaceholder="+ Add client…"
      remainingOptions={remaining.map((c) => ({
        id: c.id,
        label: `${c.code} · ${c.name}`,
      }))}
      onAdd={(id) => onChange([...selectedIds, id])}
      onRemove={(id) => onChange(selectedIds.filter((s) => s !== id))}
      max={5}
    />
  );
}

function ProjectPicker({
  label,
  hint,
  projects,
  selectedIds,
  onChange,
}: {
  label: string;
  hint?: string;
  projects: ProjectOpt[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const remaining = useMemo(
    () =>
      projects
        .filter((p) => !selectedIds.includes(p.id))
        .sort((a, b) => a.code.localeCompare(b.code)),
    [projects, selectedIds],
  );
  return (
    <ChipPicker
      label={label}
      hint={hint}
      selected={selectedIds.map((id) => ({
        id,
        label: byId.get(id)?.code ?? id,
        title: byId.get(id)?.name,
      }))}
      addPlaceholder="+ Add project…"
      remainingOptions={remaining.map((p) => ({
        id: p.id,
        label: `${p.code} · ${p.name}`,
      }))}
      onAdd={(id) => onChange([...selectedIds, id])}
      onRemove={(id) => onChange(selectedIds.filter((s) => s !== id))}
      max={10}
    />
  );
}

function MemberPicker({
  label,
  hint,
  members,
  selectedIds,
  onChange,
}: {
  label: string;
  hint?: string;
  members: MemberOpt[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const remaining = useMemo(
    () =>
      members
        .filter((m) => !selectedIds.includes(m.id))
        .sort((a, b) => a.code.localeCompare(b.code)),
    [members, selectedIds],
  );
  return (
    <ChipPicker
      label={label}
      hint={hint}
      selected={selectedIds.map((id) => ({
        id,
        label: byId.get(id)?.code ?? id,
        title: byId.get(id)?.name,
      }))}
      addPlaceholder="+ Add member…"
      remainingOptions={remaining.map((m) => ({
        id: m.id,
        label: `${m.code} · ${m.name}`,
      }))}
      onAdd={(id) => onChange([...selectedIds, id])}
      onRemove={(id) => onChange(selectedIds.filter((s) => s !== id))}
      max={10}
    />
  );
}

// Shared chip-picker for the three multi-link fields. Selected items
// render as removable pills, with a dropdown of the unselected options
// on the right-hand side. Capped at `max` to match the API guard.
function ChipPicker({
  label,
  hint,
  selected,
  remainingOptions,
  addPlaceholder,
  onAdd,
  onRemove,
  max,
}: {
  label: string;
  hint?: string;
  selected: Array<{ id: string; label: string; title?: string }>;
  remainingOptions: Array<{ id: string; label: string }>;
  addPlaceholder: string;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  max: number;
}) {
  return (
    <label className="block text-xs">
      <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <div className="mt-1 flex min-h-[2.25rem] flex-wrap items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1">
        {selected.length === 0 ? (
          <span className="text-[11px] text-slate-400">No selection.</span>
        ) : (
          selected.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-800"
              title={s.title}
            >
              {s.label}
              <button
                type="button"
                onClick={() => onRemove(s.id)}
                aria-label={`Remove ${s.label}`}
                className="text-brand-600 hover:text-brand-900"
              >
                ×
              </button>
            </span>
          ))
        )}
        <select
          value=""
          disabled={selected.length >= max || remainingOptions.length === 0}
          onChange={(e) => {
            const next = e.target.value;
            e.target.value = "";
            if (next) onAdd(next);
          }}
          className="ml-auto rounded-md border border-transparent bg-transparent text-[11px] text-slate-500 hover:text-slate-800 focus:border-slate-300 focus:outline-none disabled:opacity-50"
        >
          <option value="">
            {selected.length >= max ? "Max reached" : addPlaceholder}
          </option>
          {remainingOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {hint ? <p className="mt-1 text-[11px] text-slate-500">{hint}</p> : null}
    </label>
  );
}

function Spinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3 w-3 animate-spin"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
    </svg>
  );
}
