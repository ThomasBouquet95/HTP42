import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLedProjects, getProjectSummaryByCode, type ProjectSummary, type ProjectTeamMember } from "@/lib/airtable";
import { formatRange, formatHumanDate } from "@/lib/dates";
import { PrintTrigger } from "./print-trigger";

export const dynamic = "force-dynamic";

const HOURS_PER_DAY = 8;
const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
const DAY_LABELS: Record<(typeof DAY_KEYS)[number], string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
};

export default async function ProjectSummaryPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { project: code } = await searchParams;
  if (!code) redirect("/timesheets/team");

  const led = await getLedProjects(session.sub, session.memberCode);
  if (!led.some((p) => p.projectCode === code)) redirect("/timesheets/team");

  const summary = await getProjectSummaryByCode(code);
  if (!summary) redirect("/timesheets/team");

  const { project, members, totals } = summary;
  const allocatedHours = totals.allocatedDays * HOURS_PER_DAY;
  const progressPct = allocatedHours > 0 ? Math.min(100, (totals.actualHours / allocatedHours) * 100) : 0;
  const generatedAt = new Date().toLocaleString("en-US", { timeZone: "UTC" }) + " UTC";

  return (
    <div className="print-wrap">
      <PrintTrigger />
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="no-print" style={{ padding: 16, background: "#f1f5f9", borderBottom: "1px solid #cbd5e1" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "system-ui, sans-serif" }}>
          <div style={{ fontSize: 14, color: "#334155" }}>
            Use your browser&apos;s print dialog to save this report as a PDF.
          </div>
          <button
            type="button"
            id="trigger-print"
            style={{
              background: "#1e91f9", color: "white", border: 0, borderRadius: 6,
              padding: "8px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}
          >
            Print / Save as PDF
          </button>
        </div>
      </div>

      <div className="page">
        <header className="report-header">
          <div>
            <div className="brand">HTP42 · Project Summary</div>
            <h1>{project.projectName || project.projectCode}</h1>
            <div className="meta">
              <div>
                <strong>Project code:</strong> {project.projectCode}
                {project.clientCodes.length > 0 ? (
                  <> · <strong>Client:</strong> {project.clientCodes.join(", ")}</>
                ) : null}
              </div>
              <div>
                <strong>Period:</strong> {formatHumanDate(project.startDate)} → {formatHumanDate(project.endDate)}
                {project.status ? <> · <strong>Status:</strong> {project.status}</> : null}
              </div>
              <div><strong>Generated:</strong> {generatedAt}</div>
            </div>
          </div>
          <div className="summary-boxes">
            <div className="stat-box">
              <div className="stat-label">Team size</div>
              <div className="stat-value">{members.length}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Allocated</div>
              <div className="stat-value">{totals.allocatedDays.toFixed(1)} d</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Logged</div>
              <div className={`stat-value ${totals.actualDays > totals.allocatedDays ? "warn" : ""}`}>
                {totals.actualDays.toFixed(1)} d
              </div>
            </div>
            <div className="stat-box accent">
              <div className="stat-label">Used</div>
              <div className="stat-value">{progressPct.toFixed(0)}%</div>
            </div>
          </div>
        </header>

        {allocatedHours > 0 ? (
          <div className="progress-bar-wrap">
            <div className="progress-bar-labels">
              <span>Progress</span>
              <span>{totals.actualHours.toFixed(1)} / {allocatedHours.toFixed(0)} h</span>
            </div>
            <div className="progress-bar-track">
              <div
                className={`progress-bar-fill ${totals.actualHours > allocatedHours ? "over" : ""}`}
                style={{ width: `${Math.max(2, progressPct)}%` }}
              />
            </div>
          </div>
        ) : null}

        <section>
          <h2 className="section-title">Team Overview</h2>
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Code</th>
                <th>Role</th>
                <th className="num">Alloc. (d)</th>
                <th className="num">Logged (d)</th>
                <th className="num">Hours</th>
                <th className="num">Submitted</th>
                <th className="num">Draft</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const submitted = m.timesheets.filter((t) => t.status === "Submitted").length;
                const draft = m.timesheets.filter((t) => t.status === "Draft").length;
                const over = m.hoursActualTotal > m.daysAllocatedTotal * HOURS_PER_DAY && m.daysAllocatedTotal > 0;
                const roles = m.staffings
                  .map((s) => s.projectRole || s.roleInProject)
                  .filter(Boolean)
                  .filter((v, i, a) => a.indexOf(v) === i)
                  .join(", ");
                return (
                  <tr key={m.memberRecordId}>
                    <td className="bold">{m.memberName || m.memberCode}</td>
                    <td className="mono">{m.memberCode}</td>
                    <td>{roles || "—"}</td>
                    <td className="num">{m.daysAllocatedTotal > 0 ? m.daysAllocatedTotal.toFixed(1) : "—"}</td>
                    <td className={`num ${over ? "warn" : ""}`}>{m.daysActualTotal.toFixed(1)}</td>
                    <td className={`num ${over ? "warn" : ""}`}>{m.hoursActualTotal.toFixed(1)}</td>
                    <td className="num">{submitted}</td>
                    <td className="num">{draft}</td>
                  </tr>
                );
              })}
              <tr className="total-row">
                <td colSpan={3} className="bold">Total</td>
                <td className="num bold">{totals.allocatedDays.toFixed(1)}</td>
                <td className="num bold">{totals.actualDays.toFixed(1)}</td>
                <td className="num bold">{totals.actualHours.toFixed(1)}</td>
                <td className="num bold">{totals.submittedTimesheets}</td>
                <td className="num bold">{totals.draftTimesheets}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="page-break-before">
          <h2 className="section-title">Timesheets by Member</h2>
          {members.map((m) => (
            <MemberSection key={m.memberRecordId} member={m} />
          ))}
        </section>

        <footer className="report-footer">
          HTP42 · Project {project.projectCode} · Generated {generatedAt}
        </footer>
      </div>
    </div>
  );
}

