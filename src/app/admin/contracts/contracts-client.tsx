"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DownloadChip } from "@/components/download-chip";
import { DateField, formatFriendlyDate } from "@/components/date-picker";
import { SearchInput } from "@/components/search-input";
import { Button, ButtonLink } from "@/components/form-controls";
import { FilterBar, FilterMultiSelect, SegmentedTabs } from "@/components/filters";
import { EditIcon, IconButton } from "@/components/admin-icons";
import {
  CONTRACT_SIDES,
  CONTRACT_STATUSES,
  CONTRACT_TYPES,
  computeValidity,
  type ComputedValidity,
  type ContractRecord,
  type ContractSide,
  type ContractStatus,
  type ContractType,
  type ProjectStatus,
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
  signatory1Date?: string;
  signatory2Date?: string;
  signatureDate?: string;
  expiryDate?: string;
  stage?: string;
  // Summary + notes
  keyTerms?: string;
  comment?: string;
};

type MemberOpt = { id: string; code: string; name: string };
type ClientOpt = { id: string; code: string; name: string };
type ProjectOpt = {
  id: string;
  code: string;
  name: string;
  status?: ProjectStatus | "";
  clientRecordIds?: string[];
};
type StaffingOpt = {
  id: string;
  projectCode: string;
  memberRecordIds: string[];
};

type Props = {
  contracts: ContractRecord[];
  members: MemberOpt[];
  clients: ClientOpt[];
  projects: ProjectOpt[];
  staffings: StaffingOpt[];
  // "list" = the contracts table (default, /admin/contracts).
  // "cockpit" = the R/A/G overview dashboard (/admin/legal).
  mode?: "list" | "cockpit";
};

type Filters = {
  search: string;
  // Multi-select list filters: empty array = no filter (show all).
  type: string[];
  side: "All" | ContractSide;
  stage: string[];
  validity: "All" | ValidityBucket;
  // Project record ids. Empty = no filter. A picked project matches its
  // directly-linked contracts (SOWs) plus the indirectly-related
  // NDAs/MSAs for the project's client and staffed members.
  project: string[];
};

// Land on the full picture by default — admins typically want everything
// and then filter down by side or type. (Most-recent-signature sort
// happens server-side.)
const DEFAULT_FILTERS: Filters = {
  search: "",
  type: [],
  side: "All",
  stage: [],
  validity: "All",
  project: [],
};

