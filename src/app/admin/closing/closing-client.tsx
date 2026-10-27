"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SegmentedTabs } from "@/components/filters";
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
const STEP_META: Record<StepState, string> = {
  done: "bg-emerald-500",
  partial: "bg-amber-400",
  pending: "bg-slate-200",
  na: "",
};
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

function StepCell({ state, late, desc }: { state: StepState; late?: boolean; desc: string }) {
  const tip = (
    <>
      <b className="block">{desc}</b>
      <span className={late ? "text-rose-300" : "text-white/80"}>
        {STATE_LABEL[state]}
        {late ? " · overdue" : ""}
      </span>
    </>
  );
  return (
    <td className="px-2 py-2.5 text-center">
      <Tip label={tip} wide>
        {state === "na" ? (
          <span className="text-slate-300">·</span>
        ) : (
          <span
            className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${
              late ? "ring-2 ring-rose-400 ring-offset-1" : ""
            }`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${STEP_META[state]}`} />
          </span>
        )}
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
        <label className="flex items-center gap-2 text-xs text-slate-500">
          <span className="uppercase tracking-wide">Month</span>
          <select
            value={availableMonths.includes(month) ? month : "__other__"}
            onChange={(e) => router.push(href(e.target.value))}
            aria-label="Select month"
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {!availableMonths.includes(month) ? (
              <option value={month}>{monthLabel(month)}</option>
            ) : null}
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
                {m === currentMonth ? " · this month" : ""}
              </option>
            ))}
          </select>
        </label>
        <MonthStatusEditor month={month} initial={monthStatus} />
      </div>

      {/* Summary tiles */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Active lines" value={String(model.totals.members)} />
        <Tile label="Client invoiced" value={eur(model.totals.clientInvoicedEur)} accent="#059669" money />
        <Tile label="Collected" value={eur(model.totals.clientCollectedEur)} accent="#0ea5e9" money />
        <Tile label="Member cost" value={eur(model.totals.memberInvoicedEur)} accent="#dc2626" money />
        <Tile label="Margin" value={eur(model.totals.marginEur)} accent="#0f172a" strong money />
        <Tile
          label="Needs attention"
          value={`${model.totals.lateRows} late · ${model.totals.staffedNoHours} no hrs`}
          accent={model.totals.lateRows > 0 ? "#dc2626" : "#94a3b8"}
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
          <tr className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400 [&>th]:border-b [&>th]:border-slate-200 [&>th]:py-2.5">
            <th className="sticky left-0 z-10 bg-slate-50 px-3 text-left">Member · project</th>
            <th className="px-2 text-right">
              <HeaderTip label="Hours submitted for the month; validated hours shown in brackets when fewer.">Hours</HeaderTip>
            </th>
            <th className="px-2 text-center"><HeaderTip label={STEP_DESC.submitted}>Subm.</HeaderTip></th>
            <th className="px-2 text-center"><HeaderTip label={STEP_DESC.validated}>Valid.</HeaderTip></th>
            <th className="px-2 text-center"><HeaderTip label={STEP_DESC.memberInvoice}>Mbr inv</HeaderTip></th>
            <th className="px-2 text-center"><HeaderTip label={STEP_DESC.clientInvoiceSent}>Cli sent</HeaderTip></th>
            <th className="px-2 text-center"><HeaderTip label={STEP_DESC.collected}>Cashed</HeaderTip></th>
            <th className="px-2 text-center"><HeaderTip label={STEP_DESC.memberPaid}>Mbr paid</HeaderTip></th>
            <th className="px-2 text-right"><HeaderTip label="EUR amount of the member's invoice for this month.">Mbr €</HeaderTip></th>
            <th className="px-2 text-right">
              <HeaderTip label="HTP42 margin on the project this month: client invoiced − member invoices (project level).">Margin</HeaderTip>
            </th>
            <th className="px-2 text-center">
              <HeaderTip label="SOW / Work Order validity for the month. ⚠ = looks expired or missing.">SOW</HeaderTip>
            </th>
            <th className="px-3 text-left">Comment · relance</th>
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
      <StepCell state={r.steps.submitted} late={r.lateSteps.includes("submitted")} desc={STEP_DESC.submitted} />
      <StepCell state={r.steps.validated} late={r.lateSteps.includes("validated")} desc={STEP_DESC.validated} />
      <StepCell state={r.steps.memberInvoice} late={r.lateSteps.includes("memberInvoice")} desc={STEP_DESC.memberInvoice} />
      <StepCell state={r.steps.clientInvoiceSent} late={r.lateSteps.includes("clientInvoiceSent")} desc={STEP_DESC.clientInvoiceSent} />
      <StepCell state={r.steps.collected} late={r.lateSteps.includes("collected")} desc={STEP_DESC.collected} />
      <StepCell state={r.steps.memberPaid} late={r.lateSteps.includes("memberPaid")} desc={STEP_DESC.memberPaid} />
      <td className="px-2 py-2.5 text-right tabular-nums text-slate-600 demo-blur">{eur(r.memberInvoiceEur)}</td>
      <td className="px-2 py-2.5 text-right tabular-nums demo-blur">
        <span className={r.projectMarginEur != null && r.projectMarginEur < 0 ? "text-rose-600" : "text-slate-700"}>
          {eur(r.projectMarginEur)}
        </span>
      </td>
      <td className="px-2 py-2.5 text-center">
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
      <td className="px-3 py-2.5">
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
    <div className="min-w-[14rem] space-y-1">
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onBlur={() => {
          if (comment !== r.comment) save({ comment, lastReminderDate: reminder });
        }}
        rows={1}
        placeholder="Add a note…"
        className="w-full resize-y rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-700 placeholder:text-slate-300 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-slate-400">Relance</span>
        <input
          type="date"
          value={reminder}
          onChange={(e) => {
            setReminder(e.target.value);
            save({ comment, lastReminderDate: e.target.value });
          }}
          className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600 focus:border-brand-500 focus:outline-none"
        />
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
            <Mini label="Invoiced" value={eur(c.clientInvoicedEur)} tone="#059669" />
            <Mini label="Collected" value={eur(c.clientCollectedEur)} tone="#0ea5e9" />
            <Mini label="Cost" value={eur(c.memberInvoicedEur)} tone="#dc2626" />
            <Mini label="Margin" value={eur(c.marginEur)} tone={c.marginEur < 0 ? "#dc2626" : "#0f172a"} />
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
function Tile({
  label,
  value,
  accent,
  strong,
  money,
}: {
  label: string;
  value: string;
  accent?: string;
  strong?: boolean;
  money?: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      {accent ? <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: accent }} /> : null}
      <div className="pl-1.5">
        <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
        <div
          className={`mt-1 tabular-nums font-semibold ${strong ? "text-xl" : "text-base"} ${money ? "demo-blur" : ""}`}
          style={accent ? { color: accent } : undefined}
        >
          {value}
        </div>
      </div>
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
      <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> done</span>
      <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> partial</span>
      <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-200" /> pending</span>
      <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full ring-2 ring-rose-400" /> overdue</span>
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
          Not wired yet (need a data source / a decision): rebillable expenses (saisies / validées /
          refacturées), fixed-price milestone tracking, and automatic carry-over of unresolved lines
          from the previous month.
        </p>
      </div>
    </details>
  );
}
