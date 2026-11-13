"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Button } from "@/components/form-controls";
import { SearchInput } from "@/components/search-input";
import { SegmentedTabs } from "@/components/filters";
import type { FulllReconRow, ReconResolution } from "@/lib/reconciliation-store";
import type { WeekBucket } from "@/lib/reconciliation";

type Totals = { rows: number; missing: number; review: number; found: number; processed: number };

type Props = {
  rows: FulllReconRow[];
  weeks: WeekBucket[];
  totals: Totals;
  liveSend: boolean;
  intakeEmail: string;
};

const RESOLUTIONS: { value: ReconResolution; label: string }[] = [
  { value: "", label: "—" },
  { value: "receipt_lost", label: "Receipt lost" },
  { value: "personal", label: "Personal expense" },
  { value: "already_deposited", label: "Already deposited" },
  { value: "other", label: "Other" },
];
const RESOLUTION_LABEL = new Map(RESOLUTIONS.map((r) => [r.value, r.label]));

const eur = (v: number) => `€${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const isProcessed = (r: FulllReconRow) => !!r.sentToFulllAt || !!r.resolution;

type Filter = "all" | "missing" | "review" | "found" | "processed";

export function ReconciliationClient({ rows, weeks, totals, liveSend, intakeEmail }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [matchFor, setMatchFor] = useState<FulllReconRow | null>(null);

  function flash(kind: "ok" | "error", msg: string) {
    setToast({ kind, msg });
    window.setTimeout(() => setToast(null), 5000);
  }
  function toggle(id: string) {
    setExpanded((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function statusOf(r: FulllReconRow): Filter {
    if (isProcessed(r)) return "processed";
    if (r.matchStatus === "found") return "found";
    if (r.matchStatus === "review") return "review";
    return "missing";
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => (filter === "all" ? true : statusOf(r) === filter))
      .filter((r) =>
        q ? [r.date, r.libelle, r.matchedLabel, r.commentaire].join(" ").toLowerCase().includes(q) : true,
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [rows, search, filter]);

  async function onUpload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/admin/reconciliation/upload", { method: "POST", body: fd });
      const d = (await res.json().catch(() => ({}))) as {
        added?: number; alreadyPresent?: number; found?: number; review?: number; notFound?: number; error?: string;
      };
      if (!res.ok) throw new Error(d.error ?? "Upload failed.");
      flash(
        "ok",
        `Added ${d.added ?? 0} (${d.found ?? 0} matched · ${d.review ?? 0} to review · ${d.notFound ?? 0} not found)` +
          (d.alreadyPresent ? ` · ${d.alreadyPresent} already loaded` : ""),
      );
      router.refresh();
    } catch (e) {
      flash("error", e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function patchRow(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/reconciliation/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(d.error ?? "Update failed.");
    }
  }

  async function saveComment(r: FulllReconRow, value: string) {
    if (value === r.commentaire) return;
    try {
      await patchRow(r.id, { commentaire: value });
      router.refresh();
    } catch (e) {
      flash("error", e instanceof Error ? e.message : "Update failed.");
    }
  }
  async function setResolution(r: FulllReconRow, value: ReconResolution) {
    try {
      await patchRow(r.id, { resolution: value });
      flash("ok", value ? "Marked resolved" : "Resolution cleared");
      router.refresh();
    } catch (e) {
      flash("error", e instanceof Error ? e.message : "Update failed.");
    }
  }

  async function send(r: FulllReconRow, force = false) {
    try {
      const res = await fetch(`/api/admin/reconciliation/${r.id}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const d = (await res.json().catch(() => ({}))) as { sendMode?: string; error?: string; alreadySent?: boolean };
      if (res.status === 409 && d.alreadySent) {
        if (window.confirm(`${d.error} Send again anyway?`)) return send(r, true);
        return;
      }
      if (!res.ok) throw new Error(d.error ?? "Send failed.");
      flash("ok", d.sendMode === "live" ? "Sent to Fulll" : "Dry run — recorded, no email sent (sending is disabled)");
      router.refresh();
    } catch (e) {
      flash("error", e instanceof Error ? e.message : "Send failed.");
    }
  }

  const maxWeek = Math.max(1, ...weeks.map((w) => w.total));

  return (
    <div className="space-y-5">
      {/* Upload + live-send banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="text-xs text-slate-600">
          <div className="font-semibold text-slate-800">Upload the monthly Fulll Excel</div>
          <div className="mt-0.5 text-slate-500">
            Over- and under-threshold files both work. Transactions already loaded keep their status.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUpload(f);
            }}
          />
          <Button tone="primary" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? "Processing…" : "Upload Excel"}
          </Button>
        </div>
      </div>

      {!liveSend ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-800">
          <strong>Sending is disabled.</strong> &ldquo;Send to Fulll&rdquo; records a dry run and emails nothing. Set
          <code className="mx-1 rounded bg-white px-1 py-0.5 font-mono text-[11px]">FULLL_SEND_ENABLED=true</code>
          (intake: <span className="font-mono">{intakeEmail || "not set"}</span>) to send for real.
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-800">
          Live sending is <strong>on</strong> → invoices go to <span className="font-mono">{intakeEmail}</span>.
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi label="Transactions" value={totals.rows} tone="slate" />
        <Kpi label="Missing" value={totals.missing} tone="rose" />
        <Kpi label="To review" value={totals.review} tone="amber" />
        <Kpi label="Invoice found" value={totals.found} tone="blue" />
        <Kpi label="Processed" value={totals.processed} tone="emerald" />
      </div>

      {/* Weekly dashboard */}
      {weeks.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Missing invoices per week
          </div>
          <div className="space-y-1.5">
            {weeks.map((w) => (
              <div key={w.week} className="flex items-center gap-3 text-[11px]">
                <div className="w-40 shrink-0 text-slate-500">{w.label}</div>
                <div className="flex h-4 flex-1 overflow-hidden rounded bg-slate-100" title={`${w.total} transactions`}>
                  <Seg n={w.missing} max={maxWeek} cls="bg-rose-400" />
                  <Seg n={w.review} max={maxWeek} cls="bg-amber-400" />
                  <Seg n={w.found} max={maxWeek} cls="bg-sky-400" />
                  <Seg n={w.processed} max={maxWeek} cls="bg-emerald-400" />
                </div>
                <div className="w-20 shrink-0 text-right tabular-nums">
                  <span className="font-semibold text-rose-600">{w.missing}</span>
                  <span className="text-slate-400"> / {w.total}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-slate-400">
            <Legend cls="bg-rose-400" label="Missing (not found)" />
            <Legend cls="bg-amber-400" label="To review" />
            <Legend cls="bg-sky-400" label="Invoice found" />
            <Legend cls="bg-emerald-400" label="Processed" />
          </div>
        </div>
      ) : null}

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          ariaLabel="Filter transactions"
          options={[
            { value: "all", label: `All · ${totals.rows}` },
            { value: "missing", label: `Missing · ${totals.missing}` },
            { value: "review", label: `Review · ${totals.review}` },
            { value: "found", label: `Found · ${totals.found}` },
            { value: "processed", label: `Processed · ${totals.processed}` },
          ]}
        />
        <SearchInput value={search} onChange={setSearch} placeholder="Search libellé, invoice, comment…" />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Date</th>
              <th className="px-3 py-2 text-left font-medium">Libellé</th>
              <th className="px-3 py-2 text-right font-medium">Débit</th>
              <th className="px-3 py-2 text-left font-medium">Match</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-slate-400">
                  {rows.length === 0 ? "Upload a Fulll Excel to begin." : "No transactions match this view."}
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const st = statusOf(r);
                const open = expanded.has(r.id);
                return (
                  <ReconRow
                    key={r.id}
                    r={r}
                    status={st}
                    open={open}
                    liveSend={liveSend}
                    onToggle={() => toggle(r.id)}
                    onFindMatch={() => setMatchFor(r)}
                    onSend={() => send(r)}
                    onSaveComment={(v) => saveComment(r, v)}
                    onResolution={(v) => setResolution(r, v)}
                    onClearMatch={async () => {
                      try {
                        await patchRow(r.id, { match: null });
                        router.refresh();
                      } catch (e) {
                        flash("error", e instanceof Error ? e.message : "Update failed.");
                      }
                    }}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {matchFor ? (
        <MatchModal
          row={matchFor}
          onClose={() => setMatchFor(null)}
          onPicked={async (c) => {
            try {
              await patchRow(matchFor.id, { match: { kind: c.kind, id: c.id, label: c.label } });
              setMatchFor(null);
              flash("ok", "Match confirmed");
              router.refresh();
            } catch (e) {
              flash("error", e instanceof Error ? e.message : "Update failed.");
            }
          }}
        />
      ) : null}

      {toast ? (
        <div
          role="status"
          className={`pointer-events-none fixed bottom-4 right-4 z-[80] max-w-sm rounded-lg border px-3 py-2 text-xs shadow-lg ${
            toast.kind === "error"
              ? "border-rose-300 bg-rose-50 text-rose-800"
              : "border-emerald-300 bg-emerald-50 text-emerald-800"
          }`}
        >
          {toast.msg}
        </div>
      ) : null}
    </div>
  );
}

function ReconRow({
  r,
  status,
  open,
  liveSend,
  onToggle,
  onFindMatch,
  onSend,
  onSaveComment,
  onResolution,
  onClearMatch,
}: {
  r: FulllReconRow;
  status: Filter;
  open: boolean;
  liveSend: boolean;
  onToggle: () => void;
  onFindMatch: () => void;
  onSend: () => void;
  onSaveComment: (v: string) => void;
  onResolution: (v: ReconResolution) => void;
  onClearMatch: () => void;
}) {
  const [comment, setComment] = useState(r.commentaire);
  return (
    <>
      <tr className="border-t border-slate-100 align-top hover:bg-slate-50/60">
        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-500">{r.date}</td>
        <td className="px-3 py-2">
          <button type="button" onClick={onToggle} className="text-left text-slate-800 hover:underline">
            {r.libelle || "—"}
          </button>
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
          {eur(r.debit)}
        </td>
        <td className="px-3 py-2">
          {r.matchedInvoiceId ? (
            <span className="text-slate-700">{r.matchedLabel || "Matched invoice"}</span>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>
        <td className="px-3 py-2">
          <StatusPill status={status} sendMode={r.sendMode} resolution={r.resolution} />
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right">
          <div className="inline-flex items-center gap-1.5">
            {r.matchedInvoiceId && (!r.sentToFulllAt || r.sendMode === "dryrun") ? (
              <Button tone="primary" size="sm" onClick={onSend}>
                {!liveSend ? "Dry run" : r.sendMode === "dryrun" ? "Send for real" : "Send"}
              </Button>
            ) : null}
            {!r.matchedInvoiceId ? (
              <Button tone="secondary" size="sm" onClick={onFindMatch}>
                Find match
              </Button>
            ) : null}
            <button
              type="button"
              onClick={onToggle}
              aria-label="Details"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"
            >
              <svg viewBox="0 0 16 16" className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </td>
      </tr>
      {open ? (
        <tr className="border-t border-slate-100 bg-slate-50/60">
          <td colSpan={6} className="px-3 py-3">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Match</div>
                {r.matchedInvoiceId ? (
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className="rounded bg-sky-50 px-1.5 py-0.5 text-sky-700 ring-1 ring-sky-200">
                      {r.matchedKind === "member" ? "Member invoice" : "Vendor invoice"}
                    </span>
                    <span className="text-slate-700">{r.matchedLabel}</span>
                    <button type="button" onClick={onClearMatch} className="text-[11px] text-slate-400 hover:text-rose-600">
                      Clear
                    </button>
                    <button type="button" onClick={onFindMatch} className="text-[11px] text-brand-600 hover:underline">
                      Change
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={onFindMatch} className="mt-1 text-xs font-medium text-brand-600 hover:underline">
                    Find a matching invoice…
                  </button>
                )}

                <div className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Resolution (no invoice)
                </div>
                <select
                  value={r.resolution}
                  onChange={(e) => onResolution(e.target.value as ReconResolution)}
                  className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-brand-600 focus:outline-none"
                >
                  {RESOLUTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {r.sentToFulllAt ? (
                  <p className="mt-2 text-[11px] text-slate-500">
                    Sent {r.sentToFulllAt.slice(0, 10)} {r.sendMode === "dryrun" ? "(dry run)" : ""}
                  </p>
                ) : null}
              </div>

              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Commentaire</div>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onBlur={() => onSaveComment(comment)}
                  rows={3}
                  placeholder="Outcome notes (e.g. receipt lost, personal expense, invoice already deposited)…"
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs leading-relaxed focus:border-brand-600 focus:outline-none"
                />
                <p className="mt-0.5 text-[10px] text-slate-400">Preserved from the file; saved on blur.</p>
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function StatusPill({
  status,
  sendMode,
  resolution,
}: {
  status: Filter;
  sendMode: string;
  resolution: ReconResolution;
}) {
  if (status === "processed") {
    const label = sendMode === "dryrun" ? "Processed (dry run)" : resolution ? RESOLUTION_LABEL.get(resolution) : "Sent";
    return <Pill cls="bg-emerald-50 text-emerald-700 ring-emerald-200">{label}</Pill>;
  }
  if (status === "found") return <Pill cls="bg-sky-50 text-sky-700 ring-sky-200">Invoice found</Pill>;
  if (status === "review") return <Pill cls="bg-amber-50 text-amber-800 ring-amber-200">Needs review</Pill>;
  return <Pill cls="bg-rose-50 text-rose-700 ring-rose-200">Not found</Pill>;
}

function Pill({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${cls}`}>{children}</span>;
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: "slate" | "rose" | "amber" | "blue" | "emerald" }) {
  const col: Record<string, string> = {
    slate: "text-slate-900",
    rose: "text-rose-600",
    amber: "text-amber-600",
    blue: "text-sky-600",
    emerald: "text-emerald-600",
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-0.5 text-xl font-semibold tabular-nums ${col[tone]}`}>{value}</div>
    </div>
  );
}

function Seg({ n, max, cls }: { n: number; max: number; cls: string }) {
  if (n <= 0) return null;
  return <div className={cls} style={{ width: `${(n / max) * 100}%` }} title={`${n}`} />;
}
function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-2 w-2 rounded-sm ${cls}`} /> {label}
    </span>
  );
}

type Candidate = {
  kind: "member" | "vendor";
  id: string;
  label: string;
  reference: string;
  amountEur: number | null;
  dateIso: string | null;
  hasPdf: boolean;
  score: number;
  amountOk: boolean;
  refMatch: boolean;
  nameMatch: boolean;
  daysApart: number | null;
};

function MatchModal({
  row,
  onClose,
  onPicked,
}: {
  row: FulllReconRow;
  onClose: () => void;
  onPicked: (c: Candidate) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/admin/reconciliation/${row.id}/candidates`);
        const d = (await res.json().catch(() => ({}))) as { candidates?: Candidate[]; error?: string };
        if (!res.ok) throw new Error(d.error ?? "Could not load candidates.");
        if (active) setCandidates(d.candidates ?? []);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Could not load candidates.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [row.id]);

  return (
    <Modal open onClose={onClose} title="Find a matching invoice" size="lg" footer={<Button tone="secondary" size="sm" onClick={onClose}>Close</Button>}>
      <div className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-100">
        <div className="font-medium text-slate-800">{row.libelle}</div>
        <div className="mt-0.5">{row.date} · {eur(row.debit)}</div>
      </div>
      {loading ? (
        <p className="py-6 text-center text-xs text-slate-400">Searching invoices…</p>
      ) : error ? (
        <p className="py-6 text-center text-xs text-rose-600">{error}</p>
      ) : candidates.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-400">No invoice matches this amount in the stored invoices.</p>
      ) : (
        <ul className="space-y-1.5">
          {candidates.map((c) => (
            <li key={`${c.kind}-${c.id}`} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-2.5 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                    {c.kind === "member" ? "Member" : "Vendor"}
                  </span>
                  <span className="truncate font-medium text-slate-800">{c.label || "—"}</span>
                  {!c.hasPdf ? <span className="text-[10px] text-rose-500">no PDF</span> : null}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {c.reference ? `${c.reference} · ` : ""}
                  {c.amountEur != null ? eur(c.amountEur) : "—"}
                  {c.dateIso ? ` · ${c.dateIso}` : ""}
                  {c.daysApart != null ? ` · ${Math.abs(c.daysApart)}d apart` : ""}
                </div>
              </div>
              <Button tone="primary" size="sm" onClick={() => onPicked(c)} disabled={!c.hasPdf}>
                Use
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
