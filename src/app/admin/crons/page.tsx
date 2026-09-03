import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import { listCronJobs, humanizeCron, nextRunUtc, type CronJob } from "@/lib/cron-catalog";

export const dynamic = "force-dynamic";

const CATEGORY_META: Record<CronJob["category"], string> = {
  Finance: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Timesheets: "border-sky-200 bg-sky-50 text-sky-700",
  Reporting: "border-violet-200 bg-violet-50 text-violet-700",
};

function fmt(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
    hour12: false,
  }).format(d);
}

// "in 3h 12m" / "in 2d 4h" / "in 8m" for the time from now until the next run.
function relative(ms: number): string {
  if (ms <= 0) return "due now";
  const mins = Math.round(ms / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `in ${d}d ${h}h`;
  if (h > 0) return `in ${h}h ${m}m`;
  return `in ${m}m`;
}

export default async function AdminCronsPage() {
  const access = await requireAdminPage("crons");
  if (!access) redirect("/admin");

  const now = new Date();
  const jobs = listCronJobs()
    .map((j) => ({ job: j, next: nextRunUtc(j.schedule, now) }))
    .sort((a, b) => (a.next?.getTime() ?? Infinity) - (b.next?.getTime() ?? Infinity));

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="crons" />
      <PageHeader title="Cron jobs" subtitle="· scheduled automation, read-only" />

      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs leading-relaxed text-slate-600">
        These jobs run automatically on Vercel Cron. Schedules are defined in{" "}
        <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px] text-slate-700">vercel.json</code>{" "}
        and evaluated in <strong>UTC</strong>; each route is protected by the{" "}
        <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px] text-slate-700">CRON_SECRET</code>{" "}
        bearer token. This page is a read-only view, editing a schedule is a code change.
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {jobs.map(({ job, next }) => (
          <div key={job.path} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">{job.title}</h3>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${CATEGORY_META[job.category]}`}>
                {job.category}
              </span>
            </div>

            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{job.description}</p>

            <dl className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-xs">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-400">Schedule</dt>
                <dd className="text-right">
                  <span className="font-medium text-slate-800">{humanizeCron(job.schedule)}</span>
                  <span className="ml-1.5 font-mono text-[10px] text-slate-400">{job.schedule}</span>
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-400">Next run</dt>
                <dd className="text-right">
                  {next ? (
                    <>
                      <span className="font-medium text-slate-800">{relative(next.getTime() - now.getTime())}</span>
                      <div className="mt-0.5 text-[10px] text-slate-400">
                        {fmt(next, "UTC")} UTC · {fmt(next, "Europe/Paris")} Paris
                      </div>
                    </>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-400">Endpoint</dt>
                <dd className="truncate text-right font-mono text-[10px] text-slate-500" title={job.path}>
                  {job.path}
                </dd>
              </div>
            </dl>

            <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
              Automatic
              {job.manualTrigger ? <span>· an admin can also trigger it on demand</span> : null}
            </div>
          </div>
        ))}
      </div>

      {jobs.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
          No scheduled jobs configured.
        </div>
      ) : null}
    </main>
  );
}
