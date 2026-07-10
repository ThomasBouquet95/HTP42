"use client";

import { useMemo, useState, type ReactNode } from "react";
import { StatusPill } from "@/components/badge";
import { effectiveEur } from "@/lib/fx";
import type { PaymentRecord } from "@/lib/airtable";

type LinkOpt = { id: string; code: string; name: string };

// Canonical status → bucket. Blank/legacy reads as "under review" (same rule
// the payments list uses), Canceled is excluded from totals.
type Bucket = "sent" | "committed" | "review" | "canceled";
const KNOWN = new Set(["Under Review", "Scheduled", "To be paid", "Paid", "Canceled"]);
function effStatus(s: string): string {
  return KNOWN.has(s) ? s : "Under Review";
}
function bucketOf(s: string): Bucket {
  const e = effStatus(s);
  if (e === "Paid") return "sent";
  if (e === "To be paid" || e === "Scheduled") return "committed";
  if (e === "Canceled") return "canceled";
  return "review";
}

const eur = (n: number) =>
  `€${Math.round(n).toLocaleString("en-US")}`;
const money = (v: number | null, ccy: string) =>
  v == null ? "—" : `${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}${ccy ? " " + ccy : ""}`;

function totals(list: PaymentRecord[]) {
  let sent = 0;
  let committed = 0;
  let review = 0;
  for (const p of list) {
    const e = effectiveEur(p);
    const b = bucketOf(p.paymentStatus);
    if (b === "sent") sent += e;
    else if (b === "committed") committed += e;
    else if (b === "review") review += e;
  }
  return { sent, committed, review };
}

// ---------------------------------------------------------------------------

