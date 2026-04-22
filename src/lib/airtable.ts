import Airtable, { type FieldSet, type Record as AirtableRecord } from "airtable";
import { env } from "./env";

type AirtableBase = ReturnType<Airtable["base"]>;

let _base: AirtableBase | null = null;
function base(tableName: string) {
  if (!_base) {
    _base = new Airtable({ apiKey: env.airtablePat }).base(env.airtableBaseId);
  }
  return _base(tableName);
}

export const TABLES = {
  networkMembers: "Network Members",
  projectStaffing: "Project Staffing",
  timesheets: "Timesheets",
  projects: "Projects",
  clients: "Clients",
  payments: "Payments",
} as const;

export const FIELDS = {
  networkMembers: {
    memberCode: "Member Code",
    fullName: "Full Name",
    email: "Email",
    status: "Status",
    role: "Role",
    introduction: "Introduction",
    country: "Country",
    phone: "Phone",
    legalEntity: "Legal Entity",
    title: "Title",
    memberStatus: "Member Status",
    dailyRate: "Daily Rate",
    currency: "Currency",
  },
  projects: {
    projectCode: "Project Code",
    projectName: "Project Name",
    clientCode: "Client Code",
    type: "Type",
    objective: "Objective",
    startDate: "Start Date",
    endDate: "End Date",
    currency: "Currency",
    totalAmount: "Total Amount",
    fxToEur: "FX to EUR",
    totalAmountEur: "Total Amount EUR",
    status: "Status",
    sowSigned: "SOW Signed",
    sowValidityDate: "SOW Validity Date",
  },
  clients: {
    clientCode: "Client Code",
    clientName: "Client Name",
    industry: "Industry",
    country: "Country",
    keyContact: "Key Contact",
    notes: "Notes",
  },
  projectStaffing: {
    staffingCode: "Staffing Code",
    projectCode: "Project Code",
    memberCode: "Member Code",
    roleInProject: "Role in Project",
    ratePerDay: "Rate per Day",
    currency: "Currency",
    daysAllocated: "Days Allocated",
    fxToEur: "FX to EUR",
    sowReference: "SOW Reference",
    sowStatus: "SOW Status",
    startDate: "Start Date",
    endDate: "End Date",
    status: "Status",
    notes: "Notes",
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
  payments: {
    paymentCode: "Payment Code",
    direction: "Direction",
    type: "Type",
    project: "Project",
    member: "Member",
    client: "Client",
    invoiceDate: "Invoice Date",
    invoiceReference: "Invoice Reference",
    invoiceCurrency: "Invoice Currency",
    invoiceValue: "Invoice Value",
    fxRateToEur: "FX Rate to EUR",
    invoiceValueEur: "Invoice Value EUR",
    paymentTerms: "Payment Terms",
    paymentStatus: "Payment Status",
    paymentDate: "Payment Date",
    beneficiary: "Beneficiary",
    comment: "Comment",
  },
} as const;

export type MemberStatus = "Active" | "Partially Active" | "Inactive";
export const MEMBER_STATUSES: MemberStatus[] = ["Active", "Partially Active", "Inactive"];

export type MemberRole =
  | "Core Team"
  | "Extended Core Team"
  | "Network Member"
  | "Support Member"
  | "Admin";
export const MEMBER_ROLES: MemberRole[] = [
  "Core Team",
  "Extended Core Team",
  "Network Member",
  "Support Member",
  "Admin",
];

export type StaffingStatus = "In Progress" | "Not Started" | "Completed" | "Opportunity";
export const STAFFING_STATUSES: StaffingStatus[] = [
  "Opportunity",
  "Not Started",
  "In Progress",
  "Completed",
];
export type SowStatus = "Signed" | "In Progress" | "Draft" | "Not Started";
export const SOW_STATUSES: SowStatus[] = ["Not Started", "Draft", "In Progress", "Signed"];

export type TimesheetStatus = "Draft" | "Submitted" | "Deleted";

export type ProjectStatus =
  | "Completed"
  | "In Progress"
  | "Not Started"
  | "On Hold"
  | "Planned";
export const PROJECT_STATUSES: ProjectStatus[] = [
  "Planned",
  "Not Started",
  "In Progress",
  "On Hold",
  "Completed",
];
export type ProjectType = "Fixed Price" | "Time & Material";
export const PROJECT_TYPES: ProjectType[] = ["Fixed Price", "Time & Material"];
export type Currency = "EUR" | "USD" | "CHF";
export const CURRENCIES: Currency[] = ["EUR", "USD", "CHF"];
export type SowSigned = "Yes" | "In Progress" | "No";
export const SOW_SIGNED_OPTIONS: SowSigned[] = ["Yes", "In Progress", "No"];

export type PaymentDirection = "Inflow" | "Outflow";
export type PaymentStatus =
  | "Paid"
  | "To be paid"
  | "Payment executed"
  | "Overdue"
  | "Unpaid"
  | "Pending";

export type MemberRecord = {
  id: string;
  memberCode: string;
  fullName: string;
  email: string;
  status: MemberStatus;
  role: MemberRole | "";
  introduction: string;
  country: string;
  phone: string;
  legalEntity: string;
  title: string;
};

export type MemberAdminRecord = MemberRecord & {
  dailyRate: number | null;
  currency: Currency | "";
};

export type ClientRecord = {
  id: string;
  clientCode: string;
  clientName: string;
  industry: string;
  country: string;
  keyContact: string;
  notes: string;
};

export type ProjectRecord = {
  id: string;
  projectCode: string;
  projectName: string;
  clientRecordIds: string[];
  clientCodes: string[];
  type: ProjectType | "";
  objective: string;
  startDate: string | null;
  endDate: string | null;
  currency: Currency | "";
  totalAmount: number | null;
  fxToEur: number | null;
  totalAmountEur: number | null;
  status: ProjectStatus | "";
  sowSigned: SowSigned | "";
  sowValidityDate: string | null;
};

export type PaymentRecord = {
  id: string;
  paymentCode: string;
  direction: PaymentDirection | "";
  type: string;
  projectRecordIds: string[];
  clientRecordIds: string[];
  memberRecordIds: string[];
  projectCodes: string[];
  clientCodes: string[];
  memberCodes: string[];
  invoiceDate: string | null;
  invoiceReference: string;
  invoiceCurrency: Currency | "";
  invoiceValue: number | null;
  fxRateToEur: number | null;
  invoiceValueEur: number | null;
  paymentTerms: string;
  paymentStatus: PaymentStatus | "";
  paymentDate: string | null;
  beneficiary: string;
  comment: string;
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

export type StaffingAdminRecord = {
  id: string;
  staffingCode: string;
  projectCode: string;
  projectName: string;
  memberRecordIds: string[];
  memberCodes: string[];
  roleInProject: string;
  ratePerDay: number | null;
  currency: Currency | "";
  daysAllocated: number | null;
  fxToEur: number | null;
  totalAmount: number | null;
  totalAmountEur: number | null;
  sowReference: string;
  sowStatus: SowStatus | "";
  startDate: string | null;
  endDate: string | null;
  status: StaffingStatus | "";
  notes: string;
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

function linkedIds(r: AirtableRecord<FieldSet>, field: string): string[] {
  const v = r.get(field);
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function linkedDisplay(r: AirtableRecord<FieldSet>, field: string): string[] {
  // Some fields return arrays of objects with {id,name} or plain strings depending
  // on how Airtable resolves the linked primary values. We normalise to strings.
  const v = r.get(field);
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      if (typeof x === "string") return x;
      if (x && typeof x === "object" && "name" in x && typeof (x as { name: unknown }).name === "string") {
        return (x as { name: string }).name;
      }
      return "";
    })
    .filter(Boolean);
}

function num(r: AirtableRecord<FieldSet>, field: string): number {
  const v = r.get(field);
  return typeof v === "number" ? v : 0;
}

function numOrNull(r: AirtableRecord<FieldSet>, field: string): number | null {
  const v = r.get(field);
  return typeof v === "number" ? v : null;
}

function dateOrNull(r: AirtableRecord<FieldSet>, field: string): string | null {
  const v = r.get(field);
  return typeof v === "string" ? v : null;
}

function escape(formulaValue: string): string {
  return formulaValue.replace(/"/g, '\\"');
}

function memberFromRecord(r: AirtableRecord<FieldSet>): MemberRecord {
  return {
    id: r.id,
    memberCode: str(r, FIELDS.networkMembers.memberCode),
    fullName: str(r, FIELDS.networkMembers.fullName),
    email: str(r, FIELDS.networkMembers.email),
    status: str(r, FIELDS.networkMembers.status) as MemberStatus,
    role: str(r, FIELDS.networkMembers.role) as MemberRole | "",
    introduction: str(r, FIELDS.networkMembers.introduction),
    country: str(r, FIELDS.networkMembers.country),
    phone: str(r, FIELDS.networkMembers.phone),
    legalEntity: str(r, FIELDS.networkMembers.legalEntity),
    title: str(r, FIELDS.networkMembers.title),
  };
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
  return memberFromRecord(r);
}

export async function getMemberById(recordId: string): Promise<MemberRecord | null> {
  try {
    const r = await base(TABLES.networkMembers).find(recordId);
    return memberFromRecord(r);
  } catch {
    return null;
  }
}

export type MemberProfileUpdate = {
  fullName?: string;
  introduction?: string;
  country?: string;
  phone?: string;
  legalEntity?: string;
};

export async function updateMemberProfile(
  recordId: string,
  input: MemberProfileUpdate,
): Promise<MemberRecord | null> {
  const fields: Record<string, unknown> = {};
  if (input.fullName !== undefined) fields[FIELDS.networkMembers.fullName] = input.fullName;
  if (input.introduction !== undefined) fields[FIELDS.networkMembers.introduction] = input.introduction;
  if (input.country !== undefined) fields[FIELDS.networkMembers.country] = input.country;
  if (input.phone !== undefined) fields[FIELDS.networkMembers.phone] = input.phone;
  if (input.legalEntity !== undefined) fields[FIELDS.networkMembers.legalEntity] = input.legalEntity;
  if (Object.keys(fields).length === 0) return getMemberById(recordId);
  const [updated] = await base(TABLES.networkMembers).update([
    { id: recordId, fields: fields as FieldSet },
  ]);
  return memberFromRecord(updated);
}

// ---------------------------------------------------------------------------
// Admin: Network Members
// ---------------------------------------------------------------------------

function memberAdminFromRecord(r: AirtableRecord<FieldSet>): MemberAdminRecord {
  return {
    ...memberFromRecord(r),
    dailyRate: numOrNull(r, FIELDS.networkMembers.dailyRate),
    currency: str(r, FIELDS.networkMembers.currency) as Currency | "",
  };
}

export async function listAllMembers(): Promise<MemberAdminRecord[]> {
  const records = await base(TABLES.networkMembers)
    .select({
      sort: [{ field: FIELDS.networkMembers.memberCode, direction: "asc" }],
    })
    .all();
  return records.map(memberAdminFromRecord);
}

export type MemberAdminUpdate = MemberProfileUpdate & {
  memberCode?: string;
  email?: string;
  role?: MemberRole;
  status?: MemberStatus;
  title?: string;
  dailyRate?: number | null;
  currency?: Currency | "";
};

export type MemberCreateInput = MemberAdminUpdate & {
  memberCode: string;
  fullName: string;
  email: string;
  status: MemberStatus;
};

export async function adminCreateMember(input: MemberCreateInput): Promise<MemberAdminRecord> {
  const fields: Record<string, unknown> = {
    [FIELDS.networkMembers.memberCode]: input.memberCode,
    [FIELDS.networkMembers.fullName]: input.fullName,
    [FIELDS.networkMembers.email]: input.email,
    [FIELDS.networkMembers.status]: input.status,
  };
  if (input.introduction !== undefined) fields[FIELDS.networkMembers.introduction] = input.introduction;
  if (input.country !== undefined) fields[FIELDS.networkMembers.country] = input.country;
  if (input.phone !== undefined) fields[FIELDS.networkMembers.phone] = input.phone;
  if (input.legalEntity !== undefined) fields[FIELDS.networkMembers.legalEntity] = input.legalEntity;
  if (input.title !== undefined) fields[FIELDS.networkMembers.title] = input.title;
  if (input.role !== undefined) fields[FIELDS.networkMembers.role] = input.role;
  if (input.dailyRate !== undefined) fields[FIELDS.networkMembers.dailyRate] = input.dailyRate;
  if (input.currency !== undefined && input.currency !== "") {
    fields[FIELDS.networkMembers.currency] = input.currency;
  }
  const [created] = await base(TABLES.networkMembers).create([
    { fields: fields as FieldSet },
  ]);
  return memberAdminFromRecord(created);
}

export async function adminDeleteMember(recordId: string): Promise<void> {
  await base(TABLES.networkMembers).destroy([recordId]);
}

export async function findMemberByEmail(
  email: string,
  excludeRecordId?: string,
): Promise<MemberAdminRecord | null> {
  const normalized = email.trim().toLowerCase();
  const records = await base(TABLES.networkMembers)
    .select({
      filterByFormula: `LOWER({${FIELDS.networkMembers.email}}) = "${escape(normalized)}"`,
      maxRecords: 5,
    })
    .firstPage();
  const match = records.find((r) => r.id !== excludeRecordId);
  return match ? memberAdminFromRecord(match) : null;
}

export async function findMemberByCode(
  memberCode: string,
  excludeRecordId?: string,
): Promise<MemberAdminRecord | null> {
  const records = await base(TABLES.networkMembers)
    .select({
      filterByFormula: `{${FIELDS.networkMembers.memberCode}} = "${escape(memberCode)}"`,
      maxRecords: 5,
    })
    .firstPage();
  const match = records.find((r) => r.id !== excludeRecordId);
  return match ? memberAdminFromRecord(match) : null;
}

export async function adminUpdateMember(
  recordId: string,
  input: MemberAdminUpdate,
): Promise<MemberAdminRecord | null> {
  const fields: Record<string, unknown> = {};
  if (input.memberCode !== undefined) fields[FIELDS.networkMembers.memberCode] = input.memberCode;
  if (input.fullName !== undefined) fields[FIELDS.networkMembers.fullName] = input.fullName;
  if (input.email !== undefined) fields[FIELDS.networkMembers.email] = input.email;
  if (input.introduction !== undefined) fields[FIELDS.networkMembers.introduction] = input.introduction;
  if (input.country !== undefined) fields[FIELDS.networkMembers.country] = input.country;
  if (input.phone !== undefined) fields[FIELDS.networkMembers.phone] = input.phone;
  if (input.legalEntity !== undefined) fields[FIELDS.networkMembers.legalEntity] = input.legalEntity;
  if (input.title !== undefined) fields[FIELDS.networkMembers.title] = input.title;
  if (input.role !== undefined) fields[FIELDS.networkMembers.role] = input.role;
  if (input.status !== undefined) fields[FIELDS.networkMembers.status] = input.status;
  if (input.dailyRate !== undefined) fields[FIELDS.networkMembers.dailyRate] = input.dailyRate;
  if (input.currency !== undefined) {
    fields[FIELDS.networkMembers.currency] = input.currency === "" ? null : input.currency;
  }
  if (Object.keys(fields).length === 0) {
    const r = await base(TABLES.networkMembers).find(recordId);
    return memberAdminFromRecord(r);
  }
  const [updated] = await base(TABLES.networkMembers).update([
    { id: recordId, fields: fields as FieldSet },
  ]);
  return memberAdminFromRecord(updated);
}

// ---------------------------------------------------------------------------
// Admin: Clients
// ---------------------------------------------------------------------------

function clientFromRecord(r: AirtableRecord<FieldSet>): ClientRecord {
  return {
    id: r.id,
    clientCode: str(r, FIELDS.clients.clientCode),
    clientName: str(r, FIELDS.clients.clientName),
    industry: str(r, FIELDS.clients.industry),
    country: str(r, FIELDS.clients.country),
    keyContact: str(r, FIELDS.clients.keyContact),
    notes: str(r, FIELDS.clients.notes),
  };
}

export async function listClients(): Promise<ClientRecord[]> {
  const records = await base(TABLES.clients)
    .select({ sort: [{ field: FIELDS.clients.clientCode, direction: "asc" }] })
    .all();
  return records.map(clientFromRecord);
}

export async function getClientById(recordId: string): Promise<ClientRecord | null> {
  try {
    const r = await base(TABLES.clients).find(recordId);
    return clientFromRecord(r);
  } catch {
    return null;
  }
}

export type ClientInput = {
  clientCode: string;
  clientName: string;
  industry: string;
  country: string;
  keyContact: string;
  notes: string;
};

function clientFields(input: ClientInput): Record<string, unknown> {
  return {
    [FIELDS.clients.clientCode]: input.clientCode,
    [FIELDS.clients.clientName]: input.clientName,
    [FIELDS.clients.industry]: input.industry,
    [FIELDS.clients.country]: input.country,
    [FIELDS.clients.keyContact]: input.keyContact,
    [FIELDS.clients.notes]: input.notes,
  };
}

export async function createClient(input: ClientInput): Promise<string> {
  const [created] = await base(TABLES.clients).create([
    { fields: clientFields(input) as FieldSet },
  ]);
  return created.id;
}

export async function updateClient(recordId: string, input: ClientInput): Promise<void> {
  await base(TABLES.clients).update([
    { id: recordId, fields: clientFields(input) as FieldSet },
  ]);
}

export async function deleteClient(recordId: string): Promise<void> {
  await base(TABLES.clients).destroy([recordId]);
}

export async function findClientByCode(
  code: string,
  excludeRecordId?: string,
): Promise<ClientRecord | null> {
  const records = await base(TABLES.clients)
    .select({
      filterByFormula: `{${FIELDS.clients.clientCode}} = "${escape(code)}"`,
      maxRecords: 5,
    })
    .firstPage();
  const match = records.find((r) => r.id !== excludeRecordId);
  return match ? clientFromRecord(match) : null;
}

// ---------------------------------------------------------------------------
// Admin: Projects
// ---------------------------------------------------------------------------

function projectFromRecord(r: AirtableRecord<FieldSet>): ProjectRecord {
  return {
    id: r.id,
    projectCode: str(r, FIELDS.projects.projectCode),
    projectName: str(r, FIELDS.projects.projectName),
    clientRecordIds: linkedIds(r, FIELDS.projects.clientCode),
    clientCodes: linkedDisplay(r, FIELDS.projects.clientCode),
    type: str(r, FIELDS.projects.type) as ProjectType | "",
    objective: str(r, FIELDS.projects.objective),
    startDate: dateOrNull(r, FIELDS.projects.startDate),
    endDate: dateOrNull(r, FIELDS.projects.endDate),
    currency: str(r, FIELDS.projects.currency) as Currency | "",
    totalAmount: numOrNull(r, FIELDS.projects.totalAmount),
    fxToEur: numOrNull(r, FIELDS.projects.fxToEur),
    totalAmountEur: numOrNull(r, FIELDS.projects.totalAmountEur),
    status: str(r, FIELDS.projects.status) as ProjectStatus | "",
    sowSigned: str(r, FIELDS.projects.sowSigned) as SowSigned | "",
    sowValidityDate: dateOrNull(r, FIELDS.projects.sowValidityDate),
  };
}

export async function listProjects(): Promise<ProjectRecord[]> {
  const records = await base(TABLES.projects)
    .select({ sort: [{ field: FIELDS.projects.projectCode, direction: "asc" }] })
    .all();
  return records.map(projectFromRecord);
}

export async function getProjectById(recordId: string): Promise<ProjectRecord | null> {
  try {
    const r = await base(TABLES.projects).find(recordId);
    return projectFromRecord(r);
  } catch {
    return null;
  }
}

export type ProjectInput = {
  projectCode: string;
  projectName: string;
  clientRecordIds: string[];
  type: ProjectType | "";
  objective: string;
  startDate: string | null;
  endDate: string | null;
  currency: Currency | "";
  totalAmount: number | null;
  fxToEur: number | null;
  status: ProjectStatus | "";
  sowSigned: SowSigned | "";
  sowValidityDate: string | null;
};

function projectFields(input: ProjectInput): Record<string, unknown> {
  return {
    [FIELDS.projects.projectCode]: input.projectCode,
    [FIELDS.projects.projectName]: input.projectName,
    [FIELDS.projects.clientCode]: input.clientRecordIds,
    [FIELDS.projects.type]: input.type === "" ? null : input.type,
    [FIELDS.projects.objective]: input.objective,
    [FIELDS.projects.startDate]: input.startDate,
    [FIELDS.projects.endDate]: input.endDate,
    [FIELDS.projects.currency]: input.currency === "" ? null : input.currency,
    [FIELDS.projects.totalAmount]: input.totalAmount,
    [FIELDS.projects.fxToEur]: input.fxToEur,
    [FIELDS.projects.status]: input.status === "" ? null : input.status,
    [FIELDS.projects.sowSigned]: input.sowSigned === "" ? null : input.sowSigned,
    [FIELDS.projects.sowValidityDate]: input.sowValidityDate,
  };
}

export async function createProject(input: ProjectInput): Promise<string> {
  const [created] = await base(TABLES.projects).create([
    { fields: projectFields(input) as FieldSet },
  ]);
  return created.id;
}

export async function updateProject(recordId: string, input: ProjectInput): Promise<void> {
  await base(TABLES.projects).update([
    { id: recordId, fields: projectFields(input) as FieldSet },
  ]);
}

export async function deleteProject(recordId: string): Promise<void> {
  await base(TABLES.projects).destroy([recordId]);
}

// Compute the next project code for a given client and year, e.g. AGX-2026-01.
// Scans existing project codes that match the {CLIENT}-{YEAR}-NN prefix and
// picks the smallest unused two-digit suffix.
export async function nextProjectCode(clientCode: string, year: number): Promise<string> {
  const prefix = `${clientCode}-${year}-`;
  const records = await base(TABLES.projects)
    .select({
      fields: [FIELDS.projects.projectCode],
      filterByFormula: `LEFT({${FIELDS.projects.projectCode}}, ${prefix.length}) = "${escape(prefix)}"`,
    })
    .all();
  const used = new Set<number>();
  for (const r of records) {
    const code = str(r, FIELDS.projects.projectCode);
    const tail = code.slice(prefix.length);
    const n = parseInt(tail, 10);
    if (Number.isFinite(n) && n > 0) used.add(n);
  }
  let n = 1;
  while (used.has(n)) n += 1;
  return `${prefix}${String(n).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Admin: Timesheets (all members)
// ---------------------------------------------------------------------------

export type AdminTimesheetRecord = TimesheetRecord & {
  memberCode: string;
  memberName: string;
};

export async function listAllTimesheets(): Promise<AdminTimesheetRecord[]> {
  // Staffings across all members: we fetch them all and index by record id.
  const [tsRecords, stRecords, projectNames, memberById] = await Promise.all([
    base(TABLES.timesheets)
      .select({
        sort: [{ field: FIELDS.timesheets.startDate, direction: "desc" }],
      })
      .all(),
    base(TABLES.projectStaffing).select().all(),
    getProjectNameMap(),
    listAllMembers().then((list) => new Map(list.map((m) => [m.id, m]))),
  ]);
  const staffingIdx = new Map<string, StaffingRecord>();
  for (const r of stRecords) {
    const projectCode = str(r, FIELDS.projectStaffing.projectCode);
    staffingIdx.set(r.id, {
      id: r.id,
      staffingCode: str(r, FIELDS.projectStaffing.staffingCode),
      projectCode,
      projectName: projectNames.get(projectCode) ?? "",
      startDate: dateOrNull(r, FIELDS.projectStaffing.startDate),
      endDate: dateOrNull(r, FIELDS.projectStaffing.endDate),
      status: (str(r, FIELDS.projectStaffing.status) as StaffingStatus) || null,
    });
  }
  return tsRecords.map((r) => {
    const ts = toTimesheet(r, staffingIdx);
    const member = memberById.get(ts.memberRecordId);
    return {
      ...ts,
      memberCode: member?.memberCode ?? ts.memberRecordId,
      memberName: member?.fullName ?? "",
    };
  });
}

// ---------------------------------------------------------------------------
// Admin: Payments
// ---------------------------------------------------------------------------

function paymentFromRecord(r: AirtableRecord<FieldSet>): PaymentRecord {
  return {
    id: r.id,
    paymentCode: str(r, FIELDS.payments.paymentCode),
    direction: str(r, FIELDS.payments.direction) as PaymentDirection | "",
    type: str(r, FIELDS.payments.type),
    projectRecordIds: linkedIds(r, FIELDS.payments.project),
    clientRecordIds: linkedIds(r, FIELDS.payments.client),
    memberRecordIds: linkedIds(r, FIELDS.payments.member),
    projectCodes: linkedDisplay(r, FIELDS.payments.project),
    clientCodes: linkedDisplay(r, FIELDS.payments.client),
    memberCodes: linkedDisplay(r, FIELDS.payments.member),
    invoiceDate: dateOrNull(r, FIELDS.payments.invoiceDate),
    invoiceReference: str(r, FIELDS.payments.invoiceReference),
    invoiceCurrency: str(r, FIELDS.payments.invoiceCurrency) as Currency | "",
    invoiceValue: numOrNull(r, FIELDS.payments.invoiceValue),
    fxRateToEur: numOrNull(r, FIELDS.payments.fxRateToEur),
    invoiceValueEur: numOrNull(r, FIELDS.payments.invoiceValueEur),
    paymentTerms: str(r, FIELDS.payments.paymentTerms),
    paymentStatus: str(r, FIELDS.payments.paymentStatus) as PaymentStatus | "",
    paymentDate: dateOrNull(r, FIELDS.payments.paymentDate),
    beneficiary: str(r, FIELDS.payments.beneficiary),
    comment: str(r, FIELDS.payments.comment),
  };
}

export async function listPayments(): Promise<PaymentRecord[]> {
  const records = await base(TABLES.payments)
    .select({ sort: [{ field: FIELDS.payments.invoiceDate, direction: "desc" }] })
    .all();
  return records.map(paymentFromRecord);
}

export async function getPaymentById(recordId: string): Promise<PaymentRecord | null> {
  try {
    const r = await base(TABLES.payments).find(recordId);
    return paymentFromRecord(r);
  } catch {
    return null;
  }
}

export type PaymentInput = {
  direction: PaymentDirection | "";
  type: string;
  projectRecordIds: string[];
  clientRecordIds: string[];
  memberRecordIds: string[];
  invoiceDate: string | null;
  invoiceReference: string;
  invoiceCurrency: Currency | "";
  invoiceValue: number | null;
  fxRateToEur: number | null;
  invoiceValueEur: number | null;
  paymentTerms: string;
  paymentStatus: PaymentStatus | "";
  paymentDate: string | null;
  beneficiary: string;
  comment: string;
};

function paymentFields(input: PaymentInput): Record<string, unknown> {
  return {
    [FIELDS.payments.direction]: input.direction === "" ? null : input.direction,
    [FIELDS.payments.type]: input.type,
    [FIELDS.payments.project]: input.projectRecordIds,
    [FIELDS.payments.client]: input.clientRecordIds,
    [FIELDS.payments.member]: input.memberRecordIds,
    [FIELDS.payments.invoiceDate]: input.invoiceDate,
    [FIELDS.payments.invoiceReference]: input.invoiceReference,
    [FIELDS.payments.invoiceCurrency]: input.invoiceCurrency === "" ? null : input.invoiceCurrency,
    [FIELDS.payments.invoiceValue]: input.invoiceValue,
    [FIELDS.payments.fxRateToEur]: input.fxRateToEur,
    [FIELDS.payments.invoiceValueEur]: input.invoiceValueEur,
    [FIELDS.payments.paymentTerms]: input.paymentTerms,
    [FIELDS.payments.paymentStatus]: input.paymentStatus === "" ? null : input.paymentStatus,
    [FIELDS.payments.paymentDate]: input.paymentDate,
    [FIELDS.payments.beneficiary]: input.beneficiary,
    [FIELDS.payments.comment]: input.comment,
  };
}

export async function createPayment(input: PaymentInput): Promise<string> {
  const [created] = await base(TABLES.payments).create([
    { fields: paymentFields(input) as FieldSet },
  ]);
  return created.id;
}

export async function updatePayment(recordId: string, input: PaymentInput): Promise<void> {
  await base(TABLES.payments).update([
    { id: recordId, fields: paymentFields(input) as FieldSet },
  ]);
}

export async function deletePayment(recordId: string): Promise<void> {
  await base(TABLES.payments).destroy([recordId]);
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
  memberCode: string,
  activeOnly = false,
): Promise<StaffingRecord[]> {
  // filterByFormula on a linked-record field sees the primary field value of
  // the linked record (the member code), not the Airtable record ID — so we
  // search the visible Member Code string here.
  const records = await base(TABLES.projectStaffing)
    .select({
      filterByFormula: `FIND("${escape(memberCode)}", ARRAYJOIN(ARRAYCOMPACT({${FIELDS.projectStaffing.memberCode}})))`,
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

// ---------------------------------------------------------------------------
// Admin: Project Staffings (full CRUD)
// ---------------------------------------------------------------------------

function staffingAdminFromRecord(
  r: AirtableRecord<FieldSet>,
  projectNames: Map<string, string>,
): StaffingAdminRecord {
  const projectCode = str(r, FIELDS.projectStaffing.projectCode);
  const rate = numOrNull(r, FIELDS.projectStaffing.ratePerDay);
  const days = numOrNull(r, FIELDS.projectStaffing.daysAllocated);
  const fx = numOrNull(r, FIELDS.projectStaffing.fxToEur);
  const totalAmount = rate != null && days != null ? rate * days : null;
  const totalAmountEur = totalAmount != null && fx != null ? totalAmount * fx : null;
  return {
    id: r.id,
    staffingCode: str(r, FIELDS.projectStaffing.staffingCode),
    projectCode,
    projectName: projectNames.get(projectCode) ?? "",
    memberRecordIds: linkedIds(r, FIELDS.projectStaffing.memberCode),
    memberCodes: linkedDisplay(r, FIELDS.projectStaffing.memberCode),
    roleInProject: str(r, FIELDS.projectStaffing.roleInProject),
    ratePerDay: rate,
    currency: str(r, FIELDS.projectStaffing.currency) as Currency | "",
    daysAllocated: days,
    fxToEur: fx,
    totalAmount,
    totalAmountEur,
    sowReference: str(r, FIELDS.projectStaffing.sowReference),
    sowStatus: str(r, FIELDS.projectStaffing.sowStatus) as SowStatus | "",
    startDate: dateOrNull(r, FIELDS.projectStaffing.startDate),
    endDate: dateOrNull(r, FIELDS.projectStaffing.endDate),
    status: (str(r, FIELDS.projectStaffing.status) as StaffingStatus) || "",
    notes: str(r, FIELDS.projectStaffing.notes),
  };
}

export async function listAllStaffings(): Promise<StaffingAdminRecord[]> {
  const [records, projectNames] = await Promise.all([
    base(TABLES.projectStaffing).select().all(),
    getProjectNameMap(),
  ]);
  return records
    .map((r) => staffingAdminFromRecord(r, projectNames))
    .sort((a, b) => a.staffingCode.localeCompare(b.staffingCode));
}

export async function getStaffingById(recordId: string): Promise<StaffingAdminRecord | null> {
  try {
    const [r, projectNames] = await Promise.all([
      base(TABLES.projectStaffing).find(recordId),
      getProjectNameMap(),
    ]);
    return staffingAdminFromRecord(r, projectNames);
  } catch {
    return null;
  }
}

export type StaffingInput = {
  projectCode: string;
  memberRecordIds: string[];
  roleInProject: string;
  ratePerDay: number | null;
  currency: Currency | "";
  daysAllocated: number | null;
  fxToEur: number | null;
  sowReference: string;
  sowStatus: SowStatus | "";
  startDate: string | null;
  endDate: string | null;
  status: StaffingStatus | "";
  notes: string;
};

function staffingFields(input: StaffingInput): Record<string, unknown> {
  return {
    [FIELDS.projectStaffing.projectCode]: input.projectCode,
    [FIELDS.projectStaffing.memberCode]: input.memberRecordIds,
    [FIELDS.projectStaffing.roleInProject]: input.roleInProject,
    [FIELDS.projectStaffing.ratePerDay]: input.ratePerDay,
    [FIELDS.projectStaffing.currency]: input.currency === "" ? null : input.currency,
    [FIELDS.projectStaffing.daysAllocated]: input.daysAllocated,
    [FIELDS.projectStaffing.fxToEur]: input.fxToEur,
    [FIELDS.projectStaffing.sowReference]: input.sowReference,
    [FIELDS.projectStaffing.sowStatus]: input.sowStatus === "" ? null : input.sowStatus,
    [FIELDS.projectStaffing.startDate]: input.startDate,
    [FIELDS.projectStaffing.endDate]: input.endDate,
    [FIELDS.projectStaffing.status]: input.status === "" ? null : input.status,
    [FIELDS.projectStaffing.notes]: input.notes,
  };
}

export async function createStaffing(input: StaffingInput): Promise<string> {
  const [created] = await base(TABLES.projectStaffing).create([
    { fields: staffingFields(input) as FieldSet },
  ]);
  return created.id;
}

export async function updateStaffing(recordId: string, input: StaffingInput): Promise<void> {
  await base(TABLES.projectStaffing).update([
    { id: recordId, fields: staffingFields(input) as FieldSet },
  ]);
}

export async function deleteStaffing(recordId: string): Promise<void> {
  await base(TABLES.projectStaffing).destroy([recordId]);
}

// ---------------------------------------------------------------------------
// Code suggestion helpers
// ---------------------------------------------------------------------------

// Propose a member code from the name: 3 letters of last name + 2 letters of
// first name + suffix digit to resolve collisions, e.g. "Thomas Bouquet" -> "BOUTH1".
export async function suggestMemberCode(fullName: string): Promise<string> {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  const lastPart = last.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
  const firstPart = first.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
  const base = `${lastPart}${firstPart}`;
  if (base.length === 0) return "";
  const existing = await listAllMembers();
  const used = new Set(existing.map((m) => m.memberCode));
  for (let n = 1; n < 100; n += 1) {
    const candidate = `${base}${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return base;
}
