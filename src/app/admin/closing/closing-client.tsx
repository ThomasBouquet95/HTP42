"use client";

import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SegmentedTabs } from "@/components/filters";
import { DatePopover, MonthPopover } from "@/components/date-picker";
import { UI, moneyToneClass } from "@/lib/ui";
import type { ClosingModel, ClosingRow, Stage, StageTone } from "@/lib/closing";
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

// An INTERACTIVE hover card (unlike Tip it has pointer-events, stays open while
// the cursor is inside it, and so can hold clickable links). Portal + fixed
// position so it's never clipped by the scrolling table.
function HoverCard({ content, children }: { content: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const open = () => {
    if (timer.current) clearTimeout(timer.current);
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top });
  };
  const close = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPos(null), 140);
  };
  return (
    <span ref={ref} className="relative inline-flex" onMouseEnter={open} onMouseLeave={close}>
      {children}
      {pos && typeof document !== "undefined"
        ? createPortal(
            <div
              onMouseEnter={open}
              onMouseLeave={close}
              style={{ position: "fixed", left: pos.x, top: pos.y - 10, transform: "translate(-50%, -100%)" }}
              className="z-50 w-64 rounded-lg bg-slate-900 p-2.5 text-left text-[11px] leading-snug text-white shadow-xl ring-1 ring-black/5"
            >
              {content}
              <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}

// ---- Rich per-cell detail content (shown in the HoverCard) -----------------
const fmtDay = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "—";

function paymentStatusPlain(s: string): string {
  const map: Record<string, string> = {
    "To be paid": "approved, awaiting payment",
    "Under Review": "awaiting admin review",
    Scheduled: "scheduled for payment",
    Paid: "paid",
    Overdue: "overdue",
    Pending: "pending",
  };
  return map[s] ?? s;
}

function DetailLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mt-1.5 inline-flex font-medium text-sky-300 underline hover:text-sky-200">
      {label} →
    </Link>
  );
}

function TipRow({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-white/70">{left}</span>
      {right != null ? <span className="tabular-nums font-medium">{right}</span> : null}
    </div>
  );
}

type StageKey = keyof ClosingRow["stages"];

