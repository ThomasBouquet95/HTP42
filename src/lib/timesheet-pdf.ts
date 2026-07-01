import PDFDocument from "pdfkit";
import type { TimesheetRecord } from "./airtable";

// Server-side PDF rendering for the timesheet summary — used both as the
// attachment shipped with a member-submitted invoice email and as the
// per-staffing export downloaded from the admin timesheets table. Uses pdfkit
// (pure JS, no chromium) so it runs fine inside a Vercel serverless function.
//
// Layout: a header block (title + project/staffing meta on the left, totals
// box on the right), then one table per week with day-by-day hours and task
// notes, then a total row per week.

const HOURS_PER_DAY = 8;

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
const DAY_LABEL: Record<(typeof DAY_KEYS)[number], string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
};

// Page geometry (A4, 40pt margins).
const LEFT = 40;
const RIGHT = 555;
const META_WIDTH = 320; // keep left-hand meta clear of the totals box
const BOX_X = 380;
const BOX_W = 175;

export type PdfTimesheet = Pick<
  TimesheetRecord,
  | "timesheetCode"
  | "staffingCode"
  | "projectCode"
  | "projectName"
  | "startDate"
  | "endDate"
  | "submissionDate"
  | "totalHours"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
>;

export type TimesheetPdfMeta = {
  memberName: string;
  memberCode: string;
  amount: number | null;
  currency: string;
  comment: string;
  staffingCode: string;
  projectCode: string;
  projectName: string;
  // Optional header overrides. title defaults to "Timesheet summary".
  // consultant, when set, is shown as the first meta line ("Consultant: …").
  title?: string;
  subtitle?: string;
  consultant?: string;
};