export function ContractsAdminClient({
  contracts: initialContracts,
  members,
  clients,
  projects,
  staffings,
  mode = "list",
}: Props) {
  const router = useRouter();
  const [contracts, setContracts] = useState<ContractRecord[]>(initialContracts);
  useEffect(() => setContracts(initialContracts), [initialContracts]);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [openId, setOpenId] = useState<string | null>(null);
  // The Legal cockpit links here as /admin/contracts?open=<id>; open
  // that contract's modal on arrival.
  const searchParams = useSearchParams();
  useEffect(() => {
    const id = searchParams.get("open");
    if (id) setOpenId(id);
  }, [searchParams]);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  // Rows whose inline detail panel is expanded, so an admin can read every
  // field of a contract without opening the edit modal.
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
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
      setToast({ kind: "ok", msg: "PDF uploaded, notification sent" });
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

  // Hard-delete a contract row. Confirms client-side because Airtable's
  // own revision history is the only undo. Optimistic so the row
  // disappears immediately; restored on failure.
  async function deleteContractById(id: string): Promise<void> {
    const previous = contracts.find((c) => c.id === id);
    if (!previous) return;
    setContracts((rs) => rs.filter((r) => r.id !== id));
    setOpenId(null);
    setSavingIds((s) => new Set(s).add(id));
    try {
      const res = await fetch(`/api/admin/contracts/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Delete failed (HTTP ${res.status})`);
      }
      setToast({ kind: "ok", msg: "Contract deleted" });
      router.refresh();
    } catch (e) {
      setContracts((rs) => [previous, ...rs.filter((r) => r.id !== id)]);
      setToast({ kind: "error", msg: e instanceof Error ? e.message : "Delete failed" });
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
  // Ongoing projects first in the dropdown, then by code — mirrors the
  // Overview ordering so the two views feel consistent.
  const projectFilterOptions = useMemo(() => {
    const rank: Record<string, number> = {
      "In Progress": 0,
      "Not Started": 1,
      Planned: 2,
      "On Hold": 3,
      "": 4,
      Completed: 5,
    };
    return [...projects]
      .sort((a, b) => {
        const ra = rank[a.status ?? ""] ?? 4;
        const rb = rank[b.status ?? ""] ?? 4;
        if (ra !== rb) return ra - rb;
        return a.code.localeCompare(b.code);
      })
      .map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` }));
  }, [projects]);

  // For each project, the set of contract ids "relevant" to it:
  //   - direct: any contract linked to the project (the SOWs, both
  //     client and network side);
  //   - indirect, client side: the project's client's NDAs + MSAs;
  //   - indirect, network side: the MSAs of every member staffed on the
  //     project.
  // The List "Project" filter uses this so picking a project surfaces
  // the full contractual context, not just the SOW.
  const projectContractIds = useMemo(() => {
    // project code -> set of staffed member record ids
    const membersByProjectCode = new Map<string, Set<string>>();
    for (const s of staffings) {
      if (!s.projectCode) continue;
      const set = membersByProjectCode.get(s.projectCode) ?? new Set<string>();
      for (const id of s.memberRecordIds) set.add(id);
      membersByProjectCode.set(s.projectCode, set);
    }
    const out = new Map<string, Set<string>>();
    for (const p of projects) {
      const clientIds = new Set(p.clientRecordIds ?? []);
      const memberIds = membersByProjectCode.get(p.code) ?? new Set<string>();
      const ids = new Set<string>();
      for (const c of contracts) {
        const type = c.contractType.trim().toUpperCase();
        // Direct project link (SOWs live here).
        if (c.projectRecordIds.includes(p.id)) {
          ids.add(c.id);
          continue;
        }
        // Indirect: the client's NDA / MSA.
        if (
          c.side === "Client" &&
          (type === "NDA" || type === "MSA") &&
          c.clientRecordIds.some((id) => clientIds.has(id))
        ) {
          ids.add(c.id);
          continue;
        }
        // Indirect: a staffed member's MSA.
        if (
          c.side === "Network Member" &&
          type === "MSA" &&
          c.memberRecordIds.some((id) => memberIds.has(id))
        ) {
          ids.add(c.id);
        }
      }
      out.set(p.id, ids);
    }
    return out;
  }, [contracts, projects, staffings]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    // Union of the relevant-contract id sets for every picked project.
    const projectIdSets =
      filters.project.length > 0
        ? filters.project.map(
            (pid) => projectContractIds.get(pid) ?? new Set<string>(),
          )
        : null;
    return contracts.filter((c) => {
      if (filters.type.length > 0 && !filters.type.includes(c.contractType)) return false;
      if (filters.side !== "All" && resolveSide(c) !== filters.side) return false;
      if (filters.stage.length > 0 && !filters.stage.includes(c.stage)) return false;
      if (projectIdSets && !projectIdSets.some((set) => set.has(c.id))) return false;
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
        c.contractType,
        c.signatory1.name,
        c.signatory1.role,
        c.signatory1.company,
        c.signatory2.name,
        c.signatory2.role,
        c.signatory2.company,
        c.stage,
        c.validity,
        c.keyTerms,
        c.comment,
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
  }, [contracts, filters, projectContractIds]);

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
      "Expiry Missing": 0,
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

  const [newOpen, setNewOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  async function createNewContract(prefill: Partial<ContractPatch>): Promise<string | null> {
    setCreating(true);
    try {
      const res = await fetch("/api/admin/contracts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(prefill ?? {}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        contract?: ContractRecord;
        error?: string;
      };
      if (!res.ok || !data.contract)
        throw new Error(data.error ?? `Create failed (HTTP ${res.status})`);
      setContracts((rs) => [data.contract as ContractRecord, ...rs]);
      setNewOpen(false);
      setOpenId(data.contract.id);
      setToast({ kind: "ok", msg: "New contract created. Review and save." });
      router.refresh();
      return data.contract.id;
    } catch (e) {
      setToast({ kind: "error", msg: e instanceof Error ? e.message : "Create failed" });
      return null;
    } finally {
      setCreating(false);
    }
  }

  // Cockpit mode (the Legal "Cockpit" sub-page) renders the R/A/G
  // overview. Clicking a pill jumps to the contracts list with the
  // matching contract opened via ?open=<id>.
  if (mode === "cockpit") {
    return (
      <OverviewView
        contracts={contracts}
        members={members}
        clients={clients}
        projects={projects}
        staffings={staffings}
        onOpenContract={(id) =>
          router.push(`/admin/contracts?open=${encodeURIComponent(id)}`)
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {(
        <>
      <SideTabs
        active={filters.side}
        counts={sideCounts}
        onSelect={(b) => update("side", b)}
      />

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <FilterBar>
          <SearchInput
            value={filters.search}
            onChange={(v) => update("search", v)}
            placeholder="Project, member, client, signatory…"
            ariaLabel="Search contracts"
            className="w-full sm:w-64"
          />
          <FilterMultiSelect
            label="Project"
            selected={filters.project}
            onChange={(next) => update("project", next)}
            options={projectFilterOptions.map((p) => ({ value: p.id, label: p.label }))}
          />
          <FilterMultiSelect
            label="Contract type"
            selected={filters.type}
            onChange={(next) => update("type", next)}
            options={typeOptions.map((t) => ({ value: t, label: t }))}
          />
          <FilterMultiSelect
            label="Status"
            selected={filters.stage}
            onChange={(next) => update("stage", next)}
            options={stageOptions.map((s) => ({ value: s, label: s }))}
          />
        </FilterBar>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <SegmentedTabs
            ariaLabel="Validity"
            value={filters.validity}
            onChange={(v) => update("validity", v)}
            options={([
              { value: "Valid", label: "Valid", count: validityCounts.Valid },
              { value: "Expiry Missing", label: "Expiry missing", count: validityCounts["Expiry Missing"] },
              { value: "Expired", label: "Expired", count: validityCounts.Expired },
              { value: "N/A", label: "N/A", count: validityCounts["N/A"] },
              {
                value: "All",
                label: "All",
                count:
                  validityCounts.Valid +
                  validityCounts["Expiry Missing"] +
                  validityCounts.Expired +
                  validityCounts["N/A"],
              },
            ] as const).map((tab) => ({
              value: tab.value,
              label: tab.label,
              badge: (
                <span className="text-[10px] tabular-nums text-slate-400">{tab.count}</span>
              ),
            }))}
          />

          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>
              {filtered.length} contract{filtered.length === 1 ? "" : "s"}
            </span>
            <ActiveFilterChips
              filters={filters}
              onClear={update}
              projectLabel={(id) =>
                projects.find((p) => p.id === id)?.code ?? "Project"
              }
            />
            <Button tone="secondary" size="sm" onClick={() => setFilters(DEFAULT_FILTERS)}>
              Reset
            </Button>
            <Button tone="primary" size="sm" onClick={() => setNewOpen(true)}>
              + New contract
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full table-fixed text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-6 px-1 py-1.5" />
              <th className="px-2 py-1.5 font-medium text-center">Side</th>
              <th className="px-2 py-1.5 font-medium text-center">Type</th>
              <th className="text-left px-2 py-1.5 font-medium">Counterparty</th>
              <th className="text-left px-2 py-1.5 font-medium whitespace-nowrap">Signed</th>
              <th className="text-left px-2 py-1.5 font-medium whitespace-nowrap">Expires</th>
              <th className="px-2 py-1.5 font-medium text-center">Status</th>
              <th className="px-2 py-1.5 font-medium text-center">Validity</th>
              <th className="text-center px-2 py-1.5 font-medium">PDF</th>
              <th className="text-center px-2 py-1.5 font-medium">Edit</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center text-slate-500 py-10">
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
                const open = expandedRows.has(c.id);
                return (
                  <Fragment key={c.id}>
                  <tr
                    aria-expanded={open}
                    onClick={() => toggleRow(c.id)}
                    className={`border-t align-middle cursor-pointer ${
                      flagged
                        ? "border-red-200 bg-red-50 ring-1 ring-inset ring-red-200"
                        : "border-slate-100 hover:bg-slate-50"
                    }`}
                    title={flagged ? "Expired MSA / SoW. Review the row." : "Click to expand"}
                  >
                    <td
                      className="px-1 py-1.5 text-center cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleRow(c.id);
                      }}
                    >
                      <svg
                        viewBox="0 0 16 16"
                        className={`inline h-3 w-3 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        aria-hidden
                      >
                        <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <SidePill side={side} />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {c.contractType ? <TypePill type={c.contractType} /> : <Dash />}
                    </td>
                    <td className="px-2 py-1.5 demo-blur">
                      <div className="truncate">{counterparty || <Dash />}</div>
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-slate-700">
                      {formatFriendlyDate(c.signatureDate) || <Dash />}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-slate-700">
                      {formatFriendlyDate(c.expiryDate) || <Dash />}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {c.stage ? <StagePill stage={c.stage} /> : <Dash />}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <ValidityPill validity={c.validity} />
                    </td>
                    <td className="px-2 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <span className="inline-flex justify-center">
                        <DownloadChip
                          url={c.pdf?.url}
                          title={`Open ${c.pdf?.filename || "PDF"}`}
                          emptyTitle="No PDF on file"
                        />
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <span className="inline-flex justify-center">
                        <IconButton onClick={() => setOpenId(c.id)} title="Edit contract">
                          <EditIcon />
                        </IconButton>
                      </span>
                    </td>
                  </tr>
                  {open ? (
                    <tr className="border-t border-slate-100 bg-slate-50/60">
                      <td />
                      <td colSpan={9} className="px-3 py-3">
                        <ContractDetails c={c} />
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
        </>
      )}

      {openContract ? (
        <ContractDetailModal
          contract={openContract}
          saving={savingIds.has(openContract.id)}
          members={members}
          clients={clients}
          projects={projects}
          onClose={() => setOpenId(null)}
          onSave={(patch) => saveContract(openContract.id, patch)}
          onUpload={(file) => uploadPdf(openContract.id, file)}
          onDelete={() => deleteContractById(openContract.id)}
        />
      ) : null}

      {newOpen ? (
        <NewContractDialog
          busy={creating}
          onClose={() => setNewOpen(false)}
          onCreate={createNewContract}
          onUploadPdf={uploadPdf}
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
// field; legacy rows without it fall through to "Other" so they still
// render somewhere instead of disappearing.
function resolveSide(c: ContractRecord): ContractSide {
  return c.side || "Other";
}

// Human-readable counterparty label that switches by Side: a Network
// Member contract shows the linked member, a Client contract shows the
// linked client name, and Partner / Other fall back to whichever
// signatory company we have on file.
function counterpartyLabel(c: ContractRecord): string {
  const side = resolveSide(c);
  const sigCompany = c.signatory1.company || c.signatory2.company;
  if (side === "Network Member") {
    if (c.memberCodes.length > 0) return c.memberCodes.join(", ");
    return sigCompany;
  }
  if (side === "Client") {
    if (c.clientNames.some(Boolean)) return c.clientNames.filter(Boolean).join(", ");
    if (c.clientCodes.length > 0) return c.clientCodes.join(", ");
    return sigCompany;
  }
  return sigCompany;
}

// Validity is computed server-side now (see computeValidity in
// lib/airtable.ts). The client just buckets the value that came back.
// Four values: Valid / Expired / Expiry Missing / N/A.
export type ValidityBucket = ComputedValidity;

function validityBucket(v: string): ValidityBucket {
  const s = v.trim().toLowerCase();
  if (s === "expired") return "Expired";
  if (s === "valid") return "Valid";
  if (s === "expiry missing") return "Expiry Missing";
  return "N/A";
}

// Mirror of the server's computeValidity so the modal updates the
// validity pill instantly as the admin edits Status / Expiry, without
// waiting for a save round-trip.
function computeValidityLocal(stage: string, expiryDate: string): ComputedValidity {
  return computeValidity(stage, expiryDate);
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
      : bucket === "Expiry Missing"
      ? "bg-orange-50 text-orange-700 border-orange-200"
      : "bg-slate-100 text-slate-600 border-slate-200";
  const label = bucket === "Expiry Missing" ? "Expiry missing" : bucket;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}
      title={validity}
    >
      {label}
    </span>
  );
}

// Red / amber / green health indicator for a contract slot (client ×
// NDA, project × SOW, etc.). Rendered by RagPill.
type Rag = "green" | "amber" | "red";

// Status of a required contract slot, resolved from whatever contracts
// fill it. Labels describe the STATE (not the contract type, which is
// already the column header):
//   green  · "Valid"        — a signed, in-force contract WITH its PDF
//   amber  · "Doc missing"  — signed and in-force, but no PDF attached
//   amber  · "In progress"  — exists but not yet signed (draft / pending)
//   red    · "Expired"      — the only contracts are past their expiry
//   red    · "Missing"      — no contract at all
// `open` jumps to that contract in the List view (undefined when there
// is nothing to open, i.e. the Missing case).
type SlotStatus = { rag: Rag; label: string; open?: () => void };

function slotStatus(
  contracts: ContractRecord[],
  onOpen: (id: string) => void,
): SlotStatus {
  if (contracts.length === 0) return { rag: "red", label: "Missing" };
  const inForce = (c: ContractRecord) => {
    const b = validityBucket(c.validity);
    return b === "Valid" || b === "Expiry Missing";
  };
  const validWithDoc = contracts.find((c) => inForce(c) && c.pdf?.url);
  if (validWithDoc)
    return { rag: "green", label: "Valid", open: () => onOpen(validWithDoc.id) };
  const valid = contracts.find((c) => inForce(c));
  if (valid)
    return { rag: "amber", label: "Doc missing", open: () => onOpen(valid.id) };
  const pending = contracts.find(
    (c) => validityBucket(c.validity) !== "Expired",
  );
  if (pending)
    return { rag: "amber", label: "In progress", open: () => onOpen(pending.id) };
  return { rag: "red", label: "Expired", open: () => onOpen(contracts[0].id) };
}

function RagPill({
  rag,
  label,
  onClick,
}: {
  rag: Rag;
  label: string;
  onClick?: () => void;
}) {
  const cls =
    rag === "green"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : rag === "amber"
      ? "bg-orange-50 text-orange-700 border-orange-200"
      : "bg-red-50 text-red-700 border-red-200";
  const inner = (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${
          rag === "green"
            ? "bg-emerald-500"
            : rag === "amber"
            ? "bg-orange-500"
            : "bg-red-500"
        }`}
      />
      {label}
    </span>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="hover:opacity-80">
        {inner}
      </button>
    );
  }
  return inner;
}

// Convenience wrapper: resolve a slot's status from its contracts and
// render the pill. Keeps the Overview tables terse.
function SlotPill({
  contracts,
  onOpen,
}: {
  contracts: ContractRecord[];
  onOpen: (id: string) => void;
}) {
  const s = slotStatus(contracts, onOpen);
  return <RagPill rag={s.rag} label={s.label} onClick={s.open} />;
}

// Overview tab. Three stacked sections, each a small table with a
// counterparty in the leftmost column and one RAG pill per required
// contract type. Click a pill → jump to the matching contract in the
// List view (or open the first one when multiple).
function OverviewView({
  contracts,
  members,
  clients,
  projects,
  staffings,
  onOpenContract,
}: {
  contracts: ContractRecord[];
  members: MemberOpt[];
  clients: ClientOpt[];
  projects: ProjectOpt[];
  staffings: StaffingOpt[];
  onOpenContract: (id: string) => void;
}) {
  const membersById = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members],
  );
  const clientsById = useMemo(
    () => new Map(clients.map((c) => [c.id, c])),
    [clients],
  );

  // Indexes that let us answer "give me all contracts where
  // side=X and type=Y and the linked client/member/project includes Z"
  // without rescanning the whole list per cell.
  const contractsByClientSide = useMemo(() => {
    const out = new Map<string, ContractRecord[]>();
    for (const c of contracts) {
      if (c.side !== "Client") continue;
      for (const id of c.clientRecordIds) {
        const list = out.get(id) ?? [];
        list.push(c);
        out.set(id, list);
      }
    }
    return out;
  }, [contracts]);
  const contractsByMemberSide = useMemo(() => {
    const out = new Map<string, ContractRecord[]>();
    for (const c of contracts) {
      if (c.side !== "Network Member") continue;
      for (const id of c.memberRecordIds) {
        const list = out.get(id) ?? [];
        list.push(c);
        out.set(id, list);
      }
    }
    return out;
  }, [contracts]);
  const contractsByProjectAndSide = useMemo(() => {
    // key: `${projectId}|${side}`
    const out = new Map<string, ContractRecord[]>();
    for (const c of contracts) {
      if (!c.projectRecordIds.length) continue;
      const sideKey = c.side === "Network Member" ? "Network" : c.side;
      for (const pid of c.projectRecordIds) {
        const k = `${pid}|${sideKey}`;
        const list = out.get(k) ?? [];
        list.push(c);
        out.set(k, list);
      }
    }
    return out;
  }, [contracts]);

  const isType = (c: ContractRecord, t: ContractType) =>
    c.contractType.trim().toUpperCase() === t;

  // Clients shown in the overview: only those linked to at least one
  // project or any contract — drops dormant entries from the matrix so
  // it stays scannable.
  const activeClients = useMemo(() => {
    const used = new Set<string>();
    for (const p of projects) (p.clientRecordIds ?? []).forEach((id) => used.add(id));
    for (const c of contracts)
      if (c.side === "Client") c.clientRecordIds.forEach((id) => used.add(id));
    return clients
      .filter((c) => used.has(c.id))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [clients, projects, contracts]);

  // Members shown: those with at least one staffing or one network-side
  // contract.
  const activeMembers = useMemo(() => {
    const used = new Set<string>();
    for (const s of staffings) s.memberRecordIds.forEach((id) => used.add(id));
    for (const c of contracts)
      if (c.side === "Network Member") c.memberRecordIds.forEach((id) => used.add(id));
    return members
      .filter((m) => used.has(m.id))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [members, staffings, contracts]);

  // Project order: ongoing first. We treat "In Progress" as ongoing,
  // then Not Started / Planned / On Hold, then Completed at the bottom.
  const orderedProjects = useMemo(() => {
    const rank: Record<string, number> = {
      "In Progress": 0,
      "Not Started": 1,
      Planned: 2,
      "On Hold": 3,
      "": 4,
      Completed: 5,
    };
    return [...projects].sort((a, b) => {
      const ra = rank[a.status ?? ""] ?? 4;
      const rb = rank[b.status ?? ""] ?? 4;
      if (ra !== rb) return ra - rb;
      return a.code.localeCompare(b.code);
    });
  }, [projects]);

  // Member ids staffed per project, keyed by project code (staffings
  // join via projectCode, not record id).
  const projectMemberIds = useMemo(() => {
    const out = new Map<string, Set<string>>();
    for (const s of staffings) {
      if (!s.projectCode) continue;
      const set = out.get(s.projectCode) ?? new Set<string>();
      for (const id of s.memberRecordIds) set.add(id);
      out.set(s.projectCode, set);
    }
    return out;
  }, [staffings]);

  // Project rows whose per-member SOW breakdown is expanded.
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    new Set(),
  );
  const toggleProject = (id: string) =>
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-6">
      {/* Clients: each row should have an NDA + an MSA. */}
      <section className="bg-white rounded-lg border border-slate-200">
        <div className="border-b border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
          Clients <span className="font-normal text-slate-400">· NDA + MSA</span>
        </div>
        <table className="w-full table-fixed text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-2 py-1.5 font-medium w-1/2">Client</th>
              <th className="text-center px-2 py-1.5 font-medium">NDA</th>
              <th className="text-center px-2 py-1.5 font-medium">MSA</th>
            </tr>
          </thead>
          <tbody>
            {activeClients.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center text-slate-500 py-10">
                  No active clients.
                </td>
              </tr>
            ) : (
              activeClients.map((cl) => {
                const all = contractsByClientSide.get(cl.id) ?? [];
                const ndas = all.filter((c) => isType(c, "NDA"));
                const msas = all.filter((c) => isType(c, "MSA"));
                return (
                  <tr key={cl.id} className="border-t border-slate-100 align-middle">
                    <td className="px-2 py-1.5 demo-blur">
                      <div className="truncate">
                        <span className="font-mono text-[10px] text-slate-500">
                          {cl.code}
                        </span>{" "}
                        {cl.name}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <SlotPill contracts={ndas} onOpen={onOpenContract} />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <SlotPill contracts={msas} onOpen={onOpenContract} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      {/* Network Members: each row should have an MSA. */}
      <section className="bg-white rounded-lg border border-slate-200">
        <div className="border-b border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
          Network members <span className="font-normal text-slate-400">· MSA</span>
        </div>
        <table className="w-full table-fixed text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-2 py-1.5 font-medium w-2/3">Member</th>
              <th className="text-center px-2 py-1.5 font-medium">MSA</th>
            </tr>
          </thead>
          <tbody>
            {activeMembers.length === 0 ? (
              <tr>
                <td colSpan={2} className="text-center text-slate-500 py-10">
                  No active members.
                </td>
              </tr>
            ) : (
              activeMembers.map((m) => {
                const all = contractsByMemberSide.get(m.id) ?? [];
                const msas = all.filter((c) => isType(c, "MSA"));
                return (
                  <tr key={m.id} className="border-t border-slate-100 align-middle">
                    <td className="px-2 py-1.5 demo-blur">
                      <div className="truncate">
                        <span className="font-mono text-[10px] text-slate-500">
                          {m.code}
                        </span>{" "}
                        {m.name}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <SlotPill contracts={msas} onOpen={onOpenContract} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      {/* Projects: each row needs a Client-side SOW (HTP42 with the
          client) AND a Network-side SOW for every staffed member. */}
      <section className="bg-white rounded-lg border border-slate-200">
        <div className="border-b border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
          Projects <span className="font-normal text-slate-400">· Client SOW + Member SOW(s)</span>
        </div>
        <table className="w-full table-fixed text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-2 py-1.5 font-medium w-2/5">Project</th>
              <th className="text-left px-2 py-1.5 font-medium">Client</th>
              <th className="text-left px-2 py-1.5 font-medium whitespace-nowrap">Status</th>
              <th className="text-center px-2 py-1.5 font-medium">Client SOW</th>
              <th className="text-center px-2 py-1.5 font-medium">Member SOW(s)</th>
            </tr>
          </thead>
          <tbody>
            {orderedProjects.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-slate-500 py-10">
                  No projects on file.
                </td>
              </tr>
            ) : (
              orderedProjects.map((p) => {
                const clientSows =
                  contractsByProjectAndSide.get(`${p.id}|Client`)?.filter((c) => isType(c, "SOW")) ?? [];
                const memberSows =
                  contractsByProjectAndSide.get(`${p.id}|Network`)?.filter((c) => isType(c, "SOW")) ?? [];
                const clientStatus = slotStatus(clientSows, onOpenContract);
                // Internal projects (INT-*) have no external client, so no
                // client SOW is expected — show a dash instead of a RAG pill.
                const isInternal = /^INT[-_ ]/i.test(p.code) || p.code.toUpperCase() === "INT";
                const staffedMembers = projectMemberIds.get(p.code) ?? new Set<string>();
                const totalStaffed = staffedMembers.size;
                // Per-member SOW breakdown — one row per staffed member
                // with its slot status (green/amber/red + label + link).
                // Drives both the aggregate pill and the expandable detail.
                const memberBreakdown = [...staffedMembers].map((memberId) => {
                  const sows = memberSows.filter((c) =>
                    c.memberRecordIds.includes(memberId),
                  );
                  const m = membersById.get(memberId);
                  return {
                    memberId,
                    code: m?.code ?? memberId,
                    name: m?.name ?? "",
                    sows,
                    status: slotStatus(sows, onOpenContract),
                  };
                });
                memberBreakdown.sort((a, b) => a.code.localeCompare(b.code));
                const greenCount = memberBreakdown.filter(
                  (b) => b.status.rag === "green",
                ).length;
                let memberRag: Rag = "red";
                if (totalStaffed === 0) {
                  memberRag = memberSows.length > 0 ? "green" : "red";
                } else if (greenCount === totalStaffed) memberRag = "green";
                else if (greenCount > 0) memberRag = "amber";
                else memberRag = memberSows.length > 0 ? "amber" : "red";
                const clientName =
                  (p.clientRecordIds ?? [])
                    .map((id) => clientsById.get(id)?.name ?? clientsById.get(id)?.code ?? "")
                    .filter(Boolean)
                    .join(", ") || "—";
                const expandable = totalStaffed > 0;
                const expanded = expandedProjects.has(p.id);
                const memberLabel =
                  totalStaffed === 0
                    ? "no staffing"
                    : `${greenCount}/${totalStaffed}`;
                return (
                  <Fragment key={p.id}>
                    <tr
                      className={`border-t border-slate-100 align-middle ${
                        p.status === "Completed" ? "text-slate-400" : ""
                      }`}
                    >
                      <td className="px-2 py-1.5">
                        <div className="truncate">
                          <span className="font-mono text-[10px] text-slate-500">
                            {p.code}
                          </span>{" "}
                          {p.name}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 demo-blur">
                        <div className="truncate">{clientName}</div>
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-[11px] text-slate-600">
                        {p.status || "—"}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {isInternal ? (
                          <span className="text-slate-300" title="Internal project: no client SOW">
                            —
                          </span>
                        ) : (
                          <RagPill
                            rag={clientStatus.rag}
                            label={clientStatus.label}
                            onClick={clientStatus.open}
                          />
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={
                            expandable ? () => toggleProject(p.id) : undefined
                          }
                          disabled={!expandable}
                          className={`inline-flex items-center gap-1 ${
                            expandable ? "hover:opacity-80" : "cursor-default"
                          }`}
                          title={
                            expandable
                              ? "Show each staffed member's SOW status"
                              : undefined
                          }
                        >
                          <RagPill rag={memberRag} label={memberLabel} />
                          {expandable ? (
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 12 12"
                              fill="none"
                              className={`text-slate-400 transition-transform ${
                                expanded ? "rotate-180" : ""
                              }`}
                            >
                              <path
                                d="M3 4.5 6 7.5 9 4.5"
                                stroke="currentColor"
                                strokeWidth="1.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          ) : null}
                        </button>
                      </td>
                    </tr>
                    {expanded && expandable ? (
                      <tr className="border-t border-slate-100 bg-slate-50/60">
                        <td colSpan={5} className="px-2 py-1.5">
                          <div className="space-y-1">
                            {memberBreakdown.map((b) => (
                              <div
                                key={b.memberId}
                                className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1 ring-1 ring-slate-100"
                              >
                                <div className="min-w-0 truncate demo-blur text-[11px] text-slate-700">
                                  <span className="font-mono text-[10px] text-slate-500">
                                    {b.code}
                                  </span>{" "}
                                  {b.name}
                                </div>
                                <RagPill
                                  rag={b.status.rag}
                                  label={b.status.label}
                                  onClick={b.status.open}
                                />
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Dash() {
  return <span className="text-slate-300">—</span>;
}

// Inline expandable detail panel for a contract row — surfaces every field
// on the record so an admin can scan the full contract without opening the
// edit modal. Read-only: editing still happens in ContractDetailModal.
function ContractDetails({ c }: { c: ContractRecord }) {
  const side = resolveSide(c);
  const clientLabel =
    c.clientNames.filter(Boolean).join(", ") || c.clientCodes.join(", ");
  const memberLabel = c.memberCodes.join(", ");
  const projectLabel = c.projectCodes.join(", ") || c.projectCode;
  const bucket = validityBucket(c.validity);
  const validityLabel = bucket === "Expiry Missing" ? "Expiry missing" : bucket;
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
        <Field label="Side" value={side} />
        <Field label="Contract type" value={c.contractType} />
        {c.otherDescription ? (
          <Field label="Other description" value={c.otherDescription} />
        ) : null}
        <Field label="Client" value={clientLabel} blur />
        <Field label="Network member" value={memberLabel} blur />
        <Field label="Project" value={projectLabel} mono />
        <Field label="Signatory 1" value={c.signatory1.name} blur />
        <Field label="Signatory 1 role" value={c.signatory1.role} />
        <Field label="Signatory 1 company" value={c.signatory1.company} blur />
        <Field label="Signatory 1 date" value={formatFriendlyDate(c.signatory1.date)} />
        <Field label="Signatory 2" value={c.signatory2.name} blur />
        <Field label="Signatory 2 role" value={c.signatory2.role} />
        <Field label="Signatory 2 company" value={c.signatory2.company} blur />
        <Field label="Signatory 2 date" value={formatFriendlyDate(c.signatory2.date)} />
        <Field label="Signature date" value={formatFriendlyDate(c.signatureDate)} />
        <Field label="Expiry date" value={formatFriendlyDate(c.expiryDate)} />
        <Field label="Status" value={c.stage} />
        <Field label="Validity" value={validityLabel} />
      </dl>

      {c.keyTerms ? (
        <div>
          <div className="text-[11px] uppercase tracking-wide font-medium text-slate-500">Key terms</div>
          <p className="whitespace-pre-line text-[11px] text-slate-600">{c.keyTerms}</p>
        </div>
      ) : null}
      {c.comment ? (
        <div>
          <div className="text-[11px] uppercase tracking-wide font-medium text-slate-500">Comment</div>
          <p className="whitespace-pre-line text-[11px] text-slate-600 demo-blur">{c.comment}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 text-[11px]">
        {c.pdf?.url ? (
          <ButtonLink
            href={c.pdf.url}
            tone="secondary"
            size="sm"
            target="_blank"
            rel="noopener noreferrer"
          >
            Contract PDF
          </ButtonLink>
        ) : (
          <span className="text-slate-400">No PDF on file</span>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  blur,
}: {
  label: string;
  value: string;
  mono?: boolean;
  blur?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide font-medium text-slate-500">{label}</dt>
      <dd className={`text-slate-800 ${mono ? "font-mono text-[11px]" : ""} ${blur ? "demo-blur" : ""}`}>
        {value || "—"}
      </dd>
    </div>
  );
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
  projectLabel,
}: {
  filters: Filters;
  onClear: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  projectLabel?: (id: string) => string;
}) {
  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (filters.side !== "All") {
    chips.push({ key: `side:${filters.side}`, label: filters.side, clear: () => onClear("side", "All") });
  }
  for (const id of filters.project) {
    chips.push({
      key: `project:${id}`,
      label: projectLabel?.(id) ?? "Project",
      clear: () => onClear("project", filters.project.filter((p) => p !== id)),
    });
  }
  for (const t of filters.type) {
    chips.push({
      key: `type:${t}`,
      label: t,
      clear: () => onClear("type", filters.type.filter((x) => x !== t)),
    });
  }
  for (const s of filters.stage) {
    chips.push({
      key: `stage:${s}`,
      label: s,
      clear: () => onClear("stage", filters.stage.filter((x) => x !== s)),
    });
  }
  if (filters.validity !== "All") {
    chips.push({ key: `validity:${filters.validity}`, label: filters.validity, clear: () => onClear("validity", "All") });
  }
  if (chips.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {chips.map((c) => (
        <button
          key={c.key}
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
  signatory1Date: string;
  signatory2Name: string;
  signatory2Role: string;
  signatory2Company: string;
  signatory2Date: string;
  signatureDate: string;
  expiryDate: string;
  stage: string;
  keyTerms: string;
  comment: string;
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
    signatory1Date: c.signatory1.date,
    signatory2Name: c.signatory2.name,
    signatory2Role: c.signatory2.role,
    signatory2Company: c.signatory2.company,
    signatory2Date: c.signatory2.date,
    signatureDate: c.signatureDate,
    expiryDate: c.expiryDate,
    stage: c.stage,
    keyTerms: c.keyTerms,
    comment: c.comment,
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
    "signatory1Date",
    "signatory2Name",
    "signatory2Role",
    "signatory2Company",
    "signatory2Date",
    "signatureDate",
    "expiryDate",
    "stage",
    "keyTerms",
    "comment",
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

// "+ New contract" wizard. Two paths:
//   1) Upload a signed PDF → POST /api/admin/contracts/extract runs Claude
//      with the PDF as a document attachment, returns a JSON of guessed
//      fields. We create the contract with those fields, attach the PDF,
//      and open the edit modal so the admin reviews + corrects before
//      anything is "finalised".
//   2) "Start blank" → POST /api/admin/contracts with {} → empty row →
//      edit modal opens for manual entry.
// The model is told to leave anything it can't read confidently empty,
// so admins get a draft to vet rather than confident-but-wrong content.
function NewContractDialog({
  busy,
  onClose,
  onCreate,
  onUploadPdf,
}: {
  busy: boolean;
  onClose: () => void;
  onCreate: (prefill: Partial<ContractPatch>) => Promise<string | null>;
  onUploadPdf: (id: string, file: File) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<"choose" | "extracting" | "creating">("choose");
  const [error, setError] = useState<string>("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleBlank() {
    setError("");
    setMode("creating");
    await onCreate({});
  }

  async function handleFile(file: File) {
    setError("");
    setMode("extracting");
    try {
      const form = new FormData();
      form.append("pdf", file);
      const res = await fetch("/api/admin/contracts/extract", {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        fields?: Record<string, unknown>;
        matches?: {
          clientRecordIds?: string[];
          projectRecordIds?: string[];
          memberRecordIds?: string[];
        };
        error?: string;
      };
      if (!res.ok || !data.fields) {
        throw new Error(data.error ?? `Extraction failed (HTTP ${res.status})`);
      }
      const prefill = sanitizePrefill(data.fields);
      // Merge in the linked-record IDs the server fuzzy-matched against
      // the existing clients / projects / members. Only attach the
      // collection that matches the inferred Side so we don't create
      // cross-side stale links.
      const side = prefill.side;
      if (data.matches) {
        if (side === "Client" && data.matches.clientRecordIds?.length) {
          prefill.clientRecordIds = data.matches.clientRecordIds;
        }
        if (side === "Network Member" && data.matches.memberRecordIds?.length) {
          prefill.memberRecordIds = data.matches.memberRecordIds;
        }
        if (data.matches.projectRecordIds?.length) {
          prefill.projectRecordIds = data.matches.projectRecordIds;
        }
      }
      setMode("creating");
      const newId = await onCreate(prefill);
      // Attach the PDF the admin uploaded so the row + the source document
      // travel together. Best-effort: a failed attach surfaces as a toast
      // but doesn't unwind the row creation.
      if (newId) await onUploadPdf(newId, file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed");
      setMode("choose");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 px-3 py-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl ring-1 ring-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">New contract</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Drop a signed PDF and Claude will pre-fill the fields, or start blank.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            disabled={busy || mode !== "choose"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div
          className="mt-4"
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (mode === "choose" && !busy) setDragging(true);
          }}
          onDragOver={(e) => {
            // Both preventDefault + a non-"none" dropEffect are required
            // for the drop event to fire — without these the browser
            // treats the file as a navigation and the page just opens
            // the PDF in a new tab when released.
            e.preventDefault();
            e.stopPropagation();
            if (mode === "choose" && !busy) e.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragging(false);
            if (mode !== "choose" || busy) return;
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
        >
          <label
            htmlFor="new-contract-pdf"
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
              mode === "extracting" || dragging
                ? "border-brand-400 bg-brand-50"
                : "border-slate-300 hover:border-brand-400 hover:bg-brand-50"
            } ${busy || mode !== "choose" ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              className="text-brand-600"
            >
              <path
                d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="text-xs font-medium text-slate-800">
              {mode === "extracting"
                ? "Reading the PDF with Claude…"
                : mode === "creating"
                ? "Creating contract…"
                : dragging
                ? "Drop to upload"
                : "Drop a PDF or click to pick a file"}
            </div>
            <div className="text-[10px] text-slate-500">PDF only · max 5 MB</div>
          </label>
          <input
            ref={inputRef}
            id="new-contract-pdf"
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            disabled={busy || mode !== "choose"}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.currentTarget.value = "";
            }}
          />
        </div>

        {error ? (
          <div className="mt-3 rounded-md bg-red-50 px-2 py-1.5 text-[11px] text-red-700 ring-1 ring-red-200">
            <p>{error}</p>
            {/credit balance is too low/i.test(error) ? (
              <p className="mt-1 text-red-600">
                Top up the Anthropic API key at{" "}
                <a
                  href="https://console.anthropic.com/settings/billing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:no-underline"
                >
                  console.anthropic.com → Plans &amp; Billing
                </a>
                .
              </p>
            ) : null}
            <p className="mt-1 text-red-600">
              You can still hit “Start blank” to create the contract and fill it in manually.
            </p>
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={handleBlank}
            disabled={busy || mode !== "choose"}
            className="text-[11px] text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline disabled:opacity-50"
          >
            Or start blank
          </button>
          <Button
            tone="secondary"
            size="sm"
            onClick={onClose}
            disabled={busy || mode !== "choose"}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

// Whitelist of editable contract patch keys we accept from the
// extraction response. Anything Claude returns outside this set is
// dropped silently so the PATCH validator on the server doesn't reject
// the payload, and so a hallucinated field can't slip in.
function sanitizePrefill(raw: Record<string, unknown>): Partial<ContractPatch> {
  const allowed: Array<keyof ContractPatch> = [
    "side",
    "contractType",
    "otherDescription",
    "signatory1Name",
    "signatory1Role",
    "signatory1Company",
    "signatory1Date",
    "signatory2Name",
    "signatory2Role",
    "signatory2Company",
    "signatory2Date",
    "signatureDate",
    "expiryDate",
    "stage",
    "keyTerms",
    "comment",
  ];
  const out: Partial<ContractPatch> = {};
  for (const key of allowed) {
    const v = raw[key];
    if (typeof v === "string" && v.trim()) {
      (out as Record<string, string>)[key] = v.trim();
    }
  }
  return out;
}

function ContractDetailModal({
  contract: c,
  saving,
  members,
  clients,
  projects,
  onClose,
  onSave,
  onUpload,
  onDelete,
}: {
  contract: ContractRecord;
  saving: boolean;
  members: MemberOpt[];
  clients: ClientOpt[];
  projects: ProjectOpt[];
  onClose: () => void;
  onSave: (patch: ContractPatch) => Promise<void>;
  onUpload: (file: File) => Promise<boolean>;
  onDelete: () => Promise<void>;
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
        // SOWs and Purchase Orders are the project-scoped types. Anything else
        // drops the project link so admins don't accidentally tie an
        // NDA / MSA to a specific project.
        if (!t.includes("sow") && !t.includes("purchase order")) next.projectRecordIds = [];
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
  // SOWs and Purchase Orders are the project-scoped types → both show a
  // Project link.
  const typeLinksProject = typeIsSow || draft.contractType.toLowerCase().includes("purchase order");

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
        className="relative flex w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl ring-1 ring-slate-200"
        style={{ maxHeight: "calc(100vh - 4rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — counterparty name only. The badge cluster used to
            sit here too, but it duplicated info from the Identity /
            Lifecycle sections immediately below. */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-slate-900 demo-blur">
            {counterpartyLabel(c) || "New contract"}
          </h2>
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
                <ButtonLink
                  href={c.pdf.url}
                  tone="secondary"
                  size="sm"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Download
                </ButtonLink>
                <Button
                  tone="secondary"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading || saving}
                >
                  {uploading ? "Uploading…" : "Replace"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-amber-50 px-3 py-2 ring-1 ring-amber-200">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                  No PDF on file
                </div>
                <div className="text-xs text-amber-700">
                  Upload the signed contract. Finance gets an email copy.
                </div>
              </div>
              <Button
                tone="primary"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || saving}
              >
                {uploading ? "Uploading…" : "Upload PDF"}
              </Button>
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
            <SectionHeader title="Identity" />
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
                  value={draft.signatory1Company}
                  onChange={(v) => set("signatory1Company", v)}
                  placeholder="Acme Health"
                  sensitive
                />
              ) : null}

              {/* SOWs and Purchase Orders carry a Project link, on both Client
                  and Network sides. */}
              {typeLinksProject ? (
                <ProjectPicker
                  label="Project"
                  projects={projects}
                  selectedIds={draft.projectRecordIds}
                  onChange={(ids) => set("projectRecordIds", ids)}
                />
              ) : null}

              {/* Side = Other → free-form counterparty company, kept on
                  Signatory 1 → Company. */}
              {!sideIsClient && !sideIsNetwork && !sideIsPartner ? (
                <TextField
                  label="Counterparty (company name)"
                  value={draft.signatory1Company}
                  onChange={(v) => set("signatory1Company", v)}
                  placeholder="Acme Health"
                  sensitive
                />
              ) : null}
            </div>
          </section>

          {/* Lifecycle. Validity is computed read-only from Status +
              Expiry. */}
          <section className="space-y-3 border-t border-slate-100 pt-4">
            <SectionHeader title="Lifecycle" />
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-xs">
                <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Status
                </span>
                <select
                  value={
                    CONTRACT_STATUSES.includes(draft.stage as ContractStatus)
                      ? draft.stage
                      : ""
                  }
                  onChange={(e) => set("stage", e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                >
                  <option value="">—</option>
                  {CONTRACT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                {draft.stage &&
                !CONTRACT_STATUSES.includes(draft.stage as ContractStatus) ? (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Legacy value: {`"${draft.stage}"`}. Pick one of the canonical statuses.
                  </p>
                ) : null}
              </label>
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
                </div>
              </div>
            </div>
          </section>

          {/* Signatories. Each carries its own date because the two
              parties on a contract often sign on different days. */}
          <section className="space-y-3 border-t border-slate-100 pt-4">
            <SectionHeader title="Signatories" />
            <SignatoryRow
              index={1}
              name={draft.signatory1Name}
              role={draft.signatory1Role}
              company={draft.signatory1Company}
              date={draft.signatory1Date}
              onChange={(patch) =>
                setDraft((d) => ({
                  ...d,
                  signatory1Name: patch.name ?? d.signatory1Name,
                  signatory1Role: patch.role ?? d.signatory1Role,
                  signatory1Company: patch.company ?? d.signatory1Company,
                  signatory1Date: patch.date ?? d.signatory1Date,
                }))
              }
            />
            {showSecondSignatory ? (
              <SignatoryRow
                index={2}
                name={draft.signatory2Name}
                role={draft.signatory2Role}
                company={draft.signatory2Company}
                date={draft.signatory2Date}
                onChange={(patch) =>
                  setDraft((d) => ({
                    ...d,
                    signatory2Name: patch.name ?? d.signatory2Name,
                    signatory2Role: patch.role ?? d.signatory2Role,
                    signatory2Company: patch.company ?? d.signatory2Company,
                    signatory2Date: patch.date ?? d.signatory2Date,
                  }))
                }
                onRemove={() => {
                  setShowSecondSignatory(false);
                  setDraft((d) => ({
                    ...d,
                    signatory2Name: "",
                    signatory2Role: "",
                    signatory2Company: "",
                    signatory2Date: "",
                  }));
                }}
              />
            ) : (
              <Button
                tone="secondary"
                size="sm"
                onClick={() => setShowSecondSignatory(true)}
                className="border-dashed"
              >
                + Add a second signatory
              </Button>
            )}
          </section>

          {/* Key terms */}
          <section className="space-y-3 border-t border-slate-100 pt-4">
            <SectionHeader title="Key terms" />
            <BulletTextarea
              value={draft.keyTerms}
              onChange={(v) => set("keyTerms", v)}
              rows={8}
              placeholder={
                "• 12-month renewable term\n• Confidentiality 3 years\n• IP assigned to HTP42"
              }
            />
          </section>

          {/* Comment: free-form admin notes that don't fit Key Terms. */}
          <section className="space-y-3 border-t border-slate-100 pt-4">
            <SectionHeader title="Comment" />
            <textarea
              value={draft.comment}
              onChange={(e) => set("comment", e.target.value)}
              rows={3}
              placeholder="e.g. waiting on client legal sign-off"
              className="block w-full resize-y rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs leading-snug focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 whitespace-pre-line"
            />
          </section>

        </div>

        {/* Footer: Delete on the left, Cancel + Save on the right. */}
        <div className="flex items-center justify-between gap-3 rounded-b-lg border-t border-slate-200 bg-slate-50 px-5 py-3">
          <div className="flex items-center gap-2">
            <Button
              tone="danger"
              size="sm"
              onClick={async () => {
                if (
                  window.confirm(
                    "Delete this contract? This action can't be undone.",
                  )
                ) {
                  await onDelete();
                }
              }}
              disabled={saving}
            >
              Delete
            </Button>
            <span className="text-[11px] text-slate-500">
              {isDirty
                ? `${Object.keys(patchPreview).length} unsaved change${
                    Object.keys(patchPreview).length === 1 ? "" : "s"
                  }`
                : "No changes yet."}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button tone="secondary" size="sm" onClick={requestClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              tone="primary"
              size="sm"
              onClick={() => onSave(patchPreview)}
              disabled={saving || !isDirty}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
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
      className="block w-full resize-y rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs leading-snug focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 whitespace-pre-line"
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
        className={`mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 ${
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
        className={`mt-1 block w-full resize-y rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs leading-snug focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 whitespace-pre-line ${
          sensitive ? "demo-blur" : ""
        }`}
      />
    </label>
  );
}

function SignatoryRow({
  index,
  name,
  role,
  company,
  date,
  onChange,
  onRemove,
}: {
  index: 1 | 2;
  name: string;
  role: string;
  company: string;
  date: string;
  onChange: (
    patch: Partial<{ name: string; role: string; company: string; date: string }>,
  ) => void;
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
      <div className="grid gap-2 sm:grid-cols-4">
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
        <DateField
          label="Signed on"
          value={date}
          onChange={(v) => onChange({ date: v })}
          placeholder="Pick a date"
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
