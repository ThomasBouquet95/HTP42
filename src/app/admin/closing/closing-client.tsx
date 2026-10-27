"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SegmentedTabs } from "@/components/filters";
import { DatePopover, MonthPopover } from "@/components/date-picker";
import { UI, moneyToneClass } from "@/lib/ui";
import type { ClosingModel, ClosingRow, StepState } from "@/lib/closing";
import type { MonthStatus } from "@/lib/closing-store";

const eur = (v: number | null | undefined) =>
  v == null ? "—" : `€${Math.round(v).toLocaleString("en-US")}`;
const href = (m: string) => `/admin/closing?month=${m}`;

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ---- Modern hover tooltip (portal + fixed positioning, never clipped) ------
function Tip({ label, children, wide }: { label: ReactNode; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const show = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top });
  };
  return (
    <span ref={ref} className="relative inline-flex" onMouseEnter={show} onMouseLeave={() => setPos(null)}>
      {children}
      {pos && typeof document !== "undefined"
        ? createPortal(
            <span
              role="tooltip"
              style={{ position: "fixed", left: pos.x, top: pos.y - 8, transform: "translate(-50%, -100%)" }}
              className={`pointer-events-none z-50 block whitespace-normal rounded-lg bg-slate-900 px-2.5 py-1.5 text-left text-[11px] font-normal leading-snug text-white shadow-xl ring-1 ring-black/5 ${
                wide ? "w-64" : "w-max max-w-[15rem]"
              }`}
            >
              {label}
              <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
function HeaderTip({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <Tip label={label} wide>
      <span className="cursor-help underline decoration-dotted decoration-slate-300 underline-offset-2">
        {children}
      </span>
    </Tip>
  );
}

// ---- Pipeline step chip ----------------------------------------------------
const STATE_LABEL: Record<StepState, string> = {
  done: "Done",
  partial: "Partial",
  pending: "Pending",
  na: "Not applicable",
};
const STEP_DESC = {
  submitted: "Timesheets submitted for the month",
  validated: "Timesheets validated (approved by the reviewer)",
  memberInvoice: "Invoice received from the network member",
  clientInvoiceSent: "Client invoice issued & sent to the client (project level)",
  collected: "Client invoice collected — paid or matched in Qonto (project level)",
  memberPaid: "The network member's invoice has been paid",
} as const;

function CheckSvg() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function DashSvg() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
      <path d="M6 12h12" strokeLinecap="round" />
    </svg>
  );
}

function StepBadge({ state, late }: { state: StepState; late?: boolean }) {
  if (state === "na") return <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-200" />;
  const ring = late ? "ring-2 ring-rose-300 ring-offset-1" : "";
  if (state === "done")
    return (
      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white ${ring}`}>
        <CheckSvg />
      </span>
    );
  if (state === "partial")
    return (
      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-white ${ring}`}>
        <DashSvg />
      </span>
    );
  return (
    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white ${ring}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
    </span>
  );
}

function StepCell({ state, late, desc, leftBorder }: { state: StepState; late?: boolean; desc: string; leftBorder?: boolean }) {
  return (
    <td className={`px-3 py-2.5 text-center ${leftBorder ? "border-l border-slate-100" : ""}`}>
      <Tip
        label={
          <>
            <b className="block">{desc}</b>
            <span className={late ? "text-rose-300" : "text-white/80"}>
              {STATE_LABEL[state]}
              {late ? " · overdue" : ""}
            </span>
          </>
        }
        wide
      >
        <span className="inline-flex cursor-help align-middle">
          <StepBadge state={state} late={late} />
        </span>
      </Tip>
    </td>
  );
}

