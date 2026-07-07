import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { listAllTimesheets, type AdminTimesheetRecord } from "@/lib/airtable";
import { PrintTrigger } from "./print-trigger";

export const dynamic = "force-dynamic";

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Printable (Save-as-PDF) report of the timesheets currently filtered in the
// admin Timesheets page. The filters are passed as query params and re-applied
// here server-side. Lives at a top-level /print route (root layout only, no app
// header) and auto-opens the print dialog. Admin-gated in-page. Covers the
// officially-logged lifecycle (Submitted/Invoiced/Paid), matching the CSV.
export default async function TimesheetsPrintPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    member?: string;
    project?: string;
    staffing?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  const sp = await searchParams;
  const statusFilter = (sp.status ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const member = sp.member ?? "";
  const project = sp.project ?? "";
  const staffing = sp.staffing ?? "";
  const from = sp.from ?? "";
  const to = sp.to ?? "";

  const rows = (await listAllTimesheets())
    .filter((t) => {
      // Exports only ever cover the billing lifecycle.
      if (t.status !== "Submitted" && t.status !== "Invoiced" && t.status !== "Paid") return false;
      if (statusFilter.length > 0 && !statusFilter.includes(t.status)) return false;
      if (member && t.memberCode !== member) return false;
      if (project && t.projectCode !== project) return false;
      if (staffing && t.staffingRecordId !== staffing) return false;
      if (from && (t.startDate ?? "") < from) return false;
      if (to && (t.startDate ?? "") > to) return false;
      return true;
    })
    .sort(
      (a, b) =>
        (a.memberName || a.memberCode).localeCompare(b.memberName || b.memberCode) ||
        (a.projectCode || "").localeCompare(b.projectCode || "") ||
        (a.startDate ?? "").localeCompare(b.startDate ?? ""),
    );

  const total = rows.reduce((s, t) => s + t.totalHours, 0);
  const members = new Set(rows.map((t) => t.memberCode)).size;
  const generatedAt = new Date().toLocaleString("en-US", { timeZone: "UTC" }) + " UTC";

  const filterBits: string[] = [];
  if (statusFilter.length > 0) filterBits.push(`Status: ${statusFilter.join(", ")}`);
  if (member) filterBits.push(`Member: ${member}`);
  if (project) filterBits.push(`Project: ${project}`);
  if (staffing) filterBits.push(`Staffing: ${rows[0]?.staffingCode || staffing}`);
  if (from) filterBits.push(`From ${longDate(from)}`);
  if (to) filterBits.push(`To ${longDate(to)}`);
  const filterLabel = filterBits.length > 0 ? filterBits.join(" · ") : "All Submitted / Invoiced / Paid";

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
            maxWidth: 1040,
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
            <h1>Timesheets report</h1>
            <div className="meta">
              <div>
                <strong>Filters:</strong> {filterLabel}
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
              {rows.length} timesheet{rows.length === 1 ? "" : "s"} · {members} member
              {members === 1 ? "" : "s"}
            </div>
          </div>
        </header>

        {rows.length === 0 ? (
          <div className="empty">No timesheets match these filters.</div>
        ) : (
          <table className="list">
            <thead>
              <tr>
                <th>Member</th>
                <th>Project</th>
                <th>Week</th>
                <th className="num">Mon</th>
                <th className="num">Tue</th>
                <th className="num">Wed</th>
                <th className="num">Thu</th>
                <th className="num">Fri</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div>{t.memberName || t.memberCode}</div>
                    <div className="muted mono">{t.memberCode}</div>
                  </td>
                  <td>
                    <div>{t.projectName || t.projectCode || "—"}</div>
                    <div className="muted mono">{t.staffingCode}</div>
                  </td>
                  <td className="nowrap">{weekRange(t)}</td>
                  {DAY_KEYS.map((k) => (
                    <td key={k} className="num">
                      {t[k].hours ? t[k].hours.toFixed(2) : "—"}
                    </td>
                  ))}
                  <td className="num strong">{t.totalHours.toFixed(2)}</td>
                </tr>
              ))}
              <tr className="total-row">
                <td colSpan={8}>Total</td>
                <td className="num">{total.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        )}

        <footer className="report-footer">HTP42 Timesheets · Generated {generatedAt}</footer>
      </div>
    </div>
  );
}

function weekRange(t: AdminTimesheetRecord): string {
  const start = t.startDate;
  const end = t.endDate ?? (start ? addDaysIso(start, 4) : null);
  if (!start) return "—";
  return `${longDate(start)}${end ? ` – ${longDate(end)}` : ""}`;
}

function longDate(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${d} ${MONTHS[Number(mo) - 1] ?? mo} ${y}`;
}

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
  .page { max-width: 1040px; margin: 0 auto; padding: 32px; background: white; }
  .report-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; }
  .brand { font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #64748b; }
  h1 { font-size: 24px; margin: 4px 0 12px; }
  .meta { font-size: 12px; color: #334155; line-height: 1.6; }
  .total-box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 16px; text-align: right; min-width: 180px; }
  .total-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; }
  .total-value { font-size: 28px; font-weight: 700; color: #1d4ed8; margin-top: 2px; }
  .total-sub { font-size: 12px; color: #64748b; }
  table.list { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.list th, table.list td { padding: 6px 8px; text-align: left; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  table.list th { font-weight: 600; color: #475569; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .strong { font-weight: 700; }
  .nowrap { white-space: nowrap; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; }
  .muted { color: #94a3b8; }
  .total-row td { border-top: 2px solid #cbd5e1; font-weight: 700; background: #f8fafc; }
  .empty { font-size: 13px; color: #64748b; padding: 24px 0; text-align: center; }
  .report-footer { margin-top: 32px; text-align: center; font-size: 11px; color: #94a3b8; }
  @page { margin: 12mm; }
  @media print {
    body { background: white; }
    .no-print { display: none !important; }
    .page { max-width: none; padding: 0; }
    tr { page-break-inside: avoid; }
    thead { display: table-header-group; }
  }
`;
