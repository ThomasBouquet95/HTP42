import Airtable, { type FieldSet, type Record as AirtableRecord } from "airtable";
import { env } from "./env";

const base = new Airtable({ apiKey: env.airtablePat }).base(env.airtableBaseId);

export const TABLES = {
  networkMembers: "Network Members",
  projectStaffing: "Project Staffing",
  timesheets: "Timesheets",
  projects: "Projects",
} as const;

export const FIELDS = {
  networkMembers: {
    memberCode: "Member Code",
    fullName: "Full Name",
    email: "Email",
    status: "Status",
  },
  projects: {
    projectCode: "Project Code",
    projectName: "Project Name",
  },
  projectStaffing: {
    staffingCode: "Staffing Code",
    projectCode: "Project Code",
    memberCode: "Member Code",
    startDate: "Start Date",
    endDate: "End Date",
    status: "Status",
  },
  timesheets: {
    timesheetCode: "Timesheet Code",
    memberCode: "Member Code",
    projectStaffing: "Project Staffing",
    submissionDate: "Submission Date",
    startDate: "Start Date",
    endDate: "End Date",
    mondayHours: "Monday (hours)",
    mondayTask: "Monday (task)",
    tuesdayHours: "Tuesday (hours)",
    tuesdayTask: "Tuesday (task)",
    wednesdayHours: "Wednesday (hours)",
    wednesdayTask: "Wednesday (task)",
    thursdayHours: "Thursday (hours)",
    thursdayTask: "Thursday (task)",
    fridayHours: "Friday (hours)",
    fridayTask: "Friday (task)",
    status: "Status",
  },
} as const;

export type MemberStatus = "Active" | "Partially Active" | "Inactive";
export type StaffingStatus = "In Progress" | "Not Started" | "Completed" | "Opportunity";
export type TimesheetStatus = "Draft" | "Submitted" | "Deleted";

export type MemberRecord = {
  id: string;
  memberCode: string;
  fullName: string;
  email: string;
  status: MemberStatus;
};

export type StaffingRecord = {
  id: string;
  staffingCode: string;
  projectCode: string;
  projectName: string;
  startDate: string | null;
  endDate: string | null;
  status: StaffingStatus | null;
};

export type TimesheetRecord = {
  id: string;
  timesheetCode: string;
  memberRecordId: string;
  staffingRecordId: string;
  staffingCode: string;
  projectCode: string;
  projectName: string;
  startDate: string | null;
  endDate: string | null;
  submissionDate: string | null;
  status: TimesheetStatus;
  monday: { hours: number; task: string };
  tuesday: { hours: number; task: string };
  wednesday: { hours: number; task: string };
  thursday: { hours: number; task: string };
  friday: { hours: number; task: string };
  totalHours: number;
};

function str(r: AirtableRecord<FieldSet>, field: string): string {
  const v = r.get(field);
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function firstLinkedId(r: AirtableRecord<FieldSet>, field: string): string {
  const v = r.get(field);
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0];
  return "";
}

function num(r: AirtableRecord<FieldSet>, field: string): number {
  const v = r.get(field);
  return typeof v === "number" ? v : 0;
}

