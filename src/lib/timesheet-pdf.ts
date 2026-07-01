import PDFDocument from "pdfkit";
import type { TimesheetRecord } from "./airtable";

// Server-side PDF rendering for the timesheet attachment that ships
// alongside a member-submitted invoice email. Uses pdfkit (pure JS, no
// chromium dependency) so it works fine inside a Vercel serverless
// function with no cold-start fireworks.
//
// Layout: one header block (member + period + total hours), then one
// table per week with day-by-day hours and task notes, then a final
// total row across all weeks.

const HOURS_PER_DAY = 8;

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
const DAY_LABEL: Record<(typeof DAY_KEYS)[number], string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
};

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
  // Optional header overrides. Default to the invoice-attachment wording so
  // existing callers are unchanged; the admin staffing export passes its own.
  title?: string;
  subtitle?: string;
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
    doc.fontSize(16).fillColor("#0f172a").text(meta.title ?? "Timesheet summary", { continued: false });
    doc.moveDown(0.2);
    doc
      .fontSize(10)
      .fillColor("#475569")
      .text(
        meta.subtitle ??
          `Attached to the invoice submission from ${meta.memberName} (${meta.memberCode}).`,
      );
    doc.moveDown(0.5);

    const totalHours = timesheets.reduce((s, t) => s + (t.totalHours ?? 0), 0);
    const totalDays = totalHours / HOURS_PER_DAY;

    // Two-column metadata grid: invoice context on the left, totals on the right.
    const yStart = doc.y;
    doc.fontSize(9).fillColor("#475569");
    doc.text(`Staffing: ${meta.staffingCode || "—"}`, 40, yStart);
    doc.text(`Project: ${meta.projectCode || "—"}${meta.projectName ? ` · ${meta.projectName}` : ""}`);
    if (meta.amount != null) {
      doc.text(
        `Invoice amount: ${meta.amount.toLocaleString("en-US", {
          maximumFractionDigits: 2,
        })} ${meta.currency}`,
      );
    }
    if (meta.comment) {
      doc.text(`Comment: ${truncate(meta.comment, 220)}`);
    }
    doc.text(`Generated: ${formatTodayLong()}`);
    // Totals box on the right.
    const boxX = 380;
    const boxY = yStart - 2;
    doc.rect(boxX, boxY, 175, 56).strokeColor("#cbd5e1").lineWidth(0.75).stroke();
    doc.fillColor("#0f172a").fontSize(9).text("Timesheets", boxX + 10, boxY + 6);
    doc.fontSize(16).text(String(timesheets.length), boxX + 10, boxY + 18);
    doc.fontSize(9).fillColor("#0f172a").text("Total hours", boxX + 90, boxY + 6);
    doc
      .fontSize(16)
      .text(totalHours.toFixed(1), boxX + 90, boxY + 18, { width: 75 });
    doc
      .fontSize(8)
      .fillColor("#64748b")
      .text(`(${totalDays.toFixed(1)} days)`, boxX + 90, boxY + 38, { width: 75 });

    doc.fillColor("#0f172a");
    // Move past the box.
    doc.y = Math.max(doc.y, boxY + 56) + 14;

    // ----- Per-timesheet tables -----------------------------------------
    for (const t of timesheets) {
      ensureSpace(doc, 130);
      doc.fontSize(11).fillColor("#0f172a");
      doc.text(
        `Week of ${t.startDate ?? "—"}${t.endDate ? ` to ${t.endDate}` : ""}`,
        { continued: false },
      );
      doc
        .fontSize(8)
        .fillColor("#64748b")
        .text(
          `${t.timesheetCode || "—"} · staffing ${t.staffingCode || "—"} · ${t.projectCode}${
            t.projectName ? ` · ${t.projectName}` : ""
          }${t.submissionDate ? ` · submitted ${t.submissionDate}` : ""}`,
        );
      doc.moveDown(0.25);

      // Table header
      const tableTop = doc.y;
      const colDay = 40;
      const colHours = 90;
      const colTask = 140;
      const rowHeight = 16;

      doc.fontSize(8).fillColor("#475569");
      doc.text("Day", colDay, tableTop);
      doc.text("Hours", colHours, tableTop, { width: 40, align: "right" });
      doc.text("Task notes", colTask, tableTop);
      doc
        .moveTo(40, tableTop + 11)
        .lineTo(555, tableTop + 11)
        .strokeColor("#e2e8f0")
        .lineWidth(0.5)
        .stroke();

      let y = tableTop + 14;
      for (const k of DAY_KEYS) {
        const day = t[k] as { hours: number; task: string };
        doc.fontSize(9).fillColor("#0f172a");
        doc.text(DAY_LABEL[k], colDay, y);
        doc.text(
          day.hours ? day.hours.toFixed(2) : "—",
          colHours,
          y,
          { width: 40, align: "right" },
        );
        doc
          .fillColor("#334155")
          .text(day.task || "—", colTask, y, { width: 410 });
        y += rowHeight;
        // If a task wrapped, push y down to where pdfkit advanced.
        if (doc.y > y) y = doc.y + 2;
      }
      // Total row
      doc
        .moveTo(40, y + 1)
        .lineTo(555, y + 1)
        .strokeColor("#e2e8f0")
        .lineWidth(0.5)
        .stroke();
      doc.fontSize(9).fillColor("#0f172a");
      doc.text("Total", colDay, y + 5);
      doc.text(
        (t.totalHours ?? 0).toFixed(2),
        colHours,
        y + 5,
        { width: 40, align: "right" },
      );
      doc.y = y + rowHeight + 6;
      doc.moveDown(0.5);
    }

    // ----- Footer -------------------------------------------------------
    ensureSpace(doc, 30);
    doc
      .moveTo(40, doc.y)
      .lineTo(555, doc.y)
      .strokeColor("#cbd5e1")
      .lineWidth(0.5)
      .stroke();
    doc
      .moveDown(0.4)
      .fontSize(8)
      .fillColor("#94a3b8")
      .text(
        "Generated by the HTP42 portal. This document is intended for the recipient of the invoice it ships with.",
      );

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

function formatTodayLong(): string {
  return new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
