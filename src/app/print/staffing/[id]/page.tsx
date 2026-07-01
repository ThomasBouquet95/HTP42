import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { listAllTimesheets } from "@/lib/airtable";
import { PrintTrigger } from "./print-trigger";

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
        (t.status === "Submitted" || t.status === "Invoiced" || t.status === "Paid"),
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

const PRINT_CSS = `
  :root { color-scheme: light; }
  body { margin: 0; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #0f172a; }
  .page { max-width: 960px; margin: 0 auto; padding: 32px; background: white; }
  .report-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; }
  .brand { font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #64748b; }
  h1 { font-size: 24px; margin: 4px 0 12px; }
  .meta { font-size: 12px; color: #334155; line-height: 1.6; }
  .total-box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 16px; text-align: right; min-width: 160px; }
  .total-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; }
  .total-value { font-size: 28px; font-weight: 700; color: #1d4ed8; margin-top: 2px; }
  .total-sub { font-size: 12px; color: #64748b; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 6px 8px; text-align: left; border-bottom: 1px solid #f1f5f9; }
  th { font-weight: 600; color: #475569; background: #f8fafc; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .timesheet { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 14px; page-break-inside: avoid; }
  .ts-title { font-weight: 600; font-size: 14px; margin-bottom: 8px; }
  .ts-table th { background: transparent; border-bottom: 1px solid #e2e8f0; }
  .ts-table .total-row td { border-top: 1px solid #cbd5e1; font-weight: 600; background: #f8fafc; }
  .muted { color: #94a3b8; }
  .empty { font-size: 12px; color: #64748b; padding: 12px 0; }
  .report-footer { margin-top: 32px; text-align: center; font-size: 11px; color: #94a3b8; }
  @page { margin: 14mm; }
  @media print {
    body { background: white; }
    .no-print { display: none !important; }
    .page { max-width: none; padding: 0; }
  }
`;
