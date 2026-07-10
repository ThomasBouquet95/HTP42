import { parseIsoDate, toIsoDate } from "@/lib/dates";
import type { AdminTimesheetRecord } from "@/lib/airtable";

// Shared export helpers so the Overview table and the By project / By member
// breakdowns all produce byte-identical CSV / PDF output.

export const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;

// Only the billing lifecycle is ever exported (shared outside finance) —
// Draft / Cancelled / Deleted never leave the app.
export const EXPORTABLE_STATUSES = ["Submitted", "Invoiced", "Paid"] as const;
export function isExportable(t: AdminTimesheetRecord): boolean {
  return t.status === "Submitted" || t.status === "Invoiced" || t.status === "Paid";
}

export function dayIsos(startIso: string | null): Record<(typeof DAY_KEYS)[number], string> {
  const empty = { monday: "", tuesday: "", wednesday: "", thursday: "", friday: "" };
  if (!startIso) return empty;
  const base = parseIsoDate(startIso);
  const out = { ...empty };
  for (let i = 0; i < DAY_KEYS.length; i += 1) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + i));
    out[DAY_KEYS[i]] = toIsoDate(d);
  }
  return out;
}

export function toCsvRows(rows: AdminTimesheetRecord[]): string[][] {
  // Status omitted on purpose — exports are shared outside finance and
  // shouldn't leak the Submitted / Invoiced / Paid billing lifecycle.
  const header = [
    "Timesheet Code",
    "Member Code",
    "Member Name",
    "Project Code",
    "Project Name",
    "Staffing Code",
    "Week Start",
    "Week End",
    "Submission Date",
    "Monday Date", "Monday Hours", "Monday Task",
    "Tuesday Date", "Tuesday Hours", "Tuesday Task",
    "Wednesday Date", "Wednesday Hours", "Wednesday Task",
    "Thursday Date", "Thursday Hours", "Thursday Task",
    "Friday Date", "Friday Hours", "Friday Task",
    "Total Hours",
  ];
  const out: string[][] = [header];
  for (const t of rows) {
    const d = dayIsos(t.startDate);
    out.push([
      t.timesheetCode,
      t.memberCode,
      t.memberName,
      t.projectCode,
      t.projectName,
      t.staffingCode,
      t.startDate ?? "",
      t.endDate ?? "",
      t.submissionDate ?? "",
      d.monday, t.monday.hours.toString(), t.monday.task,
      d.tuesday, t.tuesday.hours.toString(), t.tuesday.task,
      d.wednesday, t.wednesday.hours.toString(), t.wednesday.task,
      d.thursday, t.thursday.hours.toString(), t.thursday.task,
      d.friday, t.friday.hours.toString(), t.friday.task,
      t.totalHours.toFixed(2),
    ]);
  }
  return out;
}

export function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

// Build + trigger a CSV download from already-filtered timesheets. Restricts to
// the billing lifecycle so every entry point exports the same set.
export function downloadTimesheetsCsv(rows: AdminTimesheetRecord[], suffix = ""): void {
  const csvRows = toCsvRows(rows.filter(isExportable));
  const csv = csvRows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `htp42-admin-timesheets${suffix ? `-${suffix}` : ""}-${todayStamp()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
