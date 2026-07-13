import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { listAllTimesheets } from "@/lib/airtable";
import { PrintTrigger } from "./print-trigger";
import { PRINT_CSS } from "@/lib/print-styles";

export const dynamic = "force-dynamic";

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
const DAY_LABELS: Record<(typeof DAY_KEYS)[number], string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Printable (Save-as-PDF) summary of a staffing's logged timesheets. Lives at
// a top-level /print route — NOT under /admin — so it inherits only the root
// layout and carries no application header/nav, exactly like /summary/print.
// Auto-opens the browser print dialog on load. Admin-gated in-page.
export default async function StaffingTimesheetPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  const { id } = await params;
  const rows = (await listAllTimesheets())
    .filter(
      (t) =>
        t.staffingRecordId === id &&
        ["Submitted", "Approved", "Invoiced", "Paid"].includes(t.status),
    )
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));

  const first = rows[0];
  const total = rows.reduce((s, t) => s + t.totalHours, 0);
  const generatedAt = new Date().toLocaleString("en-US", { timeZone: "UTC" }) + " UTC";

  return (
    <div className="print-wrap">
      <PrintTrigger />
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div
        className="no-print"
        style={{ padding: 16, background: "#f1f5f9", borderBottom: "1px solid #cbd5e1" }}
      >
        <div
          style={{
            maxWidth: 960,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div style={{ fontSize: 14, color: "#334155" }}>
            Use your browser&apos;s print dialog to save this report as a PDF.
          </div>
          <button
            type="button"
            id="trigger-print"
            style={{
              background: "#2563eb",
              color: "white",
              border: 0,
              borderRadius: 6,
              padding: "8px 14px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
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
            <h1>Staffing timesheet summary</h1>
            <div className="meta">
              <div>
                <strong>Consultant:</strong> {first?.memberName || first?.memberCode || "—"}
              </div>
              <div>
                <strong>Member code:</strong> {first?.memberCode || "—"}
              </div>
              <div>
                <strong>Project:</strong> {first?.projectCode || "—"}
                {first?.projectName ? ` · ${first.projectName}` : ""}
              </div>
              <div>
                <strong>Staffing:</strong> {first?.staffingCode || "—"}
              </div>
              <div>
                <strong>Generated:</strong> {generatedAt}
              </div>
            </div>
          </div>
          <div className="total-box">
            <div className="total-label">Total hours</div>
            <div className="total-value">{total.toFixed(2)}</div>
            <div className="total-sub">
              {rows.length} timesheet{rows.length === 1 ? "" : "s"}
            </div>
          </div>
        </header>

        <section>
          {rows.length === 0 ? (
            <div className="empty">No submitted timesheets on this staffing yet.</div>
          ) : (
            rows.map((t) => {
              const start = t.startDate;
              const end = t.endDate ?? (start ? addDaysIso(start, 4) : null);
              return (
                <article key={t.id} className="timesheet">
                  <div className="ts-title">
                    Week of {longDate(start)}
                    {end ? ` to ${longDate(end)}` : ""}
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
                      {DAY_KEYS.map((k, i) => {
                        const dayIso = start ? addDaysIso(start, i) : null;
                        return (
                          <tr key={k}>
                            <td>
                              {DAY_LABELS[k]}
                              {dayIso ? (
                                <span className="muted" style={{ marginLeft: 6 }}>
                                  {shortDayDate(dayIso)}
                                </span>
                              ) : null}
                            </td>
                            <td className="num">{t[k].hours ? t[k].hours.toFixed(2) : "—"}</td>
                            <td style={{ whiteSpace: "pre-line" }}>
                              {t[k].task || <span className="muted">—</span>}
                            </td>
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
              );
            })
          )}
        </section>

        <footer className="report-footer">HTP42 Timesheets · Generated {generatedAt}</footer>
      </div>
    </div>
  );
}

// "04 May 2026" from an ISO yyyy-mm-dd.
function longDate(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${d} ${MONTHS[Number(mo) - 1] ?? mo} ${y}`;
}

// "04.05.26" (dd.mm.yy) from an ISO yyyy-mm-dd.
function shortDayDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${d}.${mo}.${y.slice(2)}`;
}

// Add n days to an ISO yyyy-mm-dd (UTC-based, no DST drift).
function addDaysIso(iso: string, n: number): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

