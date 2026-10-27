"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { ClosingModel, ClosingRow, StepState } from "@/lib/closing";
import type { MonthStatus } from "@/lib/closing-store";

const eur = (v: number | null | undefined) =>
  v == null ? "—" : `€${Math.round(v).toLocaleString("en-US")}`;

// Modern hover tooltip: a dark rounded card with an arrow, shown above the
// trigger. Rendered through a portal with fixed positioning so it's never
// clipped by a scrolling table/overflow container.
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
    <span
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
    >
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

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map((n) => parseInt(n, 10));
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(month: string): string {
  const [y, m] = month.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// A header label that carries a tooltip, with a dotted underline affordance.
function HeaderTip({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <Tip label={label} wide>
      <span className="cursor-help underline decoration-dotted decoration-slate-300 underline-offset-2">
        {children}
      </span>
    </Tip>
  );
}

// ---- pipeline step chip --------------------------------------------------
const STEP_META: Record<StepState, { dot: string; text: string }> = {
  done: { dot: "bg-emerald-500", text: "text-emerald-700" },
  partial: { dot: "bg-amber-500", text: "text-amber-700" },
  pending: { dot: "bg-slate-300", text: "text-slate-400" },
  na: { dot: "bg-transparent", text: "text-slate-300" },
};
const STATE_LABEL: Record<StepState, string> = {
  done: "Done",
  partial: "Partial",
  pending: "Pending",
  na: "Not applicable",
};
function StepCell({ state, late, desc }: { state: StepState; late?: boolean; desc: string }) {
  const m = STEP_META[state];
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
    <td className="px-2 py-2 text-center">
      <Tip label={tip} wide>
        {state === "na" ? (
          <span className="text-slate-300">·</span>
        ) : (
          <span
            className={`inline-flex h-4 w-4 items-center justify-center rounded-full ${late ? "ring-2 ring-rose-400" : ""}`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${m.dot}`} />
          </span>
        )}
      </Tip>
    </td>
  );
}

// Human explanations for each pipeline column (header + chip tooltips).
const STEP_DESC = {
  submitted: "Timesheets submitted for the month",
  validated: "Timesheets validated (approved by the reviewer)",
  memberInvoice: "Invoice received from the network member",
  clientInvoiceSent: "Client invoice issued & sent to the client (project level)",
  collected: "Client invoice collected — paid or matched in Qonto (project level)",
  memberPaid: "The network member's invoice has been paid",
} as const;

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
  const go = (m: string) => router.push(`/admin/closing?month=${m}`);

  return (
    <div className="space-y-4">
      {/* Month nav + status */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => go(shiftMonth(month, -1))}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
            aria-label="Previous month"
          >
            ←
          </button>
          <select
            value={availableMonths.includes(month) ? month : ""}
            onChange={(e) => go(e.target.value)}
            aria-label="Select month"
            className="min-w-[10rem] rounded-md border border-slate-300 bg-white px-2 py-1.5 text-center text-sm font-semibold text-slate-800 focus:border-brand-500 focus:outline-none"
          >
            {!availableMonths.includes(month) ? <option value={month}>{monthLabel(month)}</option> : null}
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
                {m === currentMonth ? " (this month)" : ""}
              </option>
            ))}
          </select>
          <button
            onClick={() => go(shiftMonth(month, 1))}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
            aria-label="Next month"
          >
            →
          </button>
          {month !== currentMonth ? (
            <button onClick={() => go(currentMonth)} className="text-xs font-medium text-brand-700 hover:underline">
              This month
            </button>
          ) : null}
        </div>
        <MonthStatusEditor month={month} initial={monthStatus} />
      </div>

      {/* Summary tiles */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Active lines" value={String(model.totals.members)} />
        <Tile label="Client invoiced" value={eur(model.totals.clientInvoicedEur)} accent="#059669" />
        <Tile label="Collected" value={eur(model.totals.clientCollectedEur)} accent="#0ea5e9" />
        <Tile label="Member cost" value={eur(model.totals.memberInvoicedEur)} accent="#dc2626" />
        <Tile label="Margin" value={eur(model.totals.marginEur)} accent="#0f172a" strong />
        <Tile
          label="Needs attention"
          value={`${model.totals.lateRows} late · ${model.totals.staffedNoHours} no hrs`}
          accent={model.totals.lateRows > 0 ? "#dc2626" : "#64748b"}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-slate-100 p-1 text-xs font-semibold">
          {(["member", "client"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 transition ${
                view === v ? "bg-white text-brand-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {v === "member" ? "By member" : "By client"}
            </button>
          ))}
        </div>
        <Legend />
      </div>

      {model.rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
          No active members on projects for {monthLabel(month)}. Pick another month from the selector
          above{availableMonths.length ? ` (data exists for ${monthLabel(availableMonths[0])})` : ""}.
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

// ---- By-member table -----------------------------------------------------
function MemberTable({ model, month }: { model: ClosingModel; month: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">
            <th className="px-3 py-2 text-left">Member · project</th>
            <th className="px-2 py-2 text-right">
              <HeaderTip label="Hours submitted for the month, with validated hours in brackets when fewer.">Hours</HeaderTip>
            </th>
            <th className="px-2 py-2 text-center"><HeaderTip label={STEP_DESC.submitted}>TS&nbsp;sub</HeaderTip></th>
            <th className="px-2 py-2 text-center"><HeaderTip label={STEP_DESC.validated}>TS&nbsp;val</HeaderTip></th>
            <th className="px-2 py-2 text-center"><HeaderTip label={STEP_DESC.memberInvoice}>Mbr&nbsp;inv</HeaderTip></th>
            <th className="px-2 py-2 text-center"><HeaderTip label={STEP_DESC.clientInvoiceSent}>Cli&nbsp;sent</HeaderTip></th>
            <th className="px-2 py-2 text-center"><HeaderTip label={STEP_DESC.collected}>Cashed</HeaderTip></th>
            <th className="px-2 py-2 text-center"><HeaderTip label={STEP_DESC.memberPaid}>Mbr&nbsp;paid</HeaderTip></th>
            <th className="px-2 py-2 text-right"><HeaderTip label="EUR amount of the member's invoice for this month.">Mbr €</HeaderTip></th>
            <th className="px-2 py-2 text-right">
              <HeaderTip label="HTP42 margin on the project this month: client invoiced − member invoices (project level).">Margin</HeaderTip>
            </th>
            <th className="px-2 py-2 text-center">
              <HeaderTip label="SOW / Work Order validity for the month. ⚠ = looks expired or missing.">SOW</HeaderTip>
            </th>
            <th className="px-3 py-2 text-left">Comment · last reminder</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {model.rows.map((r) => (
            <MemberRow key={r.key} r={r} month={month} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MemberRow({ r, month }: { r: ClosingRow; month: string }) {
  const rowTint = r.staffedNoHours
    ? "bg-amber-50/40"
    : r.lateSteps.length > 0
      ? "bg-rose-50/30"
      : "";
  return (
    <tr className={`align-top ${rowTint}`}>
      <td className="px-3 py-2">
        <div className="font-medium text-slate-800 demo-blur">{r.memberName}</div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
          <span>{r.projectName}</span>
          <span className="font-mono">{r.projectCode}</span>
          <span className="text-slate-300">·</span>
          <span>{r.clientName}</span>
        </div>
        {r.staffedNoHours ? (
          <Tip label="Staffed and active this month but no hours logged — absence, paused mission, or forgotten?" wide>
            <span className="mt-1 inline-block cursor-help rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
              staffed · no hours
            </span>
          </Tip>
        ) : null}
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-slate-600">
        {r.submittedHours > 0 ? (
          <span title={`${r.validatedHours}h validated of ${r.submittedHours}h`}>
            {r.submittedHours}h
            {r.validatedHours < r.submittedHours ? (
              <span className="text-amber-600"> ({r.validatedHours}✓)</span>
            ) : null}
          </span>
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
      <td className="px-2 py-2 text-right tabular-nums text-slate-600 demo-blur">{eur(r.memberInvoiceEur)}</td>
      <td className="px-2 py-2 text-right tabular-nums demo-blur">
        <span className={r.projectMarginEur != null && r.projectMarginEur < 0 ? "text-rose-600" : "text-slate-700"}>
          {eur(r.projectMarginEur)}
        </span>
      </td>
      <td className="px-2 py-2 text-center">
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
      <td className="px-3 py-2">
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
        placeholder="Note…"
        className="w-full resize-y rounded border border-slate-200 px-2 py-1 text-[11px] focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-slate-400">Relance</label>
        <input
          type="date"
          value={reminder}
          onChange={(e) => {
            setReminder(e.target.value);
            save({ comment, lastReminderDate: e.target.value });
          }}
          className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600 focus:border-brand-500 focus:outline-none"
        />
        <span className="text-[10px]">
          {state === "saving" ? (
            <span className="text-slate-400">saving…</span>
          ) : state === "saved" ? (
            <span className="text-emerald-600">✓</span>
          ) : state === "error" ? (
            <span className="text-rose-600">save failed</span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

// ---- By-client rollup ----------------------------------------------------
function ClientView({ model }: { model: ClosingModel }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {model.clients.map((c) => (
        <div key={c.clientCode} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-slate-900 demo-blur">{c.clientName}</div>
              <div className="text-[11px] text-slate-400">
                {c.memberCount} member{c.memberCount === 1 ? "" : "s"} · {c.projectCount} project
                {c.projectCount === 1 ? "" : "s"}
              </div>
            </div>
            {c.poRemainingEur != null ? (
              <div
                className={`rounded-md px-2 py-1 text-[10px] font-medium ${
                  c.poLow ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200" : "bg-slate-50 text-slate-500"
                }`}
                title="Purchase-order headroom remaining across this client's projects"
              >
                PO left {eur(c.poRemainingEur)}
                {c.poLow ? " ⚠" : ""}
              </div>
            ) : null}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            <Mini label="Invoiced" value={eur(c.clientInvoicedEur)} tone="#059669" />
            <Mini label="Collected" value={eur(c.clientCollectedEur)} tone="#0ea5e9" />
            <Mini label="Member cost" value={eur(c.memberInvoicedEur)} tone="#dc2626" />
            <Mini label="Margin" value={eur(c.marginEur)} tone={c.marginEur < 0 ? "#dc2626" : "#0f172a"} />
          </div>
          <ul className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-[11px]">
            {c.rows.map((r) => (
              <li key={r.key} className="flex items-center justify-between gap-2">
                <span className="truncate text-slate-600 demo-blur" title={`${r.memberName} · ${r.projectName}`}>
                  {r.memberName}
                  <span className="ml-1 text-slate-400">{r.projectName}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {r.staffedNoHours ? <span title="staffed, no hours">🟠</span> : null}
                  {r.lateSteps.length > 0 ? (
                    <span className="text-rose-600" title={`late: ${r.lateSteps.join(", ")}`}>
                      ⏰
                    </span>
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

// ---- small bits ----------------------------------------------------------
function Tile({ label, value, accent, strong }: { label: string; value: string; accent?: string; strong?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      {accent ? <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: accent }} /> : null}
      <div className="pl-1.5">
        <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
        <div
          className={`mt-1 tabular-nums ${strong ? "text-xl" : "text-base"} font-semibold demo-blur`}
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
      <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> partial</span>
      <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-300" /> pending</span>
      <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full ring-2 ring-rose-400" /> late</span>
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

  const pill =
    status === "Done"
      ? "bg-emerald-100 text-emerald-800"
      : status === "In progress"
        ? "bg-amber-100 text-amber-800"
        : "bg-slate-100 text-slate-500";

  return (
    <div className="flex items-center gap-2">
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${pill}`}>
        {status || "Not started"}
      </span>
      <select
        value={status}
        onChange={(e) => {
          const next = e.target.value as MonthStatus["status"];
          setStatus(next);
          save({ status: next, comment });
        }}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
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
        className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      <span className="w-10 text-[10px]">
        {state === "saving" ? (
          <span className="text-slate-400">…</span>
        ) : state === "saved" ? (
          <span className="text-emerald-600">saved</span>
        ) : state === "error" ? (
          <span className="text-rose-600">error</span>
        ) : null}
      </span>
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
          <b>Client invoice sent / collected</b> and <b>margin</b> are tracked at <b>project</b> level
          (a client invoice usually bundles a project, not one member), shown on each row for context
          and rolled up in the By client view. <b>Collected</b> = payment marked Paid or matched to a
          Qonto transaction.
        </p>
        <p>
          <b>Late</b> flags use default targets after month end: timesheets submitted J+{2}, validated
          J+{4}, client invoice sent J+{5}, member invoice J+{7}. SOW shows ⚠ when the staffing's SOW
          looks expired/missing for the month.
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