function MemberSection({ member: m }: { member: ProjectTeamMember }) {
  if (m.timesheets.length === 0) return null;
  const submitted = m.timesheets.filter((t) => t.status === "Submitted").length;
  return (
    <div className="member-section">
      <div className="member-header">
        <span className="bold">{m.memberName || m.memberCode}</span>
        <span className="mono"> {m.memberCode}</span>
        <span className="muted"> · {m.timesheets.length} timesheet{m.timesheets.length === 1 ? "" : "s"} · {submitted} submitted · {(m.daysActualTotal).toFixed(1)} d logged</span>
      </div>
      {m.timesheets.map((t) => (
        <article key={t.id} className="timesheet">
          <div className="ts-header">
            <div>
              <span className="ts-title">{formatRange(t.startDate, t.endDate)}</span>
              <span className="ts-sub"> · {t.staffingCode || "—"} · {t.timesheetCode}</span>
            </div>
            <div className={`status status-${t.status.toLowerCase()}`}>{t.status}</div>
          </div>
          <table className="ts-table">
            <thead>
              <tr>
                <th>Day</th>
                <th className="num">Hrs</th>
                <th>Task</th>
              </tr>
            </thead>
            <tbody>
              {DAY_KEYS.map((k) => (
                <tr key={k}>
                  <td className="day-cell">{DAY_LABELS[k]}</td>
                  <td className="num">{t[k].hours ? t[k].hours.toFixed(1) : "—"}</td>
                  <td>{t[k].task || <span className="muted">—</span>}</td>
                </tr>
              ))}
              <tr className="total-row">
                <td className="bold">Total</td>
                <td className="num bold">{t.totalHours.toFixed(1)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </article>
      ))}
    </div>
  );
}

const PRINT_CSS = `
  :root { color-scheme: light; }
  body { margin: 0; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #0f172a; }
  .page { max-width: 1100px; margin: 0 auto; padding: 32px; background: white; }
  .report-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 20px; }
  .brand { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #64748b; }
  h1 { font-size: 22px; margin: 4px 0 10px; }
  .meta { font-size: 12px; color: #334155; line-height: 1.7; }
  .summary-boxes { display: flex; gap: 10px; flex-shrink: 0; }
  .stat-box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; text-align: center; min-width: 72px; }
  .stat-box.accent { background: #eff8ff; border-color: #bae0fd; }
  .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; }
  .stat-value { font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 2px; }
  .stat-value.warn { color: #b45309; }
  .progress-bar-wrap { margin-bottom: 20px; }
  .progress-bar-labels { display: flex; justify-content: space-between; font-size: 11px; color: #64748b; margin-bottom: 4px; }
  .progress-bar-track { height: 6px; border-radius: 999px; background: #e2e8f0; overflow: hidden; }
  .progress-bar-fill { height: 100%; background: #1e91f9; border-radius: 999px; }
  .progress-bar-fill.over { background: #f59e0b; }
  .section-title { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #334155; margin: 0 0 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px; }
  th, td { padding: 5px 7px; text-align: left; border-bottom: 1px solid #f1f5f9; }
  th { font-weight: 600; color: #475569; background: #f8fafc; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .bold { font-weight: 600; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: #475569; }
  .muted { color: #94a3b8; }
  .warn { color: #b45309; }
  .total-row td { border-top: 1px solid #cbd5e1; background: #f8fafc; }
  .member-section { margin-bottom: 20px; page-break-inside: avoid; }
  .member-header { font-size: 13px; font-weight: 600; color: #1e3a5f; border-left: 3px solid #1e91f9; padding: 4px 8px; background: #f0f9ff; margin-bottom: 8px; }
  .timesheet { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; margin-bottom: 8px; page-break-inside: avoid; }
  .ts-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .ts-title { font-weight: 600; font-size: 12px; }
  .ts-sub { font-size: 11px; color: #64748b; }
  .ts-table { margin-bottom: 0; }
  .ts-table th { background: transparent; }
  .day-cell { color: #475569; font-size: 11px; white-space: nowrap; }
  .status { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 999px; border: 1px solid; white-space: nowrap; }
  .status-draft { background: #f1f5f9; color: #334155; border-color: #cbd5e1; }
  .status-submitted { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
  .status-deleted { background: #fff7ed; color: #c2410c; border-color: #fed7aa; }
  .page-break-before { page-break-before: auto; }
  .report-footer { margin-top: 32px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; }
  @page { margin: 12mm; size: A4; }
  @media print {
    body { background: white; }
    .no-print { display: none !important; }
    .page { max-width: none; padding: 0; }
    .member-section { page-break-inside: avoid; }
  }
`;