export function ClosingClient({
  model,
  month,
  currentMonth,
  availableMonths,
  monthStatus,
}: {
  model: ClosingModel;
  month: string;
  currentMonth: string;
  availableMonths: string[];
  monthStatus: MonthStatus;
}) {
  const router = useRouter();
  const [view, setView] = useState<"member" | "client">("member");

  return (
    <div className="space-y-4">
      {/* Control bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="uppercase tracking-wide">Month</span>
          <MonthPopover
            value={month}
            onChange={(v) => {
              if (/^\d{4}-\d{2}$/.test(v)) router.push(href(v));
            }}
          />
          {month !== currentMonth ? (
            <button
              type="button"
              onClick={() => router.push(href(currentMonth))}
              className="font-medium text-brand-700 hover:underline"
            >
              This month
            </button>
          ) : null}
        </div>
        <MonthStatusEditor month={month} initial={monthStatus} />
      </div>

      {/* KPI strip — one card, uniform type scale, semantic colors */}
      <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
        <Stat label="Active lines" value={String(model.totals.members)} />
        <Stat label="Client invoiced" value={eur(model.totals.clientInvoicedEur)} color={UI.revenue} money />
        <Stat label="Collected" value={eur(model.totals.clientCollectedEur)} color={UI.collected} money />
        <Stat label="Member cost" value={eur(model.totals.memberInvoicedEur)} color={UI.cost} money />
        <Stat
          label="Margin"
          value={eur(model.totals.marginEur)}
          color={model.totals.marginEur < 0 ? UI.marginNeg : UI.margin}
          money
        />
        <Stat
          label="Attention"
          value={`${model.totals.lateRows + model.totals.staffedNoHours}`}
          color={model.totals.lateRows > 0 ? UI.cost : UI.warn}
          sub={`${model.totals.lateRows} late · ${model.totals.staffedNoHours} no hrs`}
        />
      </div>

      {/* View toggle + legend */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          value={view}
          onChange={setView}
          ariaLabel="Closing view"
          options={[
            { value: "member", label: "By member" },
            { value: "client", label: "By client" },
          ]}
        />
        <Legend />
      </div>

      {model.rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <div className="text-sm font-medium text-slate-700">No active members for {monthLabel(month)}</div>
          <p className="mt-1 text-xs text-slate-500">
            Nothing is staffed or logged in this month yet.
            {availableMonths.length ? (
              <>
                {" "}
                Latest data is in{" "}
                <Link href={href(availableMonths[0])} className="font-medium text-brand-700 hover:underline">
                  {monthLabel(availableMonths[0])}
                </Link>
                .
              </>
            ) : null}
          </p>
        </div>
      ) : view === "member" ? (
        <MemberTable model={model} month={month} />
      ) : (
        <ClientView model={model} />
      )}

      <Caveats />
    </div>
  );
}

