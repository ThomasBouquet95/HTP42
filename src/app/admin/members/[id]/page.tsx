import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { DownloadChip } from "@/components/download-chip";
import { Badge, StatusPill } from "@/components/badge";
import { StarRating } from "@/components/star-rating";
import {
  listAllInvoices,
  listAllMembers,
  listAllTimesheets,
  listSignInActivity,
  listSurveys,
} from "@/lib/airtable";

export const dynamic = "force-dynamic";

function money(v: number | null, ccy: string): string {
  if (v == null) return "—";
  return `${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}${ccy ? " " + ccy : ""}`;
}

// "8 Jul 2026" from an ISO date/datetime.
function prettyDate(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// "3 days ago" / "just now" — coarse, good enough for an at-a-glance page.
function relative(raw: string | null | undefined, now: number): string {
  if (!raw) return "never";
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return "—";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 90) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? "" : "s"} ago`;
  return `${Math.round(mo / 12)} year${Math.round(mo / 12) === 1 ? "" : "s"} ago`;
}

function initials(name: string, code: string): string {
  const src = (name || code || "?").trim();
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export default async function AdminMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");
  const { id } = await params;

  const [members, signIns, invoices, timesheets, surveys] = await Promise.all([
    listAllMembers(),
    listSignInActivity(),
    listAllInvoices(),
    listAllTimesheets(),
    listSurveys(),
  ]);

  const member = members.find((m) => m.id === id);
  if (!member) notFound();

  const conn = signIns.find((s) => s.id === id) ?? null;
  const memberInvoices = invoices
    .filter((i) => i.memberRecordId === id)
    .sort((a, b) => (b.submissionDate ?? "").localeCompare(a.submissionDate ?? ""));
  const memberTimesheets = timesheets
    .filter((t) => t.memberRecordId === id)
    .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));

  // Client reviews = per-member ratings inside completed client surveys,
  // matched by member code.
  const reviews: Array<{
    project: string;
    by: string;
    completedAt: string | null;
    grade: number | null;
    wentWell: string;
    improve: string;
  }> = [];
  for (const s of surveys) {
    if (!s.completedAt) continue;
    for (const mr of s.memberRatings) {
      if (mr.code !== member.memberCode) continue;
      if (mr.grade == null && !mr.wentWell && !mr.improve) continue;
      reviews.push({
        project: s.projectName || s.projectCode,
        by: s.recipientName,
        completedAt: s.completedAt,
        grade: mr.grade,
        wentWell: mr.wentWell,
        improve: mr.improve,
      });
    }
  }
  reviews.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  const graded = reviews.map((r) => r.grade).filter((g): g is number => g != null);
  const avgGrade = graded.length ? graded.reduce((s, g) => s + g, 0) / graded.length : null;

  const now = Date.now();
  const contact = [
    member.email,
    member.phone,
    member.country,
    member.legalEntity,
  ].filter(Boolean);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="members" />

      <Link
        href="/admin/members"
        className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M10 4L6 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Members
      </Link>

      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-sm font-semibold text-brand-700 ring-2 ring-white">
          {member.photo?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={member.photo.url} alt="" className="h-full w-full object-cover demo-blur" />
          ) : (
            <span className="demo-blur">{initials(member.fullName, member.memberCode)}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-900 demo-blur">
              {member.fullName || member.memberCode}
            </h1>
            <StatusPill status={member.status} />
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            <span className="font-mono">{member.memberCode}</span>
            {member.role ? <span> · {member.role}</span> : null}
            {member.title ? <span className="demo-blur"> · {member.title}</span> : null}
          </div>
          {contact.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 demo-blur">
              {member.email ? <span>{member.email}</span> : null}
              {member.phone ? <span>{member.phone}</span> : null}
              {member.country ? <span>{member.country}</span> : null}
              {member.legalEntity ? <span>{member.legalEntity}</span> : null}
            </div>
          ) : null}
        </div>
        <div className="text-right text-xs text-slate-500">
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Daily rate</div>
          <div className="demo-blur font-medium text-slate-700">
            {money(member.htp42DailyRate ?? member.dailyRate, member.currency)}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left rail: about, CV, connection */}
        <div className="space-y-4">
          <Card title="Description">
            {member.introduction ? (
              <p className="whitespace-pre-line text-xs leading-relaxed text-slate-700 demo-blur">
                {member.introduction}
              </p>
            ) : (
              <Empty>No description on file.</Empty>
            )}
          </Card>

          <Card title="CV">
            <div className="flex items-center gap-3">
              <DownloadChip url={member.cv?.url} title="Open CV" emptyTitle="No CV on file" />
              <div className="min-w-0 text-xs text-slate-600 demo-blur">
                {member.cv?.filename || (member.cv ? "CV.pdf" : "No CV uploaded")}
              </div>
            </div>
          </Card>

          <Card title="App connection">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <Stat label="Last sign-in" value={relative(conn?.lastSignIn, now)} sub={prettyDate(conn?.lastSignIn)} />
              <Stat label="Sign-ins" value={conn ? String(conn.signInCount) : "0"} />
              <Stat label="Last active" value={relative(conn?.lastActivity, now)} sub={prettyDate(conn?.lastActivity)} />
              <Stat
                label="Status"
                value={
                  !conn?.lastSignIn ? "Never signed in" : "Has access"
                }
              />
            </dl>
            <ActivityStrip days={conn?.activityDays ?? {}} now={now} />
          </Card>
        </div>

        {/* Main: reviews, invoices, timesheets */}
        <div className="space-y-4 lg:col-span-2">
          <Card
            title="Client reviews"
            action={
              <Link
                href={`/admin/member-reviews?member=${encodeURIComponent(member.memberCode)}`}
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                Open reviews →
              </Link>
            }
          >
            {reviews.length === 0 ? (
              <Empty>No client reviews yet.</Empty>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <StarRating value={avgGrade} readOnly size={16} />
                  <span className="text-xs text-slate-500">
                    {avgGrade != null ? avgGrade.toFixed(1) : "—"} avg · {reviews.length} review
                    {reviews.length === 1 ? "" : "s"}
                  </span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {reviews.map((r, i) => (
                    <li key={i} className="py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 truncate text-xs font-medium text-slate-800 demo-blur">
                          {r.project}
                        </div>
                        {r.grade != null ? <StarRating value={r.grade} readOnly size={13} /> : null}
                      </div>
                      {r.wentWell ? (
                        <p className="mt-1 text-[11px] text-slate-600 demo-blur">
                          <span className="text-emerald-600">＋</span> {r.wentWell}
                        </p>
                      ) : null}
                      {r.improve ? (
                        <p className="mt-0.5 text-[11px] text-slate-600 demo-blur">
                          <span className="text-amber-600">△</span> {r.improve}
                        </p>
                      ) : null}
                      <div className="mt-1 text-[10px] text-slate-400">
                        {r.by ? <span className="demo-blur">{r.by}</span> : "Client"} · {prettyDate(r.completedAt)}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card title={`Invoices sent · ${memberInvoices.length}`}>
            {memberInvoices.length === 0 ? (
              <Empty>No invoices submitted yet.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">Invoice</th>
                      <th className="px-2 py-1.5 text-left font-medium">Project</th>
                      <th className="px-2 py-1.5 text-left font-medium">Submitted</th>
                      <th className="px-2 py-1.5 text-right font-medium">Amount</th>
                      <th className="px-2 py-1.5 text-center font-medium">Status</th>
                      <th className="px-2 py-1.5 text-center font-medium">PDF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memberInvoices.map((i) => (
                      <tr key={i.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-2 py-1.5 font-mono text-[11px] text-slate-700">{i.invoiceCode || "—"}</td>
                        <td className="px-2 py-1.5 text-slate-600">{i.projectCode || "—"}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-slate-600">{prettyDate(i.submissionDate)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums demo-blur text-slate-700">
                          {money(i.amount, i.currency)}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          {i.status ? <StatusPill status={i.status} /> : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <DownloadChip url={i.pdf?.url} title="Open invoice PDF" emptyTitle="No PDF" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title={`Timesheets sent · ${memberTimesheets.length}`}>
            {memberTimesheets.length === 0 ? (
              <Empty>No timesheets submitted yet.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">Week</th>
                      <th className="px-2 py-1.5 text-left font-medium">Project</th>
                      <th className="px-2 py-1.5 text-right font-medium">Hours</th>
                      <th className="px-2 py-1.5 text-center font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memberTimesheets.slice(0, 30).map((t) => (
                      <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-2 py-1.5 whitespace-nowrap text-slate-600">
                          {prettyDate(t.startDate)}
                          {t.endDate ? ` → ${prettyDate(t.endDate)}` : ""}
                        </td>
                        <td className="px-2 py-1.5 text-slate-600">{t.projectCode || "—"}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
                          {(Number(t.totalHours) || 0).toFixed(2)} h
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <StatusPill status={t.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {memberTimesheets.length > 30 ? (
                  <p className="px-2 py-2 text-[11px] text-slate-400">
                    Showing the 30 most recent of {memberTimesheets.length}.
                  </p>
                ) : null}
              </div>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <h2 className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-slate-800">{value}</dd>
      {sub && sub !== "—" ? <div className="text-[10px] text-slate-400">{sub}</div> : null}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-slate-500">{children}</p>;
}

// Compact 14-day open-activity strip from the per-day counts.
function ActivityStrip({ days, now }: { days: Record<string, number>; now: number }) {
  const cells: Array<{ key: string; count: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    cells.push({ key, count: days[key] ?? 0 });
  }
  const any = cells.some((c) => c.count > 0);
  return (
    <div className="mt-3">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">Last 14 days</div>
      <div className="flex items-end gap-0.5">
        {cells.map((c) => (
          <span
            key={c.key}
            title={`${c.key}: ${c.count} open${c.count === 1 ? "" : "s"}`}
            className={`h-4 flex-1 rounded-sm ${
              c.count === 0 ? "bg-slate-100" : c.count < 3 ? "bg-brand-200" : "bg-brand-500"
            }`}
          />
        ))}
      </div>
      {!any ? <div className="mt-1 text-[10px] text-slate-400">No recorded opens.</div> : null}
    </div>
  );
}
