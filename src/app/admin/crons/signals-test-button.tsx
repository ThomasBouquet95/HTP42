"use client";

import { useState } from "react";

type Result = {
  ok?: boolean;
  reason?: string;
  found?: number;
  posted?: number;
  skippedAlreadyPosted?: number;
  recentMessagesRead?: number;
  searchResults?: number;
  searchError?: string | null;
  slackError?: string | null;
  error?: string;
};

// TEMPORARY: a one-click run of the life-science-signals bot. Runs the full web
// search + curation + Slack post NOW and reports what it found / posted / skipped.
// Remove once the bot is verified. Note: a real run posts to #life-science-signals.
type Check = {
  anthropicKey?: boolean;
  channel?: string;
  slack?: {
    tokenPresent: boolean;
    authOk: boolean;
    authError?: string;
    botUser?: string;
    channelId: string | null;
    canReadChannel: boolean;
    channelError?: string;
  };
  error?: string;
};

export function SignalsTestButton() {
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    setCheck(null);
    try {
      const res = await fetch("/api/cron/life-science-signals", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as Result;
      if (!res.ok) throw new Error(data.error ?? data.reason ?? "Run failed.");
      setResult(data);
    } catch (e) {
      setError(
        e instanceof Error && /load failed|fetch|network/i.test(e.message)
          ? "The run took too long for the browser to wait (web search can take 1–2 min). Use “Check setup” for a fast diagnosis, or check #life-science-signals / the cron logs."
          : e instanceof Error
            ? e.message
            : "Run failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function runCheck() {
    setChecking(true);
    setError(null);
    setResult(null);
    setCheck(null);
    try {
      const res = await fetch("/api/admin/signals-check", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as Check;
      if (!res.ok) throw new Error(data.error ?? "Check failed.");
      setCheck(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check failed.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-slate-600">
          <span className="font-semibold text-slate-800">Life-science signals</span> — &ldquo;Check
          setup&rdquo; is a fast health check; &ldquo;Run now&rdquo; does a real web search + post
          (can take 1–2 min).
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={runCheck}
            disabled={busy || checking}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
          >
            {checking ? "Checking…" : "Check setup"}
          </button>
          <button
            type="button"
            onClick={run}
            disabled={busy || checking}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy ? "Searching…" : "Run now"}
          </button>
        </div>
      </div>

      {check ? <CheckReport c={check} /> : null}

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
            {result.searchError ? (
              <div className="mt-1 font-medium text-rose-700">
                ⚠ Web search failed: {result.searchError}. The bot can&apos;t fetch news — check that
                web search is enabled for the Anthropic API key.
              </div>
            ) : null}
            {result.slackError ? (
              <div className="mt-1 font-medium text-rose-700">
                ⚠ Slack post failed: {result.slackError}
                {result.slackError === "not_in_channel"
                  ? " — invite the bot to #life-science-signals."
                  : " — the bot token may be invalid/rotated; update SLACK_BOT_TOKEN."}
              </div>
            ) : null}
            {result.posted === 0 && !result.searchError && !result.slackError ? (
              <div className="mt-1 text-slate-500">
                Nothing posted — {result.found === 0 ? "nothing cleared the bar today" : "every item was already in the channel"}.
                {typeof result.searchResults === "number" ? ` (${result.searchResults} web results scanned.)` : ""} That is a normal outcome.
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

function Line({ ok, children }: { ok: boolean | null; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className={ok === null ? "text-slate-400" : ok ? "text-emerald-600" : "text-rose-600"}>
        {ok === null ? "•" : ok ? "✓" : "✕"}
      </span>
      <span>{children}</span>
    </div>
  );
}

function CheckReport({ c }: { c: Check }) {
  const s = c.slack;
  const channelReadable = !!s?.canReadChannel;
  return (
    <div className="mt-2 space-y-1 rounded-md bg-white px-2.5 py-2 text-[11px] text-slate-700 ring-1 ring-slate-200">
      <Line ok={!!c.anthropicKey}>
        Anthropic API key {c.anthropicKey ? "set" : "missing — the bot can't search the web"}
      </Line>
      <Line ok={!!s?.tokenPresent}>Slack token {s?.tokenPresent ? "set" : "missing (SLACK_BOT_TOKEN)"}</Line>
      {s?.tokenPresent ? (
        <Line ok={!!s?.authOk}>
          Slack token valid
          {s?.authOk
            ? s.botUser
              ? ` (bot: ${s.botUser})`
              : ""
            : ` — ${s?.authError ?? "auth failed"}. The token was likely rotated/revoked; update SLACK_BOT_TOKEN in Vercel.`}
        </Line>
      ) : null}
      {s?.authOk ? (
        <Line ok={channelReadable}>
          {channelReadable
            ? `Can access ${c.channel}`
            : `Can't access ${c.channel} — ${s?.channelError ?? "unknown"}${
                s?.channelError === "not_in_channel"
                  ? " (invite the bot: /invite @bot in the channel)"
                  : s?.channelError === "channel_not_found_or_no_read_scope"
                    ? " (add channels:read scope + reinstall, or invite the bot)"
                    : s?.channelError === "missing_scope"
                      ? " (add channels:history scope + reinstall the app)"
                      : ""
              }`}
        </Line>
      ) : null}
      {c.anthropicKey && s?.authOk && channelReadable ? (
        <div className="pt-0.5 text-emerald-700">
          All good — config is healthy. If it still doesn&apos;t post, it&apos;s likely a quiet news
          day or web search isn&apos;t enabled for the key (use &ldquo;Run now&rdquo; and read the
          result).
        </div>
      ) : null}
    </div>
  );
}