// ---- By-member table -------------------------------------------------------
function MemberTable({ model, month }: { model: ClosingModel; month: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full border-separate border-spacing-0 text-xs">
        <thead>
          {/* Group row */}
          <tr className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            <th rowSpan={2} className="sticky left-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-2 text-left align-bottom">
              Member · project
            </th>
            <th rowSpan={2} className="border-b border-slate-200 px-2 py-2 text-right align-bottom">Hours</th>
            <th colSpan={6} className="border-b border-l border-slate-200 px-2 py-1.5 text-center text-slate-500">
              Billing pipeline
            </th>
            <th colSpan={3} className="border-b border-l border-slate-200 px-2 py-1.5 text-center text-slate-500">
              Amounts · EUR
            </th>
            <th rowSpan={2} className="border-b border-l border-slate-200 px-2 py-2 text-center align-bottom">SOW</th>
            <th rowSpan={2} className="border-b border-l border-slate-200 px-3 py-2 text-left align-bottom">
              Follow-up
            </th>
          </tr>
          {/* Column row */}
          <tr className="bg-slate-50 text-[11px] font-medium text-slate-500 [&>th]:border-b [&>th]:border-slate-200 [&>th]:py-1.5">
            <th className="border-l border-slate-200 px-3 text-center"><HeaderTip label={STEP_DESC.submitted}>Subm.</HeaderTip></th>
            <th className="px-3 text-center"><HeaderTip label={STEP_DESC.validated}>Valid.</HeaderTip></th>
            <th className="px-3 text-center"><HeaderTip label={STEP_DESC.memberInvoice}>Mbr inv</HeaderTip></th>
            <th className="px-3 text-center"><HeaderTip label={STEP_DESC.clientInvoiceSent}>Cli sent</HeaderTip></th>
            <th className="px-3 text-center"><HeaderTip label={STEP_DESC.collected}>Cashed</HeaderTip></th>
            <th className="px-3 text-center"><HeaderTip label={STEP_DESC.memberPaid}>Mbr paid</HeaderTip></th>
            <th className="border-l border-slate-200 px-2 text-right"><HeaderTip label="Client invoiced on this project this month (project level, EUR).">Client</HeaderTip></th>
            <th className="px-2 text-right"><HeaderTip label="EUR amount of this member's invoice for the month.">Member</HeaderTip></th>
            <th className="px-2 text-right"><HeaderTip label="HTP42 margin on the project this month: client invoiced − member invoices (project level).">Margin</HeaderTip></th>
          </tr>
        </thead>
        <tbody>
          {model.rows.map((r, i) => (
            <MemberRow key={r.key} r={r} month={month} zebra={i % 2 === 1} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MemberRow({ r, month, zebra }: { r: ClosingRow; month: string; zebra: boolean }) {
  const tint = r.staffedNoHours
    ? "bg-amber-50/50"
    : r.lateSteps.length > 0
      ? "bg-rose-50/40"
      : zebra
        ? "bg-slate-50/40"
        : "bg-white";
  return (
    <tr className={`align-top ${tint} [&>td]:border-b [&>td]:border-slate-100`}>
      <td className={`sticky left-0 z-10 px-3 py-2.5 ${tint}`}>
        <div className="font-medium text-slate-800 demo-blur">{r.memberName}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] text-slate-400">
          <span className="truncate">{r.projectName}</span>
          <span className="font-mono text-slate-300">{r.projectCode}</span>
          <span className="text-slate-300">·</span>
          <span>{r.clientName}</span>
        </div>
        {r.staffedNoHours ? (
          <Tip label="Staffed and active this month but no hours logged — absence, paused mission, or forgotten?" wide>
            <span className="mt-1 inline-flex cursor-help items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
              no hours
            </span>
          </Tip>
        ) : null}
      </td>
      <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">
        {r.submittedHours > 0 ? (
          <>
            {r.submittedHours}h
            {r.validatedHours < r.submittedHours ? (
              <span className="text-amber-600"> ({r.validatedHours}✓)</span>
            ) : null}
          </>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
      <StepCell state={r.steps.submitted} late={r.lateSteps.includes("submitted")} desc={STEP_DESC.submitted} leftBorder />
      <StepCell state={r.steps.validated} late={r.lateSteps.includes("validated")} desc={STEP_DESC.validated} />
      <StepCell state={r.steps.memberInvoice} late={r.lateSteps.includes("memberInvoice")} desc={STEP_DESC.memberInvoice} />
      <StepCell state={r.steps.clientInvoiceSent} late={r.lateSteps.includes("clientInvoiceSent")} desc={STEP_DESC.clientInvoiceSent} />
      <StepCell state={r.steps.collected} late={r.lateSteps.includes("collected")} desc={STEP_DESC.collected} />
      <StepCell state={r.steps.memberPaid} late={r.lateSteps.includes("memberPaid")} desc={STEP_DESC.memberPaid} />
      <td className="border-l border-slate-100 px-2 py-2.5 text-right tabular-nums demo-blur" style={{ color: r.clientInvoicedEur > 0 ? UI.revenue : undefined }}>
        <span className={r.clientInvoicedEur > 0 ? "" : "text-slate-300"}>{eur(r.clientInvoicedEur)}</span>
      </td>
      <td className="px-2 py-2.5 text-right tabular-nums demo-blur" style={{ color: r.memberInvoiceEur ? UI.cost : undefined }}>
        <span className={r.memberInvoiceEur ? "" : "text-slate-300"}>{eur(r.memberInvoiceEur)}</span>
      </td>
      <td className="px-2 py-2.5 text-right tabular-nums font-medium demo-blur">
        <span className={moneyToneClass(r.projectMarginEur)}>{eur(r.projectMarginEur)}</span>
      </td>
      <td className="border-l border-slate-100 px-2 py-2.5 text-center">
        {r.sowValidForMonth === false ? (
          <Tip label={`SOW / Work Order not valid for this month${r.sowStatus ? ` (status: ${r.sowStatus})` : ""} — don't invoice on an expired contract.`} wide>
            <span className="cursor-help rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">⚠</span>
          </Tip>
        ) : r.sowValidForMonth === true ? (
          <Tip label={`SOW valid for the month${r.sowStatus ? ` (status: ${r.sowStatus})` : ""}.`} wide>
            <span className="cursor-help text-emerald-500">✓</span>
          </Tip>
        ) : (
          <Tip label="SOW validity unknown (no dates on the staffing)." wide>
            <span className="cursor-help text-slate-300">?</span>
          </Tip>
        )}
      </td>
      <td className="border-l border-slate-100 px-3 py-2.5">
        <LineEditor r={r} month={month} />
      </td>
    </tr>
  );
}

// Inline editable comment + last-reminder date, saved on blur/change.
function LineEditor({ r, month }: { r: ClosingRow; month: string }) {
  const [comment, setComment] = useState(r.comment);
  const [reminder, setReminder] = useState(r.lastReminderDate ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save(next: { comment: string; lastReminderDate: string }) {
    setState("saving");
    try {
      const res = await fetch("/api/admin/closing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "line",
          month,
          projectCode: r.projectCode,
          memberCode: r.memberCode,
          comment: next.comment,
          lastReminderDate: next.lastReminderDate || null,
        }),
      });
      if (!res.ok) throw new Error();
      setState("saved");
      setTimeout(() => setState("idle"), 1500);
    } catch {
      setState("error");
    }
  }

  return (
    <div className="min-w-[15rem] space-y-1.5">
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onBlur={() => {
          if (comment !== r.comment) save({ comment, lastReminderDate: reminder });
        }}
        rows={1}
        placeholder="Follow-up note…"
        className="w-full resize-y rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-700 placeholder:text-slate-300 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      <div className="flex items-center gap-2">
        <Tip label="The last time you chased this line — reminded the member to invoice, or the client to pay. For tracking only." wide>
          <span className="cursor-help text-[10px] uppercase tracking-wide text-slate-400">Last chased</span>
        </Tip>
        <div className="w-36 shrink-0">
          <DatePopover
            value={reminder}
            onChange={(v) => {
              setReminder(v);
              save({ comment, lastReminderDate: v });
            }}
            placeholder="Pick a date"
            allowFreeText={false}
          />
        </div>
        <SaveState state={state} />
      </div>
    </div>
  );
}

function SaveState({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  if (state === "idle") return null;
  return (
    <span className="text-[10px]">
      {state === "saving" ? (
        <span className="text-slate-400">saving…</span>
      ) : state === "saved" ? (
        <span className="text-emerald-600">✓ saved</span>
      ) : (
        <span className="text-rose-600">save failed</span>
      )}
    </span>
  );
}

// ---- By-client rollup ------------------------------------------------------
function ClientView({ model }: { model: ClosingModel }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {model.clients.map((c) => (
        <div key={c.clientCode} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-slate-900 demo-blur">{c.clientName}</div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                {c.memberCount} member{c.memberCount === 1 ? "" : "s"} · {c.projectCount} project
                {c.projectCount === 1 ? "" : "s"}
              </div>
            </div>
            {c.poRemainingEur != null ? (
              <Tip label="Purchase-order headroom remaining across this client's projects. ⚠ when nearly exhausted." wide>
                <span
                  className={`cursor-help rounded-md px-2 py-1 text-[10px] font-medium ${
                    c.poLow ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200" : "bg-slate-50 text-slate-500 ring-1 ring-slate-200"
                  }`}
                >
                  PO left {eur(c.poRemainingEur)}
                  {c.poLow ? " ⚠" : ""}
                </span>
              </Tip>
            ) : null}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 rounded-lg bg-slate-50/70 p-2 text-center">
            <Mini label="Invoiced" value={eur(c.clientInvoicedEur)} tone={UI.revenue} />
            <Mini label="Collected" value={eur(c.clientCollectedEur)} tone={UI.collected} />
            <Mini label="Cost" value={eur(c.memberInvoicedEur)} tone={UI.cost} />
            <Mini label="Margin" value={eur(c.marginEur)} tone={c.marginEur < 0 ? UI.marginNeg : UI.margin} />
          </div>
          <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-2.5 text-[11px]">
            {c.rows.map((r) => (
              <li key={r.key} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-slate-600 demo-blur" title={`${r.memberName} · ${r.projectName}`}>
                  {r.memberName} <span className="text-slate-400">· {r.projectName}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {r.staffedNoHours ? (
                    <Tip label="Staffed, no hours this month." wide>
                      <span className="h-1.5 w-1.5 cursor-help rounded-full bg-amber-500" />
                    </Tip>
                  ) : null}
                  {r.lateSteps.length > 0 ? (
                    <Tip label={`Overdue: ${r.lateSteps.join(", ")}`} wide>
                      <span className="h-1.5 w-1.5 cursor-help rounded-full bg-rose-500" />
                    </Tip>
                  ) : null}
                  <span className="tabular-nums text-slate-400">{r.submittedHours}h</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ---- Small bits ------------------------------------------------------------
function Stat({
  label,
  value,
  color,
  sub,
  money,
}: {
  label: string;
  value: string;
  color?: string;
  sub?: string;
  money?: boolean;
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-400">
        {color ? <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} /> : null}
        {label}
      </div>
      <div
        className={`mt-1 text-lg font-semibold tabular-nums ${money ? "demo-blur" : ""}`}
        style={color ? { color } : undefined}
      >
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-[10px] text-slate-400">{sub}</div> : null}
    </div>
  );
}
function Mini({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-xs font-semibold tabular-nums demo-blur" style={{ color: tone }}>
        {value}
      </div>
    </div>
  );
}
function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
      <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> done</span>
      <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> partial</span>
      <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border border-slate-300 bg-white" /> pending</span>
      <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full ring-2 ring-rose-300" /> overdue</span>
    </div>
  );
}

function MonthStatusEditor({ month, initial }: { month: string; initial: MonthStatus }) {
  const [status, setStatus] = useState<MonthStatus["status"]>(initial.status);
  const [comment, setComment] = useState(initial.comment);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save(next: MonthStatus) {
    setState("saving");
    try {
      const res = await fetch("/api/admin/closing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "status", month, status: next.status, comment: next.comment }),
      });
      if (!res.ok) throw new Error();
      setState("saved");
      setTimeout(() => setState("idle"), 1500);
    } catch {
      setState("error");
    }
  }

  const dot =
    status === "Done" ? "bg-emerald-500" : status === "In progress" ? "bg-amber-500" : "bg-slate-300";

  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm">
      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Close</span>
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <select
        value={status}
        onChange={(e) => {
          const next = e.target.value as MonthStatus["status"];
          setStatus(next);
          save({ status: next, comment });
        }}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-brand-500 focus:outline-none"
      >
        <option value="">Not started</option>
        <option value="In progress">In progress</option>
        <option value="Done">Done</option>
      </select>
      <input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onBlur={() => {
          if (comment !== initial.comment) save({ status, comment });
        }}
        placeholder="Close note…"
        className="w-36 rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      <SaveState state={state} />
    </div>
  );
}

function Caveats() {
  return (
    <details className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-[11px] text-slate-500">
      <summary className="cursor-pointer font-medium text-slate-600">What this tracks (and what's not in yet)</summary>
      <div className="mt-2 space-y-1.5 leading-relaxed">
        <p>
          One line per network member active on a project this month (staffed, or with timesheets /
          invoices). Timesheet hours count in the month of the week's <b>Friday</b> (the cutoff).
        </p>
        <p>
          <b>Cli sent / Cashed</b> and <b>Margin</b> are tracked at <b>project</b> level (a client
          invoice usually bundles a project, not one member), shown per line for context and rolled up
          in the By client view. <b>Cashed</b> = payment marked Paid or matched to a Qonto transaction.
        </p>
        <p>
          <b>Overdue</b> (red ring) uses default targets after month end: submitted J+2, validated J+4,
          client invoice J+5, member invoice J+7. <b>SOW</b> shows ⚠ when the staffing's SOW looks
          expired or missing for the month.
        </p>
        <p className="text-slate-400">
          Not wired yet (need a data source / a decision): rebillable expenses (entered / approved /
          rebilled), fixed-price milestone tracking, and automatic carry-over of unresolved lines
          from the previous month.
        </p>
      </div>
    </details>
  );
}
