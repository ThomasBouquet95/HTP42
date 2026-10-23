"use client";

import { useState } from "react";

type Result = { channel: string; ok: boolean; error?: string };

// TEMPORARY: a one-click Slack connectivity test. Posts to #finance / #payments
// / #timesheets and shows which succeeded. Remove once the bot is verified.
export function SlackTestButton() {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/admin/slack/test", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string; results?: Result[] };
      if (!res.ok) throw new Error(data.error ?? "Test failed.");
      setResults(data.results ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-slate-600">
          <span className="font-semibold text-slate-800">Slack bot test</span> — posts a message to
          #finance, #payments and #timesheets to confirm the bot can post.
        </div>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {busy ? "Sending…" : "Send test to Slack"}
        </button>
      </div>

      {error ? (
        <div className="mt-2 rounded-md bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700 ring-1 ring-rose-200">
          {error}
        </div>
      ) : null}

      {results ? (
        <ul className="mt-2 space-y-1 text-[11px]">
          {results.map((r) => (
            <li key={r.channel} className="flex items-center gap-2">
              <span className={r.ok ? "text-emerald-600" : "text-rose-600"}>{r.ok ? "✓" : "✕"}</span>
              <span className="font-mono text-slate-700">{r.channel}</span>
              {r.ok ? (
                <span className="text-slate-400">posted</span>
              ) : (
                <span className="text-rose-600">
                  {r.error === "not_in_channel"
                    ? "bot not in channel — /invite @HTP42 Bot"
                    : r.error || "failed"}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
