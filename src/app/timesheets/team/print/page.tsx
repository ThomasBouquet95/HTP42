import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLedProjects, getProjectSummaryByCode, type ProjectSummary, type ProjectTeamMember } from "@/lib/airtable";
import { formatWeekRange, formatHumanDate } from "@/lib/dates";
import { PrintTrigger } from "./print-trigger";
import { PRINT_CSS } from "@/lib/print-styles";

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
                const submitted = m.timesheets.filter((t) =>
                  ["Submitted", "Approved", "Invoiced", "Paid"].includes(t.status),
                ).length;
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
  // Reports cover the logged lifecycle: Submitted, Approved, Invoiced, Paid.
  // Draft / Rejected / Cancelled / Deleted are filtered out before counting and
  // rendering. The internal status isn't surfaced in the printed PDF.
  const submittedTimesheets = m.timesheets.filter((t) =>
    ["Submitted", "Approved", "Invoiced", "Paid"].includes(t.status),
  );
  if (submittedTimesheets.length === 0) return null;
  return (
    <div className="member-section">
      <div className="member-header">
        <span className="bold">{m.memberName || m.memberCode}</span>
        <span className="mono"> {m.memberCode}</span>
        <span className="muted"> · {submittedTimesheets.length} submitted timesheet{submittedTimesheets.length === 1 ? "" : "s"} · {(m.daysActualTotal).toFixed(1)} d logged</span>
      </div>
      {submittedTimesheets.map((t) => (
        <article key={t.id} className="timesheet">
          <div className="ts-header">
            <div>
              <span className="ts-title">{formatWeekRange(t.startDate, t.endDate)}</span>
              <span className="ts-sub"> · {t.staffingCode || "—"} · {t.timesheetCode}</span>
            </div>
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
                  <td style={{ whiteSpace: "pre-line" }}>{t[k].task || <span className="muted">—</span>}</td>
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

