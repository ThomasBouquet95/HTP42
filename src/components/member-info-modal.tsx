"use client";

import { useEffect, useState } from "react";

type PublicMember = {
  id: string;
  memberCode: string;
  fullName: string;
  email: string;
  title: string;
  role: string;
  status: string;
  country: string;
  phone: string;
  legalEntity: string;
  introduction: string;
  photoUrl: string | null;
  cv: { url: string; filename: string } | null;
};

type Props = {
  // Pass a member record id when open; null closes the modal.
  memberId: string | null;
  // Optional initial preview shown while the API call resolves.
  preview?: { fullName?: string; memberCode?: string; photoUrl?: string | null };
  onClose: () => void;
};

export function MemberInfoModal({ memberId, preview, onClose }: Props) {
  const [data, setData] = useState<PublicMember | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!memberId) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/members/${encodeURIComponent(memberId)}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          member?: PublicMember;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.member) {
          throw new Error(body.error ?? `Couldn't load member (HTTP ${res.status})`);
        }
        setData(body.member);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load member.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  useEffect(() => {
    if (!memberId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [memberId, onClose]);

  if (!memberId) return null;

  // Prefer fresh data; fall back to preview while loading.
  const photoUrl = data?.photoUrl ?? preview?.photoUrl ?? null;
  const fullName = data?.fullName ?? preview?.fullName ?? "";
  const memberCode = data?.memberCode ?? preview?.memberCode ?? "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 px-3 py-6 sm:items-center sm:py-10"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-700">Network member</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="p-5 space-y-4">
          {error ? (
            <div className="rounded-md bg-red-50 p-2.5 text-xs text-red-700">{error}</div>
          ) : null}
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-brand-50 text-brand-700 flex items-center justify-center text-base font-semibold ring-2 ring-white shadow-sm">
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span>{initials(fullName || memberCode)}</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-base font-semibold text-slate-900 truncate">
                {fullName || (loading ? "Loading…" : "—")}
              </div>
              {memberCode ? (
                <div className="font-mono text-[11px] text-slate-500">{memberCode}</div>
              ) : null}
              {data?.title ? (
                <div className="mt-0.5 text-sm text-slate-700">{data.title}</div>
              ) : null}
            </div>
          </div>

          {data ? (
            <>
              {data.introduction ? (
                <p className="text-xs text-slate-600 whitespace-pre-wrap">{data.introduction}</p>
              ) : null}
              <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5 text-xs">
                <Row label="Network role" value={data.role} />
                <Row label="Status" value={data.status} />
                <Row
                  label="Email"
                  value={data.email}
                  href={data.email ? `mailto:${data.email}` : undefined}
                  mono
                />
                <Row label="Phone" value={data.phone} href={data.phone ? `tel:${data.phone}` : undefined} />
                <Row label="Country" value={data.country} />
                <Row label="Legal entity" value={data.legalEntity} />
              </dl>
              {data.cv ? (
                <a
                  href={data.cv.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  <DocIcon />
                  View CV
                  <span className="text-slate-400">({data.cv.filename})</span>
                </a>
              ) : null}
            </>
          ) : loading ? (
            <div className="text-xs text-slate-500">Loading details…</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  href,
  mono,
}: {
  label: string;
  value: string;
  href?: string;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <>
      <dt className="text-slate-500 whitespace-nowrap">{label}</dt>
      <dd className={`text-slate-800 break-words ${mono ? "font-mono" : ""}`}>
        {href ? (
          <a href={href} className="text-brand-700 hover:underline">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </>
  );
}

function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" strokeLinejoin="round" />
      <path d="M14 3v6h6" strokeLinejoin="round" />
    </svg>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}
