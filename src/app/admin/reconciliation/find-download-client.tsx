"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/form-controls";

type Match = {
  kind: "member" | "vendor";
  id: string;
  label: string;
  reference: string;
  amountEur: number | null;
  dateIso: string | null;
  filename: string;
  hasPdf: boolean;
};
type Result = {
  date: string;
  libelle: string;
  debit: number;
  status: "found" | "review" | "not_found";
  match: Match | null;
};

const eur = (v: number | null) =>
  v == null ? "—" : `€${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const keyOf = (m: Match) => `${m.kind}:${m.id}`;

export function FindDownloadClient() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [counts, setCounts] = useState<{ found: number; review: number; notFound: number } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function onUpload(file: File) {
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/admin/reconciliation/find", { method: "POST", body: fd });
      const d = (await res.json().catch(() => ({}))) as {
        results?: Result[]; counts?: { found: number; review: number; notFound: number }; error?: string;
      };
      if (!res.ok) throw new Error(d.error ?? "Could not process the file.");
      setResults(d.results ?? []);
      setCounts(d.counts ?? null);
      // Pre-select every confident match that has a PDF.
      const pre = new Set<string>();
      for (const r of d.results ?? []) {
        if (r.status === "found" && r.match?.hasPdf) pre.add(keyOf(r.match));
      }
      setSelected(pre);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not process the file.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function toggle(m: Match) {
    setSelected((prev) => {
      const n = new Set(prev);
      const k = keyOf(m);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }

  // Unique selected {kind,id} (same invoice can match several lines).
  const selectedItems = useMemo(() => {
    const map = new Map<string, { kind: "member" | "vendor"; id: string }>();
    for (const r of results ?? []) {
      if (r.match && r.match.hasPdf && selected.has(keyOf(r.match))) {
        map.set(keyOf(r.match), { kind: r.match.kind, id: r.match.id });
      }
    }
    return [...map.values()];
  }, [results, selected]);

  async function downloadZip() {
    if (selectedItems.length === 0) return;
    setZipping(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reconciliation/zip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: selectedItems }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Could not build the zip.");
      }
      const blob = await res.blob();
      triggerDownload(blob, `factures-${new Date().toISOString().slice(0, 10)}.zip`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build the zip.");
    } finally {
      setZipping(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="text-xs text-slate-600">
          <div className="font-semibold text-slate-800">Find invoices for a missing-invoices file</div>
          <div className="mt-0.5 text-slate-500">
            Upload the list, the platform finds each stored invoice, and you download them one by one or all at once.
            Nothing is sent or saved here.
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
          <Button tone="primary" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? "Searching…" : "Upload & find"}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">{error}</div>
      ) : null}

      {results ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-500">
              {counts ? (
                <>
                  <span className="font-semibold text-sky-700">{counts.found} found</span> ·{" "}
                  <span className="text-amber-700">{counts.review} to review</span> ·{" "}
                  <span className="text-rose-700">{counts.notFound} not found</span> · {results.length} lines
                </>
              ) : null}
            </div>
            <Button tone="primary" size="sm" onClick={downloadZip} disabled={zipping || selectedItems.length === 0}>
              {zipping ? "Zipping…" : `Download selected (${selectedItems.length})`}
            </Button>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-8 px-2 py-2" />
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2 text-left font-medium">Libellé</th>
                  <th className="px-3 py-2 text-right font-medium">Débit</th>
                  <th className="px-3 py-2 text-left font-medium">Invoice found</th>
                  <th className="px-3 py-2 text-right font-medium">Download</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const m = r.match;
                  const selectable = !!m?.hasPdf;
                  return (
                    <tr key={i} className="border-t border-slate-100 align-top hover:bg-slate-50/60">
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          disabled={!selectable}
                          checked={selectable ? selected.has(keyOf(m!)) : false}
                          onChange={() => m && toggle(m)}
                          aria-label="Select for download"
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-500">{r.date}</td>
                      <td className="px-3 py-2 text-slate-800">{r.libelle || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
                        {eur(r.debit)}
                      </td>
                      <td className="px-3 py-2">
                        {m ? (
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className={`rounded px-1.5 py-0.5 text-[10px] ${r.status === "found" ? "bg-sky-50 text-sky-700 ring-1 ring-sky-200" : "bg-amber-50 text-amber-800 ring-1 ring-amber-200"}`}>
                                {r.status === "found" ? "match" : "review"}
                              </span>
                              <span className="text-slate-700">{m.label || "—"}</span>
                              {!m.hasPdf ? <span className="text-[10px] text-rose-500">no PDF</span> : null}
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-400">
                              {[m.reference, eur(m.amountEur), m.dateIso].filter(Boolean).join(" · ")}
                            </div>
                          </div>
                        ) : (
                          <span className="text-rose-500">Not found</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        {m?.hasPdf ? (
                          <a
                            href={`/api/admin/reconciliation/invoice-pdf?kind=${m.kind}&id=${encodeURIComponent(m.id)}`}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-brand-600 hover:bg-slate-50"
                          >
                            <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                              <path d="M8 2v7m0 0L5.5 6.5M8 9l2.5-2.5" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M3 11v1.5A1.5 1.5 0 004.5 14h7a1.5 1.5 0 001.5-1.5V11" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            PDF
                          </a>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-400">
            Tick the lines you want and use “Download selected” for a single zip, or grab a PDF per line. “Review” lines
            are a best-guess match — check the amount and name before relying on them.
          </p>
        </>
      ) : null}
    </div>
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