export function PaymentsByProject({
  payments,
  projects,
  clients,
  members,
  onOpenReview,
}: {
  payments: PaymentRecord[];
  projects: LinkOpt[];
  clients: LinkOpt[];
  members: LinkOpt[];
  onOpenReview?: (memberId?: string) => void;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const clientsById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const projectCode = projects.find((p) => p.id === projectId)?.code ?? "";

  // Match by linked record id, falling back to the project code lookup so
  // legacy rows that only carry the code still show up.
  const rows = useMemo(
    () =>
      payments.filter(
        (p) => p.projectRecordIds.includes(projectId) || (!!projectCode && p.projectCodes.includes(projectCode)),
      ),
    [payments, projectId, projectCode],
  );
  const inflows = rows.filter((p) => p.direction === "Inflow");
  const outflows = rows.filter((p) => p.direction === "Outflow");
  const inT = totals(inflows);
  const outT = totals(outflows);

  const clientLabel = (p: PaymentRecord) =>
    p.clientRecordIds.map((id) => clientsById.get(id)?.name || clientsById.get(id)?.code).filter(Boolean).join(", ") ||
    p.clientCodes.join(", ") ||
    "—";
  const memberLabel = (p: PaymentRecord) =>
    p.memberRecordIds.map((id) => membersById.get(id)?.name || membersById.get(id)?.code).filter(Boolean).join(", ") ||
    p.beneficiary ||
    p.memberCodes.join(", ") ||
    "—";

  return (
    <div className="space-y-4">
      <Picker label="Project" value={projectId} onChange={setProjectId} options={projects} />

      {!projectId ? (
        <EmptyPanel>Select a project to see its cash flow.</EmptyPanel>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryCard title="Inflows (from clients)" tone="success" t={inT} />
            <SummaryCard title="Outflows (to members / vendors)" tone="danger" t={outT} />
            <NetCard received={inT.sent} sent={outT.sent} committedIn={inT.committed} committedOut={outT.committed} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Column
              title="Inflows"
              accent="success"
              rows={inflows}
              subtotalEur={inT.sent + inT.committed + inT.review}
              counterparty={clientLabel}
            />
            <Column
              title="Outflows"
              accent="danger"
              rows={outflows}
              subtotalEur={outT.sent + outT.committed + outT.review}
              counterparty={memberLabel}
              onReview={onOpenReview}
              reviewMemberIdFor={(p) =>
                bucketOf(p.paymentStatus) !== "sent" && bucketOf(p.paymentStatus) !== "canceled"
                  ? p.memberRecordIds[0] ?? undefined
                  : undefined
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function PaymentsByMember({
  payments,
  members,
  projects,
  onOpenReview,
}: {
  payments: PaymentRecord[];
  members: LinkOpt[];
  projects: LinkOpt[];
  onOpenReview?: (memberId?: string) => void;
}) {
  const [memberId, setMemberId] = useState(members[0]?.id ?? "");
  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const memberCode = members.find((m) => m.id === memberId)?.code ?? "";

  // Match by linked member record id or the member code lookup (legacy rows).
  const rows = useMemo(
    () =>
      payments.filter(
        (p) => p.memberRecordIds.includes(memberId) || (!!memberCode && p.memberCodes.includes(memberCode)),
      ),
    [payments, memberId, memberCode],
  );
  const t = totals(rows);
  const outstanding = rows.filter((p) => {
    const b = bucketOf(p.paymentStatus);
    return b === "committed" || b === "review";
  });
  const paid = rows.filter((p) => bucketOf(p.paymentStatus) === "sent");

  const projectLabel = (p: PaymentRecord) =>
    p.projectRecordIds.map((id) => projectsById.get(id)?.code).filter(Boolean).join(", ") ||
    p.projectCodes.join(", ") ||
    p.type ||
    "—";

  return (
    <div className="space-y-4">
      <Picker label="Member" value={memberId} onChange={setMemberId} options={members} />

      {!memberId ? (
        <EmptyPanel>Select a member to see what they&apos;re owed and paid.</EmptyPanel>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Paid (sent)" value={eur(t.sent)} tone="success" />
            <Stat label="Committed" value={eur(t.committed)} tone="warning" />
            <Stat label="Under review" value={eur(t.review)} tone="neutral" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Column
              title="Outstanding"
              accent="warning"
              rows={outstanding}
              subtotalEur={t.committed + t.review}
              counterparty={projectLabel}
              onReview={onOpenReview}
              reviewMemberIdFor={() => memberId || undefined}
            />
            <Column
              title="Paid"
              accent="success"
              rows={paid}
              subtotalEur={t.sent}
              counterparty={projectLabel}
            />
          </div>
        </>
      )}
    </div>
  );
}

// --- shared bits ------------------------------------------------------------

function Picker({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: LinkOpt[];
}) {
  const sorted = useMemo(
    () => [...options].sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name)),
    [options],
  );
  return (
    <label className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 max-w-[22rem] rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-800 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
      >
        {sorted.map((o) => (
          <option key={o.id} value={o.id}>
            {o.code}
            {o.name && o.name !== o.code ? ` · ${o.name}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function SummaryCard({
  title,
  tone,
  t,
}: {
  title: string;
  tone: "success" | "danger";
  t: { sent: number; committed: number; review: number };
}) {
  // Green for inflows, reddish for outflows — same colour family as the
  // direction pills / cards on the Payments tab.
  const card =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50"
      : "border-rose-200 bg-rose-50";
  const label = tone === "success" ? "text-emerald-700/70" : "text-rose-700/70";
  const value = tone === "success" ? "text-emerald-800" : "text-rose-800";
  const sub = tone === "success" ? "text-emerald-700/80" : "text-rose-700/80";
  return (
    <div className={`rounded-lg border p-3 ${card}`}>
      <div className={`text-[10px] uppercase tracking-wide ${label}`}>{title}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums demo-blur ${value}`}>
        {eur(t.sent)} <span className="text-[11px] font-normal opacity-70">sent</span>
      </div>
      <div className={`mt-0.5 text-[11px] demo-blur ${sub}`}>
        {eur(t.committed)} committed · {eur(t.review)} under review
      </div>
    </div>
  );
}

function NetCard({
  received,
  sent,
  committedIn,
  committedOut,
}: {
  received: number;
  sent: number;
  committedIn: number;
  committedOut: number;
}) {
  const net = received - sent;
  const projected = received + committedIn - (sent + committedOut);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">Net (received − sent)</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums demo-blur ${net >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
        {eur(net)}
      </div>
      <div className="mt-0.5 text-[11px] text-slate-500 demo-blur">
        {eur(projected)} projected (incl. committed)
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "neutral" }) {
  const color = tone === "success" ? "text-emerald-700" : tone === "warning" ? "text-amber-700" : "text-slate-900";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums demo-blur ${color}`}>{value}</div>
    </div>
  );
}

function Column({
  title,
  accent,
  rows,
  subtotalEur,
  counterparty,
  onReview,
  reviewMemberIdFor,
}: {
  title: string;
  accent: "success" | "danger" | "warning";
  rows: PaymentRecord[];
  subtotalEur: number;
  counterparty: (p: PaymentRecord) => string;
  onReview?: (memberId?: string) => void;
  reviewMemberIdFor?: (p: PaymentRecord) => string | undefined;
}) {
  const dot = accent === "success" ? "bg-emerald-500" : accent === "danger" ? "bg-rose-500" : "bg-amber-500";
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const sorted = [...rows].sort((a, b) =>
    (b.paymentDate ?? b.dueDate ?? b.invoiceDate ?? "").localeCompare(
      a.paymentDate ?? a.dueDate ?? a.invoiceDate ?? "",
    ),
  );
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
          <span className={`h-2 w-2 rounded-full ${dot}`} />
          {title} <span className="text-slate-400">· {rows.length}</span>
        </div>
        <div className="text-xs tabular-nums text-slate-500 demo-blur">{eur(subtotalEur)}</div>
      </div>
      {sorted.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-slate-400">Nothing here.</p>
      ) : (
        <ul>
          {sorted.map((p) => {
            const isOpen = open.has(p.id);
            const reviewMemberId = reviewMemberIdFor?.(p);
            return (
              <li key={p.id} className="border-t border-slate-100 text-xs first:border-t-0">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggle(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(p.id); }
                  }}
                  aria-expanded={isOpen}
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-slate-50"
                >
                  <svg
                    viewBox="0 0 12 12"
                    className={`h-3 w-3 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    aria-hidden
                  >
                    <path d="M4.5 3 7.5 6 4.5 9" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-slate-800 demo-blur">{counterparty(p)}</div>
                    <div className="text-[10px] text-slate-400">
                      <span className="font-mono">{p.paymentCode || "—"}</span>
                      {p.invoiceReference ? ` · ${p.invoiceReference}` : ""}
                      {p.paymentDate ? ` · paid ${p.paymentDate}` : p.dueDate ? ` · due ${p.dueDate}` : ""}
                    </div>
                  </div>
                  <div className="whitespace-nowrap text-right tabular-nums text-slate-700 demo-blur">
                    {money(p.invoiceValue, p.invoiceCurrency)}
                  </div>
                  <StatusPill status={effStatus(p.paymentStatus)} />
                </div>
                {isOpen ? (
                  <div className="bg-slate-50/60 px-3 pb-2.5 pl-8">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-3">
                      <Detail label="Type" value={p.type || "—"} />
                      <Detail label="Amount (EUR)" value={eur(effectiveEur(p))} blur />
                      <Detail label="Invoice ref" value={p.invoiceReference || "—"} />
                      <Detail label="Invoice date" value={p.invoiceDate ?? "—"} />
                      <Detail label="Due date" value={p.dueDate ?? "—"} />
                      <Detail label="Payment date" value={p.paymentDate ?? "—"} />
                    </dl>
                    {p.comment ? (
                      <p className="mt-1 text-[11px] text-slate-500 demo-blur">{p.comment}</p>
                    ) : null}
                    <div className="mt-2 flex items-center gap-3">
                      <a
                        href={`/admin/payments?search=${encodeURIComponent(p.paymentCode)}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-[11px] font-medium text-brand-600 hover:text-brand-700"
                      >
                        Open in Payments →
                      </a>
                      {onReview && reviewMemberId ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onReview(reviewMemberId); }}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 hover:text-amber-800"
                        >
                          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                            <path d="M2 4.5h12M2 8h12M2 11.5h7" strokeLinecap="round" />
                            <path d="M11 11.5l1.5 1.5L15 10" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          Review
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Detail({ label, value, blur }: { label: string; value: string; blur?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`text-slate-700 ${blur ? "demo-blur" : ""}`}>{value}</dd>
    </div>
  );
}

function EmptyPanel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-400">
      {children}
    </div>
  );
}