function escape(formulaValue: string): string {
  return formulaValue.replace(/"/g, '\\"');
}

export async function findActiveMemberByEmail(email: string): Promise<MemberRecord | null> {
  const normalized = email.trim().toLowerCase();
  const records = await base(TABLES.networkMembers)
    .select({
      filterByFormula: `LOWER({${FIELDS.networkMembers.email}}) = "${escape(normalized)}"`,
      maxRecords: 1,
    })
    .firstPage();
  if (records.length === 0) return null;
  const r = records[0];
  const status = str(r, FIELDS.networkMembers.status) as MemberStatus;
  if (status !== "Active" && status !== "Partially Active") return null;
  return {
    id: r.id,
    memberCode: str(r, FIELDS.networkMembers.memberCode),
    fullName: str(r, FIELDS.networkMembers.fullName),
    email: str(r, FIELDS.networkMembers.email),
    status,
  };
}

export async function getMemberById(recordId: string): Promise<MemberRecord | null> {
  try {
    const r = await base(TABLES.networkMembers).find(recordId);
    const status = str(r, FIELDS.networkMembers.status) as MemberStatus;
    return {
      id: r.id,
      memberCode: str(r, FIELDS.networkMembers.memberCode),
      fullName: str(r, FIELDS.networkMembers.fullName),
      email: str(r, FIELDS.networkMembers.email),
      status,
    };
  } catch {
    return null;
  }
}

async function getProjectNameMap(): Promise<Map<string, string>> {
  const records = await base(TABLES.projects)
    .select({
      fields: [FIELDS.projects.projectCode, FIELDS.projects.projectName],
    })
    .all();
  const map = new Map<string, string>();
  for (const r of records) {
    const code = str(r, FIELDS.projects.projectCode);
    const name = str(r, FIELDS.projects.projectName);
    if (code) map.set(code, name);
  }
  return map;
}

export async function getStaffingsForMember(
  memberRecordId: string,
  activeOnly = false,
): Promise<StaffingRecord[]> {
  const records = await base(TABLES.projectStaffing)
    .select({
      filterByFormula: `FIND("${escape(memberRecordId)}", ARRAYJOIN(ARRAYCOMPACT({${FIELDS.projectStaffing.memberCode}})))`,
    })
    .all();
  const projectNames = await getProjectNameMap();
  const all: StaffingRecord[] = records.map((r) => {
    const projectCode = str(r, FIELDS.projectStaffing.projectCode);
    return {
      id: r.id,
      staffingCode: str(r, FIELDS.projectStaffing.staffingCode),
      projectCode,
      projectName: projectNames.get(projectCode) ?? "",
      startDate: (r.get(FIELDS.projectStaffing.startDate) as string | undefined) ?? null,
      endDate: (r.get(FIELDS.projectStaffing.endDate) as string | undefined) ?? null,
      status: (str(r, FIELDS.projectStaffing.status) as StaffingStatus) || null,
    };
  });
  if (!activeOnly) return all;
  return all.filter((s) => s.status === "In Progress" || s.status === "Not Started");
}

// The linked Member Code field on staffing uses Network Members record IDs, but
// filterByFormula sees their primary-field values (the member codes). We filter
// by the visible memberCode string with FIND to remain robust if multiple links exist.
async function staffingsByMemberCodeString(memberCode: string): Promise<Map<string, StaffingRecord>> {
  const records = await base(TABLES.projectStaffing)
    .select({
      filterByFormula: `FIND("${escape(memberCode)}", ARRAYJOIN({${FIELDS.projectStaffing.memberCode}}))`,
    })
    .all();
  const projectNames = await getProjectNameMap();
  const map = new Map<string, StaffingRecord>();
  for (const r of records) {
    const projectCode = str(r, FIELDS.projectStaffing.projectCode);
    map.set(r.id, {
      id: r.id,
      staffingCode: str(r, FIELDS.projectStaffing.staffingCode),
      projectCode,
      projectName: projectNames.get(projectCode) ?? "",
      startDate: (r.get(FIELDS.projectStaffing.startDate) as string | undefined) ?? null,
      endDate: (r.get(FIELDS.projectStaffing.endDate) as string | undefined) ?? null,
      status: (str(r, FIELDS.projectStaffing.status) as StaffingStatus) || null,
    });
  }
  return map;
}

function toTimesheet(r: AirtableRecord<FieldSet>, staffings: Map<string, StaffingRecord>): TimesheetRecord {
  const staffingRecordId = firstLinkedId(r, FIELDS.timesheets.projectStaffing);
  const staffing = staffings.get(staffingRecordId);
  const monday = { hours: num(r, FIELDS.timesheets.mondayHours), task: str(r, FIELDS.timesheets.mondayTask) };
  const tuesday = { hours: num(r, FIELDS.timesheets.tuesdayHours), task: str(r, FIELDS.timesheets.tuesdayTask) };
  const wednesday = { hours: num(r, FIELDS.timesheets.wednesdayHours), task: str(r, FIELDS.timesheets.wednesdayTask) };
  const thursday = { hours: num(r, FIELDS.timesheets.thursdayHours), task: str(r, FIELDS.timesheets.thursdayTask) };
  const friday = { hours: num(r, FIELDS.timesheets.fridayHours), task: str(r, FIELDS.timesheets.fridayTask) };
  return {
    id: r.id,
    timesheetCode: str(r, FIELDS.timesheets.timesheetCode),
    memberRecordId: firstLinkedId(r, FIELDS.timesheets.memberCode),
    staffingRecordId,
    staffingCode: staffing?.staffingCode ?? "",
    projectCode: staffing?.projectCode ?? "",
    projectName: staffing?.projectName ?? "",
    startDate: (r.get(FIELDS.timesheets.startDate) as string | undefined) ?? null,
    endDate: (r.get(FIELDS.timesheets.endDate) as string | undefined) ?? null,
    submissionDate: (r.get(FIELDS.timesheets.submissionDate) as string | undefined) ?? null,
    status: (str(r, FIELDS.timesheets.status) as TimesheetStatus) || "Draft",
    monday,
    tuesday,
    wednesday,
    thursday,
    friday,
    totalHours: monday.hours + tuesday.hours + wednesday.hours + thursday.hours + friday.hours,
  };
}

export async function getTimesheetsForMember(memberCode: string): Promise<TimesheetRecord[]> {
  const [records, staffings] = await Promise.all([
    base(TABLES.timesheets)
      .select({
        filterByFormula: `FIND("${escape(memberCode)}", ARRAYJOIN({${FIELDS.timesheets.memberCode}}))`,
        sort: [{ field: FIELDS.timesheets.startDate, direction: "desc" }],
      })
      .all(),
    staffingsByMemberCodeString(memberCode),
  ]);
  return records.map((r) => toTimesheet(r, staffings));
}

export async function getTimesheetById(
  recordId: string,
  memberCode: string,
): Promise<TimesheetRecord | null> {
  try {
    const r = await base(TABLES.timesheets).find(recordId);
    const staffings = await staffingsByMemberCodeString(memberCode);
    const ts = toTimesheet(r, staffings);
    // Ownership check via the linked member's primary string value.
    const memberField = r.get(FIELDS.timesheets.memberCode);
    const linkedIds = Array.isArray(memberField) ? (memberField as string[]) : [];
    // Linked IDs are record IDs; we don't have the member record here.
    // Instead, verify by re-checking via memberCode filter:
    if (!ts.memberRecordId || linkedIds.length === 0) return null;
    // Cross-check: fetch the member and compare memberCode.
    const member = await getMemberById(ts.memberRecordId);
    if (!member || member.memberCode !== memberCode) return null;
    return ts;
  } catch {
    return null;
  }
}

export async function existsTimesheetForWeek(
  memberRecordId: string,
  staffingRecordId: string,
  startDateIso: string,
  excludeRecordId?: string,
): Promise<boolean> {
  const records = await base(TABLES.timesheets)
    .select({
      filterByFormula: `AND(FIND("${escape(memberRecordId)}", ARRAYJOIN(ARRAYCOMPACT({${FIELDS.timesheets.memberCode}}))), {${FIELDS.timesheets.startDate}} = "${escape(startDateIso)}")`,
    })
    .all();
  return records.some((r) => {
    if (excludeRecordId && r.id === excludeRecordId) return false;
    const staffingField = r.get(FIELDS.timesheets.projectStaffing);
    const ids = Array.isArray(staffingField) ? (staffingField as string[]) : [];
    return ids.includes(staffingRecordId);
  });
}

export type TimesheetInput = {
  memberRecordId: string;
  staffingRecordId: string;
  startDate: string;
  endDate: string;
  monday: { hours: number; task: string };
  tuesday: { hours: number; task: string };
  wednesday: { hours: number; task: string };
  thursday: { hours: number; task: string };
  friday: { hours: number; task: string };
  status: TimesheetStatus;
  submissionDate: string | null;
};

function toAirtableFields(input: TimesheetInput): FieldSet {
  return {
    [FIELDS.timesheets.memberCode]: [input.memberRecordId],
    [FIELDS.timesheets.projectStaffing]: [input.staffingRecordId],
    [FIELDS.timesheets.startDate]: input.startDate,
    [FIELDS.timesheets.endDate]: input.endDate,
    [FIELDS.timesheets.mondayHours]: input.monday.hours,
    [FIELDS.timesheets.mondayTask]: input.monday.task,
    [FIELDS.timesheets.tuesdayHours]: input.tuesday.hours,
    [FIELDS.timesheets.tuesdayTask]: input.tuesday.task,
    [FIELDS.timesheets.wednesdayHours]: input.wednesday.hours,
    [FIELDS.timesheets.wednesdayTask]: input.wednesday.task,
    [FIELDS.timesheets.thursdayHours]: input.thursday.hours,
    [FIELDS.timesheets.thursdayTask]: input.thursday.task,
    [FIELDS.timesheets.fridayHours]: input.friday.hours,
    [FIELDS.timesheets.fridayTask]: input.friday.task,
    [FIELDS.timesheets.status]: input.status,
    [FIELDS.timesheets.submissionDate]: input.submissionDate ?? null,
  } as FieldSet;
}

export async function createTimesheet(input: TimesheetInput): Promise<string> {
  const [created] = await base(TABLES.timesheets).create([{ fields: toAirtableFields(input) }]);
  return created.id;
}

export async function updateTimesheet(recordId: string, input: TimesheetInput): Promise<void> {
  await base(TABLES.timesheets).update([{ id: recordId, fields: toAirtableFields(input) }]);
}

export async function updateTimesheetStatus(
  recordId: string,
  status: TimesheetStatus,
  submissionDate?: string | null,
): Promise<void> {
  const fields: Record<string, unknown> = { [FIELDS.timesheets.status]: status };
  if (submissionDate !== undefined) fields[FIELDS.timesheets.submissionDate] = submissionDate;
  await base(TABLES.timesheets).update([{ id: recordId, fields: fields as FieldSet }]);
}
