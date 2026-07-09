"use client";

import { useEffect, useMemo, useState } from "react";
import { StarRating } from "@/components/star-rating";
import { SearchInput } from "@/components/search-input";

export type MemberReview = {
  surveyId: string;
  projectCode: string;
  projectName: string;
  recipientName: string;
  recipientEmail: string;
  completedAt: string | null;
  grade: number | null;
  wentWell: string;
  improve: string;
};

export type MemberReviewData = {
  code: string;
  name: string;
  photo: string | null;
  reviews: MemberReview[];
};

export function MemberReviewsClient({
  members,
  initialCode,
}: {
  members: MemberReviewData[];
  initialCode: string | null;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(initialCode);

  // Precompute rating stats per member.
  const enriched = useMemo(
    () =>
      members.map((m) => {
        const grades = m.reviews.map((r) => r.grade).filter((g): g is number => g != null);
        return { ...m, count: m.reviews.length, graded: grades.length, avg: avg(grades) };
      }),
    [members],
  );

  // Left list: reviewed members first (most reviews), then the rest by name.
  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched
      .filter((m) => !q || m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [enriched, search]);

  const current = useMemo(
    () => enriched.find((m) => m.code === selected) ?? null,
    [enriched, selected],
  );

  // Keep the URL in sync so the selection is shareable / linkable, without a
  // server round-trip.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selected) url.searchParams.set("member", selected);
    else url.searchParams.delete("member");
    window.history.replaceState(null, "", url.toString());
  }, [selected]);

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      {/* Left: member list */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search members…"
            className="w-full"
          />
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {sorted.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">No members match.</div>
          ) : (
            sorted.map((m) => {
              const active = m.code === selected;
              return (
                <button
                  key={m.code}
                  type="button"
                  onClick={() => setSelected(m.code)}
                  className={`flex w-full items-center gap-2.5 border-b border-slate-50 px-3 py-2 text-left transition-colors ${
                    active ? "bg-brand-50" : "hover:bg-slate-50"
                  }`}
                >
                  <Avatar name={m.name} photo={m.photo} />
                  <div className="min-w-0 flex-1">
                    <div
                      className={`truncate text-xs font-medium demo-blur ${active ? "text-brand-800" : "text-slate-800"}`}
                    >
                      {m.name}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {m.count === 0
                        ? "No reviews"
                        : `${m.count} review${m.count === 1 ? "" : "s"}`}
                    </div>
                  </div>
                  {m.avg != null ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-100">
                      <StarGlyph /> {m.avg.toFixed(1)}
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right: selected member's reviews */}
      <div className="min-w-0">
        {!current ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-400">
            Select a member on the left to see their client reviews.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
              <Avatar name={current.name} photo={current.photo} size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-900 demo-blur">
                  {current.name}
                </div>
                <div className="text-[11px] text-slate-500">
                  {current.graded > 0
                    ? `${current.graded} rating${current.graded === 1 ? "" : "s"} from clients`
                    : "No client ratings yet"}
                </div>
              </div>
              {current.avg != null ? (
                <div className="shrink-0 text-right">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">Average</div>
                  <StarRating value={current.avg} readOnly size={18} />
                </div>
              ) : null}
            </div>

            {current.reviews.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                No client reviews for {current.name} yet.
              </div>
            ) : (
              <div className="space-y-3">
                {current.reviews
                  .slice()
                  .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))
                  .map((r) => (
                    <div
                      key={r.surveyId}
                      className="rounded-lg border border-slate-200 bg-white p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-900 demo-blur">
                            <span className="font-mono text-xs text-slate-500">{r.projectCode}</span>{" "}
                            {r.projectName}
                          </div>
                          <div className="truncate text-[11px] text-slate-500 demo-blur">
                            {r.recipientName || r.recipientEmail || "Client"}
                            {r.completedAt ? ` · ${fmtDate(r.completedAt)}` : ""}
                          </div>
                        </div>
                        <div className="shrink-0">
                          <StarRating value={r.grade} readOnly size={14} />
                        </div>
                      </div>
                      {r.wentWell || r.improve ? (
                        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-xs">
                          <Comment label="What went well" text={r.wentWell} />
                          <Comment label="What could be improved" text={r.improve} />
                        </div>
                      ) : null}
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Comment({ label, text }: { label: string; text: string }) {
  if (!text) return null;
  return (
    <div>
      <span className="text-slate-400">{label}: </span>
      <span className="whitespace-pre-line text-slate-700 demo-blur">{text}</span>
    </div>
  );
}

function Avatar({ name, photo, size = 34 }: { name: string; photo: string | null; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-[10px] font-semibold text-slate-600"
      style={{ height: size, width: size }}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="h-full w-full object-cover" />
      ) : (
        initials(name)
      )}
    </div>
  );
}

function StarGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="#f59e0b" aria-hidden>
      <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.9 6.19 20.9l1.11-6.47-4.7-4.58 6.5-.95z" />
    </svg>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 10) / 10;
}
