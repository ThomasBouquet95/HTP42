import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getTimesheetsForMember, listMyProjects, type MyProjectRecord } from "@/lib/airtable";
import { thisMondayIso } from "@/lib/dates";
import { HeroInfinity } from "./hero-infinity";

export const dynamic = "force-dynamic";

const HOURS_PER_DAY = 8;
const STATUS_TINT: Record<string, string> = {
  "In Progress": "bg-emerald-500",
  Planned: "bg-sky-500",
  "Not Started": "bg-sky-500",
  "On Hold": "bg-red-500",
  Completed: "bg-slate-400",
};

export default async function DashboardHomePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [projects, timesheets] = await Promise.all([
    listMyProjects(session.sub, session.memberCode),
    getTimesheetsForMember(session.memberCode),
  ]);

  // ----- KPIs ---------------------------------------------------------------
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

  const firstName = (session.fullName || "").trim().split(/\s+/)[0] || "team";

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <HeroInfinity name={firstName} />

      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="This week"
          value={`${hoursThisWeek.toFixed(1)} h`}
          sub={
            submittedThisWeek > 0
              ? `${submittedThisWeek} submitted${draftThisWeek ? ` · ${draftThisWeek} draft` : ""}`
              : draftThisWeek > 0
              ? `${draftThisWeek} draft — submit when ready`
              : "Nothing logged yet"
          }
          tone={submittedThisWeek > 0 ? "ok" : draftThisWeek > 0 ? "warn" : undefined}
        />
        <Kpi
          label="This month"
          value={`${daysThisMonth.toFixed(1)} d`}
          sub={`${hoursThisMonth.toFixed(0)} h logged`}
        />
        <Kpi
          label="Active projects"
          value={String(activeProjects.length)}
          sub={`${projects.length} total in your portfolio`}
        />
        <Kpi
          label="Sign-ins"
          value="∞"
          sub="Welcome back"
          accent
        />
      </div>

      {/* Quick actions + Recent projects */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
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
                const pct = allocHours > 0 ? Math.min(100, (p.hoursActualTotal / allocHours) * 100) : 0;
                const over = p.hoursActualTotal > allocHours && allocHours > 0;
                return (
                  <li
                    key={p.projectCode}
                    className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${STATUS_TINT[p.status] ?? "bg-slate-300"}`}
                        aria-hidden
                      />
                      <span className="font-mono text-[10px] text-slate-500">{p.projectCode}</span>
                      <span className="truncate text-sm font-medium text-slate-900">
                        {p.projectName || "—"}
                      </span>
                      {p.status ? (
                        <span className="text-[10px] uppercase tracking-wide text-slate-500">
                          {p.status}
                        </span>
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
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Quick actions</h2>
          <div className="mt-3 grid gap-2">
            <ActionLink
              href="/timesheets/mine"
              title="My timesheets"
              caption="Submit, edit, and review weekly timesheets"
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
        </div>
      </div>
    </main>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "warn";
  accent?: boolean;
}) {
  const valueCls =
    tone === "ok"
      ? "text-emerald-700"
      : tone === "warn"
      ? "text-amber-700"
      : accent
      ? "text-brand-700"
      : "text-slate-900";
  const wrapCls = accent ? "border-brand-200 bg-brand-50/40" : "border-slate-200 bg-white";
  return (
    <div className={`rounded-xl border ${wrapCls} px-4 py-3`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueCls}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

const TONE_BG: Record<string, string> = {
  brand: "bg-brand-50 text-brand-700 ring-brand-100",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  violet: "bg-violet-50 text-violet-700 ring-violet-100",
};

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
  tone: keyof typeof TONE_BG;
  Icon: () => React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 transition hover:border-brand-300 hover:shadow-sm"
    >
      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md ring-1 ${TONE_BG[tone]}`}>
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
      <path
        d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"
        strokeLinejoin="round"
      />
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