// Rich per-stage detail shown in the (interactive) HoverCard, with an admin
// deep-link that pre-filters the target page.
function stageDetail(r: ClosingRow, stage: StageKey): ReactNode {
  const st = r.stages[stage];
  const Head = ({ title }: { title: string }) => (
    <div className="mb-1 font-semibold">
      {title} <span className="font-normal text-white/60">· {st.label}</span>
      {st.late ? <span className="text-rose-300"> · overdue</span> : null}
    </div>
  );

  if (stage === "timesheets") {
    return (
      <div>
        <Head title="Timesheets" />
        {r.timesheetsDetail.length ? (
          <ul className="space-y-0.5">
            {r.timesheetsDetail.map((t, i) => (
              <li key={i}>
                <TipRow left={`${fmtDay(t.start)} – ${fmtDay(t.end)}`} right={`${t.hours}h · ${t.status}`} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-white/70">No timesheet logged by {r.memberName} this month.</div>
        )}
        <DetailLink href={`/admin/timesheets?member=${encodeURIComponent(r.memberCode)}`} label="Open timesheets" />
      </div>
    );
  }

  if (stage === "clientPay") {
    const states = r.clientInvoiceStates.length
      ? r.clientInvoiceStates.map(paymentStatusPlain).join(", ")
      : "not invoiced";
    return (
      <div>
        <Head title="Client payment" />
        <TipRow left="Invoiced" right={eur(r.clientInvoicedEur)} />
        <TipRow left="Sent to client" right={eur(r.clientSentEur)} />
        <TipRow left="Collected" right={eur(r.clientCollectedEur)} />
        <div className="mt-1 text-white/70">Status: {states}.</div>
        <div className="text-white/50">Project level — a client invoice may cover the whole project.</div>
        <DetailLink href={`/admin/payments?search=${encodeURIComponent(r.projectCode)}`} label="Open client payments" />
      </div>
    );
  }

  // expertPay
  return (
    <div>
      <Head title="Expert payment" />
      <div className="text-white/80">
        {r.memberInvoiceStatus === "paid"
          ? `Paid${r.memberInvoiceEur ? ` · ${eur(r.memberInvoiceEur)}` : ""}.`
          : r.memberInvoiceStatus
            ? `Invoice received${r.memberInvoiceEur ? ` · ${eur(r.memberInvoiceEur)}` : ""} — ${st.label.toLowerCase()}.`
            : `No invoice received yet from ${r.memberName}.`}
      </div>
      <DetailLink href={`/admin/payments?search=${encodeURIComponent(r.memberCode)}`} label="Open member payments" />
    </div>
  );
}

// ---- Stage pill ------------------------------------------------------------
const TONE: Record<StageTone, string> = {
  grey: "bg-slate-100 text-slate-500 ring-slate-200",
  amber: "bg-amber-100 text-amber-800 ring-amber-200",
  red: "bg-rose-100 text-rose-700 ring-rose-200",
  blue: "bg-sky-100 text-sky-700 ring-sky-200",
  green: "bg-emerald-100 text-emerald-700 ring-emerald-200",
};
const STAGE_HEADER: Record<StageKey, string> = {
  timesheets:
    "Timesheets entered by the member and approved by the reviewer. Grey = not received, amber = under review, red = rejected, green = approved.",
  clientPay:
    "The client invoice for this project this month (money in). Grey = not invoiced, blue = invoiced / awaiting, amber = under review, green = collected.",
  expertPay:
    "The expert's (network member's) invoice and our payment of it (money out). Grey = awaiting invoice, blue = received / accepted, amber = under review, green = paid, red = rejected.",
};

function StagePill({ stage }: { stage: Stage }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${TONE[stage.tone]}`}
    >
      {stage.late ? <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> : null}
      {stage.label}
    </span>
  );
}

function StageCell({ r, stage, leftBorder }: { r: ClosingRow; stage: StageKey; leftBorder?: boolean }) {
  return (
    <td className={`px-3 py-2.5 text-center ${leftBorder ? "border-l border-slate-100" : ""}`}>
      <HoverCard content={stageDetail(r, stage)}>
        <span className="inline-flex cursor-help align-middle">
          <StagePill stage={r.stages[stage]} />
        </span>
      </HoverCard>
    </td>
  );
}

const rowLate = (r: ClosingRow) =>
  r.stages.timesheets.late || r.stages.clientPay.late || r.stages.expertPay.late;

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
  const [pending, startTransition] = useTransition();
  const go = (m: string) => {
    if (/^\d{4}-\d{2}$/.test(m)) startTransition(() => router.push(href(m)));
  };

  return (
    <div className="space-y-4">
      {/* Control bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="uppercase tracking-wide">Month</span>
          <MonthPopover value={month} onChange={go} />
          {pending ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
              <Spinner /> loading…
            </span>
          ) : month !== currentMonth ? (
            <button type="button" onClick={() => go(currentMonth)} className="font-medium text-brand-700 hover:underline">
              This month
            </button>
          ) : null}
        </div>
        <MonthStatusEditor month={month} initial={monthStatus} />
      </div>

      <div className={`relative space-y-4 transition-opacity ${pending ? "pointer-events-none opacity-50" : ""}`}>
        {pending ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-start justify-center pt-24">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow ring-1 ring-slate-200">
              <Spinner /> Loading {monthLabel(month)}…
            </span>
          </div>
        ) : null}

      {/* Summary — grouped to mirror the pipeline: lines · client in · expert out · margin */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Lines">
          <StatLine label="Active" value={String(model.totals.members)} strong />
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
            {model.totals.staffedNoHours > 0 ? (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">
                {model.totals.staffedNoHours} no hours
              </span>
            ) : null}
            {model.totals.lateRows > 0 ? (
              <span className="rounded-full bg-rose-100 px-1.5 py-0.5 font-medium text-rose-700">
                {model.totals.lateRows} late
              </span>
            ) : null}
            {model.totals.staffedNoHours === 0 && model.totals.lateRows === 0 ? (
              <span className="text-slate-400">all on track</span>
            ) : null}
          </div>
        </SummaryCard>

        <SummaryCard title="Client payment" hint="money in" accent={UI.revenue}>
          <StatLine label="Invoiced" value={eur(model.totals.clientInvoicedEur)} color={UI.revenue} />
          <StatLine label="Collected" value={eur(model.totals.clientCollectedEur)} color={UI.collected} />
          <StatLine label="Outstanding" value={eur(model.totals.clientInvoicedEur - model.totals.clientCollectedEur)} />
        </SummaryCard>

        <SummaryCard title="Expert payment" hint="money out" accent={UI.cost}>
          <StatLine label="Invoiced" value={eur(model.totals.memberInvoicedEur)} color={UI.cost} />
          <StatLine label="Paid" value={eur(model.totals.memberPaidEur)} />
          <StatLine label="Outstanding" value={eur(model.totals.memberInvoicedEur - model.totals.memberPaidEur)} />
        </SummaryCard>

        <SummaryCard
          title="Margin"
          hint="in − out"
          accent={model.totals.marginEur < 0 ? UI.marginNeg : UI.margin}
        >
          <StatLine
            label="This month"
            value={eur(model.totals.marginEur)}
            color={model.totals.marginEur < 0 ? UI.marginNeg : UI.margin}
            strong
          />
          <div className="pt-1 text-[11px] text-slate-400">Client invoiced − expert invoiced</div>
        </SummaryCard>
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
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-spin text-brand-600" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
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
            <th rowSpan={2} className="border-b border-slate-200 px-2 py-2 text-right align-bottom">
              <HeaderTip label="Hours entered in the member's submitted timesheets for the month (validated hours in brackets when fewer). This is time logged in timesheets — not the days contracted or allocated on the SOW.">
                Hours
              </HeaderTip>
            </th>
            <th colSpan={3} className="border-b border-l border-slate-200 px-2 py-1.5 text-center text-slate-500">
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
            <th className="border-l border-slate-200 px-3 text-center"><HeaderTip label={STAGE_HEADER.timesheets}>Timesheets</HeaderTip></th>
            <th className="px-3 text-center"><HeaderTip label={STAGE_HEADER.clientPay}>Client payment</HeaderTip></th>
            <th className="px-3 text-center"><HeaderTip label={STAGE_HEADER.expertPay}>Expert payment</HeaderTip></th>
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
    : rowLate(r)
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
        <HoverCard content={stageDetail(r, "timesheets")}>
          <span className="cursor-help">
            {r.submittedHours > 0 ? `${r.submittedHours}h` : <span className="text-slate-300">—</span>}
          </span>
        </HoverCard>
      </td>
      <StageCell r={r} stage="timesheets" leftBorder />
      <StageCell r={r} stage="clientPay" />
      <StageCell r={r} stage="expertPay" />
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
                  {rowLate(r) ? (
                    <Tip label="A pipeline stage is overdue for this line." wide>
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
function SummaryCard({
  title,
  hint,
  accent,
  children,
}: {
  title: string;
  hint?: string;
  accent?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {accent ? <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} /> : null}
          {title}
        </div>
        {hint ? <span className="text-[9px] uppercase tracking-wide text-slate-300">{hint}</span> : null}
      </div>
      <div className="mt-2 space-y-1">{children}</div>
    </div>
  );
}

function StatLine({
  label,
  value,
  color,
  strong,
}: {
  label: string;
  value: string;
  color?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11px] text-slate-500">{label}</span>
      <span
        className={`tabular-nums demo-blur ${strong ? "text-lg font-semibold" : "text-sm font-medium"}`}
        style={color ? { color } : undefined}
      >
        {value}
      </span>
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
  const items: { tone: StageTone; label: string }[] = [
    { tone: "grey", label: "not started" },
    { tone: "blue", label: "invoiced / awaiting" },
    { tone: "amber", label: "under review" },
    { tone: "green", label: "done / paid" },
    { tone: "red", label: "rejected" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-400">
      {items.map((i) => (
        <span key={i.tone} className={`inline-flex items-center rounded-full px-1.5 py-0.5 ring-1 ${TONE[i.tone]}`}>
          {i.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> overdue
      </span>
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

