import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  getTimesheetsForMember,
  listInvoicesForMember,
  listMyProjects,
  listProjects,
  type MyProjectRecord,
} from "@/lib/airtable";
import { thisMondayIso } from "@/lib/dates";
import { rollupEarnings } from "@/lib/earnings";
import { StatusPill } from "@/components/badge";
import { EarningsChart } from "./earnings-chart";

export const dynamic = "force-dynamic";

const HOURS_PER_DAY = 8;

export default async function DashboardHomePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [projects, timesheets, invoices, allProjects] = await Promise.all([
    listMyProjects(session.sub, session.memberCode),
    getTimesheetsForMember(session.memberCode),
    listInvoicesForMember(session.sub),
    listProjects(),
  ]);

  const monday = thisMondayIso();
  const monthPrefix = new Date().toISOString().slice(0, 7);
  let hoursThisWeek = 0;
  let submittedThisWeek = 0;
  let draftThisWeek = 0;
  let hoursThisMonth = 0;
  for (const t of timesheets) {
    if (t.status === "Deleted") continue;
    if (t.startDate === monday) {
      hoursThisWeek += t.totalHours;
      if (t.status === "Submitted") submittedThisWeek += 1;
      else if (t.status === "Draft") draftThisWeek += 1;
    }
    if (t.startDate?.startsWith(monthPrefix)) {
      hoursThisMonth += t.totalHours;
    }
  }
  const daysThisMonth = hoursThisMonth / HOURS_PER_DAY;

  const activeProjects = projects.filter(
    (p) => p.status === "In Progress" || p.status === "Planned" || p.status === "Not Started",
  );
  const recent: MyProjectRecord[] = [...projects]
    .sort((a, b) => {
      const order: Record<string, number> = {
        "In Progress": 0,
        Planned: 1,
        "Not Started": 1,
        "On Hold": 2,
        Completed: 3,
      };
      return (order[a.status] ?? 99) - (order[b.status] ?? 99);
    })
    .slice(0, 3);

  // Earnings rollup, EUR-converted via each invoice's project FX rate.
  const earnings = rollupEarnings({ invoices, projects: allProjects, timesheets });
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const thisMonthBucket = earnings.months[earnings.months.length - 1];
  const prevMonthBucket = earnings.months[earnings.months.length - 2];
  const thisMonthEur = thisMonthBucket ? thisMonthBucket.paidEur + thisMonthBucket.pendingEur : 0;
  const prevMonthEur = prevMonthBucket ? prevMonthBucket.paidEur + prevMonthBucket.pendingEur : 0;
  const monthDelta = prevMonthEur > 0 ? (thisMonthEur - prevMonthEur) / prevMonthEur : null;

  const firstName = (session.fullName || "").trim().split(/\s+/)[0] || "team";

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
      <EarningsHero
        name={firstName}
        lifetimeEur={earnings.lifetimeEur}
        paidEur={earnings.paidLifetimeEur}
        pendingEur={earnings.pendingLifetimeEur}
        thisMonthEur={thisMonthEur}
        monthDelta={monthDelta}
        paidByCurrency={earnings.paidByCurrency}
        pendingByCurrency={earnings.pendingByCurrency}
      />

      {/* Earnings chart, kept tight vertically. */}
      <section className="rounded-lg border border-slate-200 bg-white px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-semibold text-slate-900">
            Earnings, last 12 months
          </h2>
          <span className="text-[11px] text-slate-500">
            Paid + pending, EUR equivalent
          </span>
        </div>
        <div className="mt-1.5">
          <EarningsChart months={earnings.months} current={currentMonthKey} />
        </div>
      </section>

      {/* Stats strip */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<FlameIcon />}
          tone={earnings.submissionStreakWeeks >= 4 ? "amber" : "slate"}
          label="Submission streak"
          value={
            earnings.submissionStreakWeeks > 0
              ? `${earnings.submissionStreakWeeks} ${earnings.submissionStreakWeeks === 1 ? "week" : "weeks"}`
              : "Start one"
          }
          sub={
            earnings.submissionStreakWeeks > 0
              ? "Keep submitting weekly to grow it"
              : "Submit this week's timesheet"
          }
        />
        <StatCard
          icon={<TrophyIcon />}
          tone="yellow"
          label="Best month"
          value={earnings.best ? formatEur(earnings.best.eur) : "—"}
          sub={earnings.best ? earnings.best.label : "First invoice incoming"}
        />
        <StatCard
          icon={<CalendarIcon />}
          tone="brand"
          label="Days billed YTD"
          value={earnings.daysBilledYtd.toFixed(1)}
          sub={`${daysThisMonth.toFixed(1)} d this month`}
        />
        <StatCard
          icon={<RocketIcon />}
          tone="emerald"
          label="Months active"
          value={String(earnings.monthsActive)}
          sub={`${projects.length} project${projects.length === 1 ? "" : "s"} touched`}
        />
      </section>

      {/* Projects + quick actions */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Your projects</h2>
            <Link
              href="/timesheets/projects"
              className="text-[11px] font-medium text-brand-700 hover:underline"
            >
              See all →
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">
              You don't have any active staffings yet. An administrator will add you to a project
              soon.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {recent.map((p) => {
                const allocHours = p.daysAllocatedTotal * HOURS_PER_DAY;
                const pct =
                  allocHours > 0 ? Math.min(100, (p.hoursActualTotal / allocHours) * 100) : 0;
                const over = p.hoursActualTotal > allocHours && allocHours > 0;
                return (
                  <li
                    key={p.projectCode}
                    className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-slate-500">{p.projectCode}</span>
                      <span className="truncate text-sm font-medium text-slate-900">
                        {p.projectName || "—"}
                      </span>
                      {p.status ? (
                        <StatusPill status={p.status} className="shrink-0" />
                      ) : null}
                    </div>
                    {allocHours > 0 ? (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1 flex-1 rounded-full bg-slate-200/70 overflow-hidden">
                          <div
                            className={`h-full ${over ? "bg-amber-500" : "bg-brand-600"}`}
                            style={{ width: `${Math.max(2, pct)}%` }}
                          />
                        </div>
                        <span className="text-[10px] tabular-nums text-slate-500 whitespace-nowrap">
                          {p.daysActualTotal.toFixed(1)} / {p.daysAllocatedTotal.toFixed(1)} d
                        </span>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
            <span className="font-medium text-slate-700">{activeProjects.length}</span> active ·{" "}
            <span className="font-medium text-slate-700">{hoursThisWeek.toFixed(1)} h</span> logged
            this week
            {submittedThisWeek > 0 ? (
              <span className="ml-1 text-emerald-600">· {submittedThisWeek} submitted</span>
            ) : draftThisWeek > 0 ? (
              <span className="ml-1 text-amber-600">· {draftThisWeek} still draft</span>
            ) : (
              <span className="ml-1 text-slate-400">· nothing logged yet</span>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Quick actions</h2>
          <div className="mt-3 grid gap-2">
            <ActionLink
              href="/timesheets/mine"
              title="Submit a timesheet"
              caption={
                submittedThisWeek > 0
                  ? "This week's done, log next week's hours"
                  : "Don't break the streak, submit this week"
              }
              tone="brand"
              Icon={ClockIcon}
            />
            <ActionLink
              href="/timesheets/projects"
              title="My projects"
              caption="See where you're staffed and team progress"
              tone="emerald"
              Icon={FolderIcon}
            />
            <ActionLink
              href="/profile"
              title="My profile"
              caption="Photo, CV, contact details"
              tone="violet"
              Icon={UserIcon}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

// ----- Hero ------------------------------------------------------------------

function EarningsHero({
  name,
  lifetimeEur,
  paidEur,
  pendingEur,
  thisMonthEur,
  monthDelta,
  paidByCurrency,
  pendingByCurrency,
}: {
  name: string;
  lifetimeEur: number;
  paidEur: number;
  pendingEur: number;
  thisMonthEur: number;
  monthDelta: number | null;
  paidByCurrency: Map<string, number>;
  pendingByCurrency: Map<string, number>;
}) {
  // Raw per-currency totals for multi-currency consultants. Sum paid +
  // pending per currency so the chip row is one figure per currency.
  const ccyTotals = new Map<string, number>();
  for (const [c, v] of paidByCurrency) ccyTotals.set(c, (ccyTotals.get(c) ?? 0) + v);
  for (const [c, v] of pendingByCurrency) ccyTotals.set(c, (ccyTotals.get(c) ?? 0) + v);
  const ccyEntries = [...ccyTotals.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <section className="relative overflow-hidden rounded-lg border border-slate-200 bg-gradient-to-br from-white via-brand-50/40 to-brand-50/40 px-5 py-5 sm:px-7 sm:py-6">
      <DotGrid />
      <div className="relative grid items-center gap-5 lg:grid-cols-[auto_1fr_minmax(0,auto)] lg:gap-8">
        <Image
          src="/htp42-mark.png"
          alt="HealthTech Partners 42"
          width={580}
          height={326}
          priority
          className="h-12 w-auto sm:h-14 shrink-0"
        />
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">
            Welcome back, <span className="text-brand-600">{name}</span>.
          </h1>
          <div className="mt-2 text-[11px] uppercase tracking-wide text-slate-500">
            Total earned with HTP42
          </div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-semibold tabular-nums text-slate-900">
              {formatEur(lifetimeEur)}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
            <span>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-600 mr-1 align-middle" />
              {formatEur(paidEur)} paid
            </span>
            <span>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-300 mr-1 align-middle" />
              {formatEur(pendingEur)} pending
            </span>
            {ccyEntries.length > 1 ? (
              <span className="text-slate-400">
                ·{" "}
                {ccyEntries
                  .map(
                    ([c, v]) =>
                      `${v.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${c}`,
                  )
                  .join(" · ")}
              </span>
            ) : null}
          </div>
        </div>

        {/* This-month panel. Lands to the right on wide screens, drops below
            on narrow ones so the title never gets squished. */}
        <div className="rounded-lg border border-slate-200 bg-white/70 px-4 py-3 sm:min-w-[10rem]">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[11px] uppercase tracking-wide text-slate-500">
              This month
            </span>
            {monthDelta != null ? (
              <span
                className={`text-[11px] font-medium ${
                  monthDelta >= 0 ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {monthDelta >= 0 ? "▲" : "▼"} {Math.abs(monthDelta * 100).toFixed(0)}% vs last
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-900">
            {formatEur(thisMonthEur)}
          </div>
        </div>
      </div>
    </section>
  );
}

function DotGrid() {
  const css = `
    .htp42-dotgrid {
      background-image: radial-gradient(circle, rgba(30,145,249,0.10) 1px, transparent 1px);
      background-size: 18px 18px;
      mask-image: linear-gradient(to bottom, rgba(0,0,0,0.6), transparent 70%);
      -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,0.6), transparent 70%);
    }
  `;
  return (
    <>
      <style>{css}</style>
      <div className="htp42-dotgrid absolute inset-0 pointer-events-none" aria-hidden />
    </>
  );
}

// ----- Small UI bits ---------------------------------------------------------

const TONE_ACCENT: Record<string, string> = {
  brand: "bg-brand-50 text-brand-700 ring-brand-100",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  violet: "bg-violet-50 text-violet-700 ring-violet-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  yellow: "bg-yellow-50 text-yellow-700 ring-yellow-100",
  slate: "bg-slate-50 text-slate-700 ring-slate-200",
};

function StatCard({
  icon,
  tone,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  tone: keyof typeof TONE_ACCENT;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex h-7 w-7 items-center justify-center rounded-md ring-1 ${TONE_ACCENT[tone]}`}
        >
          {icon}
        </span>
        <span className="text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      </div>
      <div className="mt-2 text-xl font-semibold tabular-nums text-slate-900">{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>
    </div>
  );
}

function ActionLink({
  href,
  title,
  caption,
  tone,
  Icon,
}: {
  href: string;
  title: string;
  caption: string;
  tone: keyof typeof TONE_ACCENT;
  Icon: () => React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 transition hover:border-brand-300 hover:shadow-sm"
    >
      <span
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md ring-1 ${TONE_ACCENT[tone]}`}
      >
        <Icon />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-900 group-hover:text-brand-700">
          {title}
        </span>
        <span className="block text-[11px] text-slate-500">{caption}</span>
      </span>
    </Link>
  );
}

function formatEur(v: number): string {
  return `${Math.round(v).toLocaleString("en-US")} €`;
}

// Icons --------------------------------------------------------------------

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" strokeLinejoin="round" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="12" cy="9" r="3.5" />
      <path d="M4 20c1-4 5-6 8-6s7 2 8 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M12 3s4 4 4 8a4 4 0 1 1-8 0c0-1.5.6-3 1.5-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 17a3 3 0 1 0 6 0c0-1.5-1-2.5-2-3.5-1 1-2 2-2 3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
      <path d="M16 6h3a3 3 0 0 1-3 3M8 6H5a3 3 0 0 0 3 3M12 12v5M9 19h6" strokeLinecap="round" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 9h17M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  );
}
function RocketIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M14 4c4 1 6 3 6 6-3 0-5 2-6 6-1-4-3-6-6-6 1-3 3-5 6-6Z" strokeLinejoin="round" />
      <circle cx="15" cy="9" r="1.5" />
      <path d="M9 15c-2 1-3 3-3 5 2 0 4-1 5-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
