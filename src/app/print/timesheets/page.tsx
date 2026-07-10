import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { listAllTimesheets, type AdminTimesheetRecord } from "@/lib/airtable";
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
  const csv = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const statusFilter = csv(sp.status);
  const member = csv(sp.member);
  const project = csv(sp.project);
  const staffing = csv(sp.staffing);
  const from = sp.from ?? "";
  const to = sp.to ?? "";

  const rows = (await listAllTimesheets())
    .filter((t) => {
      // Exports only ever cover the billing lifecycle.
      if (t.status !== "Submitted" && t.status !== "Invoiced" && t.status !== "Paid") return false;
      if (statusFilter.length > 0 && !statusFilter.includes(t.status)) return false;
      if (member.length && !member.includes(t.memberCode)) return false;
      if (project.length && !project.includes(t.projectCode)) return false;
      if (staffing.length && !staffing.includes(t.staffingRecordId)) return false;
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
  if (member.length) filterBits.push(`Member: ${member.join(", ")}`);
  if (project.length) filterBits.push(`Project: ${project.join(", ")}`);
  if (staffing.length) filterBits.push(`Staffing: ${staffing.length === 1 ? rows[0]?.staffingCode || staffing[0] : `${staffing.length} selected`}`);
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
          <section>
            {rows.map((t) => {
              const start = t.startDate;
              return (
                <article key={t.id} className="timesheet">
                  <div className="ts-head">
                    <div className="ts-who">
                      <span className="ts-member">{t.memberName || t.memberCode}</span>
                      <span className="ts-sub">
                        {t.memberCode} · {t.projectCode || "—"}
                        {t.projectName ? ` · ${t.projectName}` : ""} · {t.staffingCode}
                      </span>
                    </div>
                    <div className="ts-week">
                      {weekRange(t)} · <strong>{t.totalHours.toFixed(2)} h</strong>
                    </div>
                  </div>
                  <table className="ts-table">
                    <thead>
                      <tr>
                        <th>Day</th>
                        <th className="num">Hours</th>
                        <th>Task / comment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DAY_KEYS.map((k, i) => {
                        const dayIso = start ? addDaysIso(start, i) : null;
                        return (
                          <tr key={k}>
                            <td className="nowrap">
                              {DAY_LABELS[k]}
                              {dayIso ? <span className="muted" style={{ marginLeft: 6 }}>{shortDayDate(dayIso)}</span> : null}
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
            })}
          </section>
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

function shortDayDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${d}.${mo}.${y.slice(2)}`;
}

function addDaysIso(iso: string, n: number): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

