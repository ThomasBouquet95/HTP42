"use client";

import { useMemo, useState } from "react";
import { DownloadChip } from "@/components/download-chip";
import { SearchInput } from "@/components/search-input";
import { SegmentedTabs } from "@/components/filters";
import type { DocumentKind, DocumentRecord } from "@/lib/airtable";

const KIND_FILTERS: Array<{ value: "All" | DocumentKind; label: string }> = [
  { value: "All", label: "All" },
  { value: "Contract", label: "Contracts" },
  { value: "CV", label: "CVs" },
  { value: "Invoice", label: "Invoices" },
  { value: "Purchase Order", label: "POs" },
];

export function DocumentSearchClient({ documents }: { documents: DocumentRecord[] }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"All" | DocumentKind>("All");

  const results = useMemo(() => {
    const base = kind === "All" ? documents : documents.filter((d) => d.kind === kind);
    const q = query.trim().toLowerCase();
    if (!q) {
      // No query: show everything, grouped sensibly (kind, then title).
      return [...base].sort(
        (a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title),
      );
    }
    const tokens = q.split(/\s+/).filter(Boolean);
    const scored: Array<{ doc: DocumentRecord; score: number }> = [];
    for (const doc of base) {
      const hay = doc.keywords;
      const title = doc.title.toLowerCase();
      let total = 0;
      let ok = true;
      for (const t of tokens) {
        let s = 0;
        if (hay.includes(t)) s += 2;
        else if (fuzzySubsequence(t, hay)) s += 1;
        if (s === 0) {
          ok = false;
          break;
        }
        if (title.includes(t)) s += 2; // title hits rank higher
        total += s;
      }
      if (ok) scored.push({ doc, score: total });
    }
    scored.sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title));
    return scored.map((s) => s.doc);
  }, [documents, query, kind]);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search a name, invoice code, project, client, filename…"
          className="w-full"
          autoFocus
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SegmentedTabs
            value={kind}
            onChange={setKind}
            options={KIND_FILTERS}
            ariaLabel="Filter documents by kind"
          />
          <span className="ml-auto text-[11px] text-slate-500">
            {results.length} result{results.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        {results.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            No documents match &ldquo;{query}&rdquo;.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {results.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50">
                <KindBadge kind={d.kind} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-900 demo-blur">
                    {d.title}
                  </div>
                  {d.subtitle ? (
                    <div className="truncate text-xs text-slate-500 demo-blur">{d.subtitle}</div>
                  ) : null}
                </div>
                <span className="hidden sm:block truncate max-w-[14rem] font-mono text-[10px] text-slate-400">
                  {d.filename}
                </span>
                <DownloadChip url={d.url} title={`Open ${d.filename}`} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function KindBadge({ kind }: { kind: DocumentKind }) {
  const cls =
    kind === "Contract"
      ? "bg-violet-50 text-violet-700 border-violet-200"
      : kind === "CV"
      ? "bg-sky-50 text-sky-700 border-sky-200"
      : kind === "Purchase Order"
      ? "bg-indigo-50 text-indigo-700 border-indigo-200"
      : "bg-amber-50 text-amber-700 border-amber-200";
  // Keep the fixed-width pill readable — the long "Purchase Order" shows as PO.
  const label = kind === "Purchase Order" ? "PO" : kind;
  return (
    <span
      className={`inline-flex w-16 shrink-0 items-center justify-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

// True when every char of `needle` appears in order within `hay` — a cheap
// fuzzy match so "boup" still finds "BOUPA1" and typos degrade gracefully.
function fuzzySubsequence(needle: string, hay: string): boolean {
  let i = 0;
  for (let j = 0; j < hay.length && i < needle.length; j++) {
    if (hay[j] === needle[i]) i++;
  }
  return i === needle.length;
}
