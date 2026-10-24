"use client";

import { useState } from "react";

type Result = {
  ok?: boolean;
  reason?: string;
  found?: number;
  posted?: number;
  skippedAlreadyPosted?: number;
  recentMessagesRead?: number;
  error?: string;
};

// TEMPORARY: a one-click run of the life-science-signals bot. Runs the full web
// search + curation + Slack post NOW and reports what it found / posted / skipped.
// Remove once the bot is verified. Note: a real run posts to #life-science-signals.
export function SignalsTestButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/cron/life-science-signals", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as Result;
      if (!res.ok) throw new Error(data.error ?? data.reason ?? "Run failed.");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-slate-600">
          <span className="font-semibold text-slate-800">Life-science signals test</span> — runs the
          web search now and posts the curated items to #life-science-signals (a real post).
        </div>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy ? "Searching…" : "Run signals bot now"}
        </button>
      </div>

      {busy ? (
        <div className="mt-2 text-[11px] text-slate-500">
          This can take up to a minute while the model searches and curates…
        </div>
      ) : null}

      {error ? (
        <div className="mt-2 rounded-md bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700 ring-1 ring-rose-200">
          {error}
        </div>
      ) : null}

      {result ? (
        result.ok ? (
          <div className="mt-2 rounded-md bg-white px-2.5 py-1.5 text-[11px] text-slate-700 ring-1 ring-slate-200">
            <span className="font-semibold text-emerald-600">✓ Done.</span> Found{" "}
            <strong>{result.found ?? 0}</strong>, posted <strong>{result.posted ?? 0}</strong>
            {result.skippedAlreadyPosted ? (
              <> · skipped {result.skippedAlreadyPosted} already posted</>
            ) : null}
            {typeof result.recentMessagesRead === "number" ? (
              <> · read {result.recentMessagesRead} recent message(s) for dedup</>
            ) : null}
            {result.posted === 0 ? (
              <div className="mt-1 text-slate-500">
                Nothing posted — either nothing cleared the bar today, or every item was already in
                the channel. That is a normal outcome.
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800 ring-1 ring-amber-200">
            Skipped: {result.reason ?? "not configured"}. Check ANTHROPIC_API_KEY and
            SLACK_BOT_TOKEN.
          </div>
        )
      ) : null}
    </div>
  );
}