export function generateTimesheetSummaryPdf(
  meta: TimesheetPdfMeta,
  timesheets: PdfTimesheet[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ----- Header --------------------------------------------------------
    // Brand kicker, matching the HTML report header.
    doc
      .fontSize(9)
      .fillColor("#64748b")
      .text("HTP42 TIMESHEETS", LEFT, doc.y, { characterSpacing: 1, width: RIGHT - LEFT });
    doc.moveDown(0.15);
    doc.fontSize(18).fillColor("#0f172a").text(meta.title ?? "Timesheet summary", LEFT, doc.y, {
      width: RIGHT - LEFT,
    });
    doc.moveDown(0.5);

    const totalHours = timesheets.reduce((s, t) => s + (t.totalHours ?? 0), 0);
    const totalDays = totalHours / HOURS_PER_DAY;

    // Left-hand meta column (constrained width so it never runs under the
    // totals box). Consultant, then Project, then Staffing.
    const metaTop = doc.y;
    doc.fontSize(9).fillColor("#475569");
    if (meta.consultant) {
      doc.text(`Consultant: ${meta.consultant}`, LEFT, metaTop, { width: META_WIDTH });
    }
    doc.text(
      `Project: ${meta.projectCode || "—"}${meta.projectName ? ` · ${meta.projectName}` : ""}`,
      LEFT,
      meta.consultant ? doc.y : metaTop,
      { width: META_WIDTH },
    );
    doc.text(`Staffing: ${meta.staffingCode || "—"}`, LEFT, doc.y, { width: META_WIDTH });
    if (meta.amount != null) {
      doc.text(
        `Invoice amount: ${meta.amount.toLocaleString("en-US", {
          maximumFractionDigits: 2,
        })} ${meta.currency}`,
        LEFT,
        doc.y,
        { width: META_WIDTH },
      );
    }
    if (meta.comment) {
      doc.text(`Comment: ${truncate(meta.comment, 220)}`, LEFT, doc.y, { width: META_WIDTH });
    }
    doc.text(`Generated: ${formatTodayLong()}`, LEFT, doc.y, { width: META_WIDTH });
    const metaBottom = doc.y;

    // Totals box on the right — drawn independently of the text cursor.
    const boxY = metaTop - 2;
    doc.rect(BOX_X, boxY, BOX_W, 56).strokeColor("#cbd5e1").lineWidth(0.75).stroke();
    doc.fillColor("#0f172a").fontSize(9).text("Timesheets", BOX_X + 10, boxY + 6, { width: 75 });
    doc.fontSize(16).text(String(timesheets.length), BOX_X + 10, boxY + 18, { width: 75 });
    doc.fontSize(9).fillColor("#0f172a").text("Total hours", BOX_X + 90, boxY + 6, { width: 75 });
    doc.fontSize(16).text(totalHours.toFixed(1), BOX_X + 90, boxY + 18, { width: 75 });
    doc
      .fontSize(8)
      .fillColor("#64748b")
      .text(`(${totalDays.toFixed(1)} days)`, BOX_X + 90, boxY + 38, { width: 75 });

    // Continue below whichever column is taller.
    doc.fillColor("#0f172a");
    doc.y = Math.max(metaBottom, boxY + 56) + 16;
    doc.x = LEFT;

    // ----- Per-week tables ----------------------------------------------
    for (const t of timesheets) {
      ensureSpace(doc, 130);
      const start = t.startDate;
      const end = t.endDate ?? (start ? addDaysIso(start, 4) : null);
      const rangeLabel =
        start && end
          ? `Week of ${longDate(start)} to ${longDate(end)}`
          : start
          ? `Week of ${longDate(start)}`
          : "Week";
      doc.fontSize(11).fillColor("#0f172a").text(rangeLabel, LEFT, doc.y, {
        width: RIGHT - LEFT,
      });
      doc.moveDown(0.35);

      // Table header
      const tableTop = doc.y;
      const colDay = LEFT;
      const colHours = 150;
      const colTask = 210;

      doc.fontSize(8).fillColor("#475569");
      doc.text("Day", colDay, tableTop, { width: 100 });
      doc.text("Hours", colHours, tableTop, { width: 40, align: "right" });
      doc.text("Task notes", colTask, tableTop, { width: RIGHT - colTask });
      doc
        .moveTo(LEFT, tableTop + 11)
        .lineTo(RIGHT, tableTop + 11)
        .strokeColor("#e2e8f0")
        .lineWidth(0.5)
        .stroke();

      let y = tableTop + 15;
      for (let i = 0; i < DAY_KEYS.length; i += 1) {
        const k = DAY_KEYS[i];
        const day = t[k] as { hours: number; task: string };
        const dayIso = start ? addDaysIso(start, i) : null;
        const dayLabel = dayIso ? `${DAY_LABEL[k]} ${shortDayDate(dayIso)}` : DAY_LABEL[k];
        doc.fontSize(9).fillColor("#0f172a");
        doc.text(dayLabel, colDay, y, { width: 100 });
        doc.text(day.hours ? day.hours.toFixed(2) : "—", colHours, y, {
          width: 40,
          align: "right",
        });
        doc.fillColor("#334155").text(day.task || "—", colTask, y, { width: RIGHT - colTask });
        // Advance past whichever wrapped further (task notes can be long).
        y = Math.max(y + 16, doc.y + 2);
      }
      // Total row
      doc
        .moveTo(LEFT, y + 1)
        .lineTo(RIGHT, y + 1)
        .strokeColor("#e2e8f0")
        .lineWidth(0.5)
        .stroke();
      doc.fontSize(9).fillColor("#0f172a");
      doc.text("Total", colDay, y + 5, { width: 100 });
      doc.text((t.totalHours ?? 0).toFixed(2), colHours, y + 5, { width: 40, align: "right" });
      doc.y = y + 22;
      doc.x = LEFT;
      doc.moveDown(0.5);
    }

    // ----- Footer -------------------------------------------------------
    ensureSpace(doc, 30);
    doc
      .moveTo(LEFT, doc.y)
      .lineTo(RIGHT, doc.y)
      .strokeColor("#cbd5e1")
      .lineWidth(0.5)
      .stroke();
    doc
      .moveDown(0.4)
      .fontSize(8)
      .fillColor("#94a3b8")
      .text("Generated by the HTP42 portal.", LEFT, doc.y, { width: RIGHT - LEFT });

    doc.end();
  });
}

function ensureSpace(doc: InstanceType<typeof PDFDocument>, needed: number) {
  // pdfkit doesn't auto-paginate when we hand-draw stuff; nudge it.
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1)}…`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// "04 May 2026" from an ISO yyyy-mm-dd.
function longDate(iso: string): string {
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

// Add n days to an ISO yyyy-mm-dd, returning ISO. UTC-based so no DST drift.
function addDaysIso(iso: string, n: number): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function formatTodayLong(): string {
  return new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
