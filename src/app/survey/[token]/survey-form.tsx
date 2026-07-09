"use client";

import { useState } from "react";
import { StarRating } from "@/components/star-rating";
import { Button } from "@/components/form-controls";
import type { SurveyTeamMember } from "@/lib/airtable";

type MemberState = Record<string, { grade: number | null; wentWell: string; improve: string }>;

export function SurveyForm({
  token,
  members,
}: {
  token: string;
  members: SurveyTeamMember[];
}) {
  const [overallGrade, setOverallGrade] = useState<number | null>(null);
  const [overallWentWell, setOverallWentWell] = useState("");
  const [overallImprove, setOverallImprove] = useState("");
  const [memberState, setMemberState] = useState<MemberState>(() =>
    Object.fromEntries(members.map((m) => [m.code, { grade: null, wentWell: "", improve: "" }])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function setMember(code: string, patch: Partial<MemberState[string]>) {
    setMemberState((s) => ({ ...s, [code]: { ...s[code], ...patch } }));
  }

  async function submit() {
    setError(null);
    if (overallGrade == null) {
      setError("Please give an overall rating.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/survey/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          overallGrade,
          overallWentWell,
          overallImprove,
          members: members.map((m) => ({
            code: m.code,
            grade: memberState[m.code]?.grade ?? null,
            wentWell: memberState[m.code]?.wentWell ?? "",
            improve: memberState[m.code]?.improve ?? "",
          })),
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Could not submit. Please try again.");
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit.");
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
        <div className="text-lg font-semibold text-emerald-800">Thank you!</div>
        <p className="mt-1 text-sm text-emerald-700">
          Your feedback has been recorded. You can close this page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Overall engagement</h2>
        <div className="mt-3">
          <label className="block text-[11px] uppercase tracking-wide font-medium text-slate-500">Overall rating</label>
          <div className="mt-1.5">
            <StarRating value={overallGrade} onChange={setOverallGrade} />
          </div>
        </div>
        <Field label="What went well?" value={overallWentWell} onChange={setOverallWentWell} />
        <Field label="What could be improved?" value={overallImprove} onChange={setOverallImprove} />
      </section>

      {members.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">The team</h2>
          {members.map((m) => {
            const st = memberState[m.code] ?? { grade: null, wentWell: "", improve: "" };
            return (
              <div key={m.code} className="rounded-lg border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-slate-900">{m.name}</div>
                  <StarRating value={st.grade} onChange={(v) => setMember(m.code, { grade: v })} />
                </div>
                <Field
                  label="What went well?"
                  value={st.wentWell}
                  onChange={(v) => setMember(m.code, { wentWell: v })}
                />
                <Field
                  label="What could be improved?"
                  value={st.improve}
                  onChange={(v) => setMember(m.code, { improve: v })}
                />
              </div>
            );
          })}
        </section>
      ) : null}

      {error ? (
        <div className="rounded-md bg-red-50 p-2.5 text-sm text-red-700">{error}</div>
      ) : null}

      <Button
        tone="primary"
        size="md"
        onClick={submit}
        disabled={saving}
        className="w-full py-2.5 font-semibold"
      >
        {saving ? "Submitting…" : "Submit feedback"}
      </Button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="mt-3 block">
      <span className="block text-[11px] uppercase tracking-wide font-medium text-slate-500">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
      />
    </label>
  );
}
