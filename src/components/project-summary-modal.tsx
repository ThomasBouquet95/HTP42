"use client";

import { useEffect, useState } from "react";
import type { ProjectSummary } from "@/lib/airtable";
import { ProjectSummaryView } from "@/app/timesheets/team/project-summary-view";

type Props = {
  // Project code to fetch a summary for. `null` closes the modal.
  projectCode: string | null;
  projectName?: string;
  onClose: () => void;
};

export function ProjectSummaryModal({ projectCode, projectName, onClose }: Props) {
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state every time the user opens a different project so we don't
  // briefly flash stale data while the fetch is in flight.
  useEffect(() => {
    if (!projectCode) {
      setSummary(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    setSummary(null);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/summary`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(d.error ?? `Couldn't load summary (HTTP ${res.status}).`);
        }
        const data = (await res.json()) as { summary: ProjectSummary };
        if (!cancelled) setSummary(data.summary);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load summary.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectCode]);

  useEffect(() => {
    if (!projectCode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [projectCode, onClose]);

  if (!projectCode) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 px-3 py-6 sm:items-start sm:py-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-summary-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-6xl rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 id="project-summary-title" className="text-sm font-semibold text-slate-900">
            Project summary
            <span className="ml-2 font-mono text-[11px] text-slate-500">{projectCode}</span>
            {projectName ? (
              <span className="ml-2 text-xs font-normal text-slate-600">{projectName}</span>
            ) : null}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4">
          {loading ? (
            <div className="text-center text-sm text-slate-500 py-10">Loading project summary…</div>
          ) : error ? (
            <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
          ) : summary ? (
            <ProjectSummaryView summary={summary} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
