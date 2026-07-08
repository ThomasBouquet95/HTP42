import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getTimesheetsForMember, type TimesheetRecord } from "@/lib/airtable";
import { formatWeekRange, parseIsoDate, toIsoDate } from "@/lib/dates";
import { PrintTrigger } from "./print-trigger";
import { PRINT_CSS } from "@/lib/print-styles";

export const dynamic = "force-dynamic";

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
const DAY_LABELS: Record<(typeof DAY_KEYS)[number], string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
};

type SearchParams = Promise<{
  status?: string;
  project?: string;
  staffing?: string;
  from?: string;
  to?: string;
}>;

export default async function SummaryPrintPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const timesheets = await getTimesheetsForMember(session.memberCode);
  const filtered = applyFilters(timesheets, sp);
  const total = filtered.reduce((sum, t) => sum + t.totalHours, 0);
  const byProject = groupBy(filtered, (t) => t.projectCode || "—", (t) => t.projectName || t.projectCode || "—");
  const byStaffing = groupBy(
    filtered,
    (t) => t.staffingRecordId,
    (t) => `${t.staffingCode} — ${t.projectName || t.projectCode || "—"}`,
  );

  const filterSummary = describeFilters(sp);
  const generatedAt = new Date().toLocaleString("en-US", { timeZone: "UTC" }) + " UTC";

  return (
    <div className="print-wrap">
      <PrintTrigger />
      <style
        dangerouslySetInnerHTML={{
          __html: PRINT_CSS,
        }}
      />

      <div className="no-print" style={{ padding: 16, background: "#f1f5f9", borderBottom: "1px solid #cbd5e1" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "system-ui, sans-serif" }}>
          <div style={{ fontSize: 14, color: "#334155" }}>
            Use your browser&apos;s print dialog to save this report as a PDF.
          </div>
          <button
            type="button"
            id="trigger-print"
            style={{
              background: "#2563eb", color: "white", border: 0, borderRadius: 6,
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
            <div className="brand">HTP42 Timesheets</div>
            <h1>Hours Report</h1>
            <div className="meta">
              <div><strong>Consultant:</strong> {session.fullName || session.email}</div>
              <div><strong>Member code:</strong> {session.memberCode}</div>
              <div><strong>Filters:</strong> {filterSummary}</div>
              <div><strong>Generated:</strong> {generatedAt}</div>
            </div>
          </div>
          <div className="total-box">
            <div className="total-label">Total hours</div>
            <div className="total-value">{total.toFixed(2)}</div>
            <div className="total-sub">{filtered.length} timesheet{filtered.length === 1 ? "" : "s"}</div>
          </div>
        </header>

        <section className="breakdowns">
          <div className="panel">
            <h2>By project</h2>
            {byProject.length === 0 ? (
              <div className="empty">No data.</div>
            ) : (
              <table className="small">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th className="num">Weeks</th>
                    <th className="num">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {byProject.map((p) => (
                    <tr key={p.key}>
                      <td>{p.label}</td>
                      <td className="num">{p.weeks}</td>
                      <td className="num">{p.hours.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="panel">
            <h2>By staffing</h2>
            {byStaffing.length === 0 ? (
              <div className="empty">No data.</div>
            ) : (
              <table className="small">
                <thead>
                  <tr>
                    <th>Staffing</th>
                    <th className="num">Weeks</th>
                    <th className="num">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {byStaffing.map((s) => (
                    <tr key={s.key}>
                      <td>{s.label}</td>
                      <td className="num">{s.weeks}</td>
                      <td className="num">{s.hours.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section>
          <h2 className="section-title">Timesheets</h2>
          {filtered.length === 0 ? (
            <div className="empty">No timesheets match these filters.</div>
          ) : (
            filtered.map((t) => (
              <article key={t.id} className="timesheet">
                <div className="ts-header">
                  <div>
                    <div className="ts-title">
                      {t.timesheetCode} — {t.projectName || t.projectCode || "—"}
                    </div>
                    <div className="ts-sub">
                      Staffing <span className="mono">{t.staffingCode}</span> · {formatWeekRange(t.startDate, t.endDate)}
                      {t.submissionDate ? ` · Submitted ${t.submissionDate}` : ""}
                    </div>
                  </div>
                </div>
                <table className="ts-table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th className="num">Hours</th>
                      <th>Task description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DAY_KEYS.map((k) => {
                      const iso = dayIsoFor(t.startDate, k);
                      return (
                        <tr key={k}>
                          <td>
                            <div>{DAY_LABELS[k]}</div>
                            {iso ? <div className="muted" style={{ fontSize: 10 }}>{formatPrintDate(iso)}</div> : null}
                          </td>
                          <td className="num">{t[k].hours ? t[k].hours.toFixed(2) : "—"}</td>
                          <td style={{ whiteSpace: "pre-line" }}>{t[k].task || <span className="muted">—</span>}</td>
                        </tr>
                      );
                    })}
                    <tr className="total-row">
                      <td>Total</td>
                      <td className="num">{t.totalHours.toFixed(2)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </article>
            ))
          )}
        </section>

        <footer className="report-footer">
          HTP42 Timesheets · Generated {generatedAt}
        </footer>
      </div>
    </div>
  );
}

function applyFilters(
  rows: TimesheetRecord[],
  sp: { status?: string; project?: string; staffing?: string; from?: string; to?: string },
): TimesheetRecord[] {
  return rows.filter((t) => {
    // Reports include the full submitted lifecycle (Submitted, Invoiced,
    // Paid). Draft and Deleted are always excluded; the internal status
    // itself isn't rendered to keep the billing lifecycle private.
    if (t.status !== "Submitted" && t.status !== "Invoiced" && t.status !== "Paid") {
      return false;
    }
    if (
      sp.status &&
      sp.status !== "Submitted" &&
      sp.status !== "Invoiced" &&
      sp.status !== "Paid"
    ) {
      return false;
    }
    if (sp.project && t.projectCode !== sp.project) return false;
    if (sp.staffing && t.staffingRecordId !== sp.staffing) return false;
    if (sp.from && (t.startDate ?? "") < sp.from) return false;
    if (sp.to && (t.startDate ?? "") > sp.to) return false;
    return true;
  });
}

function groupBy(
  rows: TimesheetRecord[],
  keyFn: (t: TimesheetRecord) => string,
  labelFn: (t: TimesheetRecord) => string,
) {
  const map = new Map<string, { key: string; label: string; hours: number; weeks: number }>();
  for (const t of rows) {
    const key = keyFn(t);
    const cur = map.get(key) ?? { key, label: labelFn(t), hours: 0, weeks: 0 };
    cur.hours += t.totalHours;
    cur.weeks += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.hours - a.hours);
}

function dayIsoFor(startIso: string | null, key: (typeof DAY_KEYS)[number]): string | null {
  if (!startIso) return null;
  const base = parseIsoDate(startIso);
  const idx = DAY_KEYS.indexOf(key);
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + idx));
  return toIsoDate(d);
}

function formatPrintDate(iso: string): string {
  return parseIsoDate(iso).toLocaleDateString("en-US", {
    weekday: undefined,
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function describeFilters(sp: {
  status?: string;
  project?: string;
  staffing?: string;
  from?: string;
  to?: string;
}): string {
  const parts: string[] = [];
  if (sp.project) parts.push(`Project = ${sp.project}`);
  if (sp.staffing) parts.push(`Staffing id = ${sp.staffing}`);
  if (sp.from) parts.push(`From ${sp.from}`);
  if (sp.to) parts.push(`To ${sp.to}`);
  return parts.join(" · ");
}

