"use client";

import { useState } from "react";

export function ReviewForm({ token, preset }: { token: string; preset?: "approve" | "reject" }) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<null | "approve" | "reject">(null);
  const [done, setDone] = useState<null | "approve" | "reject">(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(action: "approve" | "reject") {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/timesheet-review/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, comment }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Something went wrong.");
      }
      setDone(action);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  if (done) {
    return (
      <div
        className={`rounded-xl border p-6 ${
          done === "approve"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-rose-200 bg-rose-50 text-rose-800"
        }`}
      >
        <div className="text-base font-semibold">
          {done === "approve" ? "✅ Timesheet approved" : "❌ Timesheet rejected"}
        </div>
        <p className="mt-1 text-sm">
          {done === "approve"
            ? "Thank you. Your approval has been recorded. You can close this page."
            : "Thank you. Your rejection has been recorded and HTP42 will follow up. You can close this page."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
        Comment (optional)
      </label>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        placeholder="Add a note for the consultant / HTP42…"
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
      />
      {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={() => submit("approve")}
          disabled={busy !== null}
          autoFocus={preset === "approve"}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {busy === "approve" ? "Approving…" : "✓ Approve"}
        </button>
        <button
          type="button"
          onClick={() => submit("reject")}
          disabled={busy !== null}
          autoFocus={preset === "reject"}
          className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
        >
          {busy === "reject" ? "Rejecting…" : "✕ Reject"}
        </button>
      </div>
    </div>
  );
}
