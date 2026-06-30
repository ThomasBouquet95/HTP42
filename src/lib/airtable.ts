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
  memberInvoices: "Member Invoices",
  tasks: "Tasks",
  contracts: "Contracts",
  chatConversations: "Chat Conversations",
  chatMessages: "Chat Messages",
} as const;

export const FIELDS = {
  networkMembers: {
    memberCode: "Member Code",
    fullName: "Full Name",
    email: "Email",
    personalEmail: "Personal Email",
    status: "Status",
    role: "Role",
    introduction: "Introduction",
    country: "Country",
    phone: "Phone",
    legalEntity: "Legal Entity",
    title: "Title",
    memberStatus: "Member Status",
    dailyRate: "Daily Rate",
    htp42DailyRate: "HTP42 Daily Rate",
    currency: "Currency",
    photo: "Photo",
    cv: "CV",
    lastSignIn: "Last Sign In",
    signInCount: "Sign In Count",
    lastActivity: "Last Activity",
    bankAccountName: "Bank Account Name",
    bankAccountAddress: "Bank Account Address",
    iban: "IBAN",
  },
  projects: {
    projectCode: "Project Code",
    projectName: "Project Name",
    clientCode: "Client Code",
    projectLeaders: "Project Leaders",
    type: "Type",
    objective: "Objective",
    startDate: "Start Date",
    endDate: "End Date",
    currency: "Currency",
    totalAmount: "Total Amount",
    fxToEur: "FX to EUR",
    totalAmountEur: "Total Amount EUR",
    status: "Status",
    paymentSchedule: "Payment Schedule",
  },
  clients: {
    clientCode: "Client Code",
    clientName: "Client Name",
    kind: "Client or Partner",
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
    projectRole: "Project Role",
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
    billingStatus: "Billing Status",
  },
  payments: {
    paymentCode: "Payment Code",
    direction: "Direction",
    type: "Type",
    project: "Project",
    member: "Member",
    client: "Client",
    memberInvoice: "Member Invoice",
    invoiceDate: "Invoice Date",
    invoiceReference: "Invoice Reference",
    invoiceCurrency: "Invoice Currency",
    invoiceValue: "Invoice Value",
    fxRateToEur: "FX Rate to EUR",
    invoiceValueEur: "Invoice Value EUR",
    paymentTerms: "Payment Terms",
    paymentStatus: "Payment Status",
    paymentDate: "Payment Date",
    dueDate: "Due Date",
    beneficiary: "Beneficiary",
    comment: "Comment",
    invoiceUrl: "Invoice URL",
  },
  memberInvoices: {
    invoiceCode: "Invoice Code",
    member: "Member",
    project: "Project",
    staffing: "Staffing",
    pdf: "PDF",
    submissionDate: "Submission Date",
    amount: "Amount",
    currency: "Currency",
    status: "Status",
    comment: "Comment",
    emailSent: "Email Sent",
    emailSentAt: "Email Sent At",
    emailError: "Email Error",
  },
  tasks: {
    title: "Title",
    description: "Description",
    status: "Status",
    priority: "Priority",
    dueDate: "Due Date",
    effortHours: "Effort (hours)",
    project: "Project",
    assignees: "Assignees",
    createdBy: "Created By",
    createdAt: "Created At",
    updatedAt: "Updated At",
    visibility: "Visibility",
  },
  // Contracts: NDAs, MSAs, SOWs, service contracts, etc. The dates in
  // this table are NOT date fields — they're singleSelect / multilineText
  // because admins enter free-form values like "MSA: Indefinite – SoW:
  // 15/11 → 15/12/2025". We surface them as plain strings in the UI.
  //
  // Canonical fields the portal reads and writes. The detailed-terms
  // columns (Confidentiality, IP, Non-solicitation, Exclusivity, Governing
  // Law, Notice Period, Duration, Consultant Visibility, Effective Date,
  // Specific Clauses, Company / Consultant, Contact Type, Signatory text,
  // Contact Details) still exist on the Airtable table but the portal no
  // longer surfaces them — their data has been migrated into Key Terms.
  contracts: {
    // Identity
    side: "Side",
    contractType: "Contract Type",
    otherDescription: "Other Description",
    client: "Client",
    project: "Project",
    projectCode: "Project Code",
    memberCode: "Member Code",
    // Signatories (1 + optional 2). Each has its own date because the
    // two parties often sign on different days.
    signatory1Name: "Signatory 1 Name",
    signatory1Role: "Signatory 1 Role",
    signatory1Company: "Signatory 1 Company",
    signatory1Date: "Signatory 1 Date",
    signatory2Name: "Signatory 2 Name",
    signatory2Role: "Signatory 2 Role",
    signatory2Company: "Signatory 2 Company",
    signatory2Date: "Signatory 2 Date",
    // Lifecycle. Validity is derived from Status + Expiry Date so it isn't
    // stored — the column may still exist on the table but the portal
    // ignores any value sitting in it.
    signatureDate: "Signature Date",
    expiryDate: "Expiry Date",
    stage: "Stage",
    // Free-form admin notes.
    comment: "Comment",
    // Summary + attachment
    keyTerms: "Key Terms",
    pdf: "PDF",
  },
  chatConversations: {
    title: "Title",
    kind: "Kind",
    members: "Members",
    createdBy: "Created By",
    createdAt: "Created At",
    lastMessageAt: "Last Message At",
    lastMessagePreview: "Last Message Preview",
    // Direct chats only. Sorted "recA|recB" of the two participant record
    // IDs. Used by ensureDirectConversation for exact-match dedupe — the
    // previous "list my conversations then filter in JS" approach is racy
    // and occasionally misses an existing DM, creating a duplicate.
    directKey: "Direct Key",
  },
  chatMessages: {
    body: "Body",
    conversation: "Conversation",
    sender: "Sender",
    sentAt: "Sent At",
    // Denormalized record id of the linked Conversation. Filtering by the
    // linked field directly is broken because Airtable's ARRAYJOIN on a
    // multipleRecordLinks projects the linked records' primary field, which
    // for DM conversations is the empty Title — so the formula matches
    // nothing. Storing the id as plain text sidesteps it.
    conversationId: "Conversation Id",
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

export type StaffingStatus = "Not Started" | "In Progress" | "Completed";
export const STAFFING_STATUSES: StaffingStatus[] = [
  "Not Started",
  "In Progress",
  "Completed",
];

// Staffing status is derived from the data, not stored: a staffing is
// "Completed" once its allocation has been consumed, "In Progress" as soon
// as a single timesheet has been logged, and "Not Started" otherwise.
export function deriveStaffingStatus(
  daysAllocated: number | null,
  daysUsed: number,
): StaffingStatus {
  if (daysAllocated != null && daysAllocated > 0 && daysUsed >= daysAllocated) return "Completed";
  if (daysUsed > 0) return "In Progress";
  return "Not Started";
}

export type ProjectRole = "Engagement Lead" | "Project Lead" | "Consultant";
export const PROJECT_ROLES: ProjectRole[] = ["Engagement Lead", "Project Lead", "Consultant"];
// Roles that grant access to the team's timesheets (Project Staffing Summary).
export const LEADER_ROLES: ProjectRole[] = ["Engagement Lead", "Project Lead"];

// Leadership rank — lower is more senior. Used to sort team members in the
// Project Staffing Summary so Engagement Leads appear first, then Project
// Leaders, then everyone else.
export function leadRank(m: { staffings: Array<{ projectRole: ProjectRole | "" }> }): number {
  if (m.staffings.some((s) => s.projectRole === "Engagement Lead")) return 0;
  if (m.staffings.some((s) => s.projectRole === "Project Lead")) return 1;
  return 2;
}
export type SowStatus = "Signed" | "In Progress" | "Draft" | "Not Started";
export const SOW_STATUSES: SowStatus[] = ["Not Started", "Draft", "In Progress", "Signed"];

// One status spans the whole lifecycle of a timesheet:
//   Draft → Submitted → Invoiced → Paid (Deleted is a terminal opt-out).
// Members own the Draft → Submitted transition; admins own the Invoiced and
// Paid steps. The legacy "Billing Status" field is no longer written by the
// portal; it stays on Airtable for historical records but is ignored on read.
export type TimesheetStatus =
  | "Draft"
  | "Submitted"
  | "Invoiced"
  | "Paid"
  | "Deleted";
export const TIMESHEET_STATUSES: TimesheetStatus[] = [
  "Draft",
  "Submitted",
  "Invoiced",
  "Paid",
  "Deleted",
];

// Kept only so legacy imports compile while we tear out the dual-status UI.
// Do not use in new code.
export type BillingStatus = "To invoice" | "Invoiced" | "Paid";
export const BILLING_STATUSES: BillingStatus[] = ["To invoice", "Invoiced", "Paid"];

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

export type PaymentDirection = "Inflow" | "Outflow";
// Order matters here: this is the order admins see in the payment status
// dropdown. "Under Review" sits first because it's the new default for
// auto-created outflows from member-invoice submissions — admins want to
// see those at the top of the dropdown when triaging an invoice.
export type PaymentStatus =
  | "Under Review"
  | "Scheduled"
  | "To be paid"
  | "Paid"
  | "Canceled";
export const PAYMENT_STATUSES: PaymentStatus[] = [
  "Under Review",
  "Scheduled",
  "To be paid",
  "Paid",
  "Canceled",
];

export type AttachmentRef = {
  id: string;
  url: string;
  filename: string;
  size: number;
  type: string;
};

export type MemberRecord = {
  id: string;
  memberCode: string;
  fullName: string;
  email: string;
  // Personal mailbox the member opts to share (Gmail, etc.). Display only;
  // login still uses the official `email` field.
  personalEmail: string;
  status: MemberStatus;
  role: MemberRole | "";
  introduction: string;
  country: string;
  phone: string;
  legalEntity: string;
  title: string;
  photo: AttachmentRef | null;
  cv: AttachmentRef | null;
  // Bank details used to pay this member. All optional. Captured via the
  // profile page "Bank account" modal, persisted on Network Members.
  bankAccountName: string;
  bankAccountAddress: string;
  iban: string;
};

export type MemberAdminRecord = MemberRecord & {
  dailyRate: number | null;
  htp42DailyRate: number | null;
  currency: Currency | "";
};

export type ClientKind = "Client" | "Partner";
export const CLIENT_KINDS: ClientKind[] = ["Client", "Partner"];

export type ClientRecord = {
  id: string;
  clientCode: string;
  clientName: string;
  kind: ClientKind | "";
  industry: string;
  country: string;
  keyContact: string;
  notes: string;
};

// Payment-schedule entries. Discriminated by project type:
//   - Fixed Price projects bill against named milestones with a target date.
//   - Time & Material projects bill monthly against a planned % of the
//     total budget.
// We persist the whole array as JSON in the "Payment Schedule" multiline
// text field on the Projects row so adding a new entry doesn't need a
// schema migration.
export type FixedPriceScheduleEntry = {
  kind: "milestone";
  milestone: string;
  percent: number; // 0..100
  date: string | null; // ISO yyyy-mm-dd
};

export type TimeMaterialScheduleEntry = {
  kind: "month";
  month: string; // ISO yyyy-mm
  percent: number; // 0..100
};

export type PaymentScheduleEntry = FixedPriceScheduleEntry | TimeMaterialScheduleEntry;

export type ProjectRecord = {
  id: string;
  projectCode: string;
  projectName: string;
  clientRecordIds: string[];
  clientCodes: string[];
  projectLeaderRecordIds: string[];
  projectLeaderCodes: string[];
  type: ProjectType | "";
  objective: string;
  startDate: string | null;
  endDate: string | null;
  currency: Currency | "";
  totalAmount: number | null;
  fxToEur: number | null;
  totalAmountEur: number | null;
  status: ProjectStatus | "";
  paymentSchedule: PaymentScheduleEntry[];
};

export type PaymentRecord = {
  id: string;
  paymentCode: string;
  direction: PaymentDirection | "";
  type: string;
  projectRecordIds: string[];
  clientRecordIds: string[];
  memberRecordIds: string[];
  memberInvoiceRecordIds: string[];
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
  dueDate: string | null;
  beneficiary: string;
  comment: string;
  invoiceUrl: string;
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
  projectRole: ProjectRole | "";
  ratePerDay: number | null;
  currency: Currency | "";
  daysAllocated: number | null;
  daysUsed: number; // computed from non-deleted timesheets (hours / 8)
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

function firstAttachment(r: AirtableRecord<FieldSet>, field: string): AttachmentRef | null {
  const v = r.get(field);
  if (!Array.isArray(v) || v.length === 0) return null;
  const a = v[0] as { id?: string; url?: string; filename?: string; size?: number; type?: string };
  if (!a || typeof a.url !== "string") return null;
  return {
    id: typeof a.id === "string" ? a.id : "",
    url: a.url,
    filename: typeof a.filename === "string" ? a.filename : "",
    size: typeof a.size === "number" ? a.size : 0,
    type: typeof a.type === "string" ? a.type : "",
  };
}

function escape(formulaValue: string): string {
  // Escape backslashes first, then double quotes, so values containing `\"`
  // cannot break out of the quoted string in filterByFormula.
  return formulaValue.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function memberFromRecord(r: AirtableRecord<FieldSet>): MemberRecord {
  return {
    id: r.id,
    memberCode: str(r, FIELDS.networkMembers.memberCode),
    fullName: str(r, FIELDS.networkMembers.fullName),
    email: str(r, FIELDS.networkMembers.email),
    personalEmail: str(r, FIELDS.networkMembers.personalEmail),
    status: str(r, FIELDS.networkMembers.status) as MemberStatus,
    role: str(r, FIELDS.networkMembers.role) as MemberRole | "",
    introduction: str(r, FIELDS.networkMembers.introduction),
    country: str(r, FIELDS.networkMembers.country),
    phone: str(r, FIELDS.networkMembers.phone),
    legalEntity: str(r, FIELDS.networkMembers.legalEntity),
    title: str(r, FIELDS.networkMembers.title),
    photo: firstAttachment(r, FIELDS.networkMembers.photo),
    cv: firstAttachment(r, FIELDS.networkMembers.cv),
    bankAccountName: str(r, FIELDS.networkMembers.bankAccountName),
    bankAccountAddress: str(r, FIELDS.networkMembers.bankAccountAddress),
    iban: str(r, FIELDS.networkMembers.iban),
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
  personalEmail?: string;
  bankAccountName?: string;
  bankAccountAddress?: string;
  iban?: string;
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
  if (input.personalEmail !== undefined) {
    fields[FIELDS.networkMembers.personalEmail] = input.personalEmail || null;
  }
  if (input.bankAccountName !== undefined) {
    fields[FIELDS.networkMembers.bankAccountName] = input.bankAccountName;
  }
  if (input.bankAccountAddress !== undefined) {
    fields[FIELDS.networkMembers.bankAccountAddress] = input.bankAccountAddress;
  }
  if (input.iban !== undefined) fields[FIELDS.networkMembers.iban] = input.iban;
  if (Object.keys(fields).length === 0) return getMemberById(recordId);
  const [updated] = await base(TABLES.networkMembers).update([
    { id: recordId, fields: fields as FieldSet },
  ]);
  return memberFromRecord(updated);
}

// Upload an attachment to an attachment field on a member record using
// Airtable's content endpoint (base64 payload, up to 5 MB per file).
// We replace any existing attachment in the field to keep things simple.
export async function uploadMemberAttachment(
  recordId: string,
  field: "photo" | "cv",
  filename: string,
  contentType: string,
  base64: string,
): Promise<MemberRecord | null> {
  const fieldName = field === "photo" ? FIELDS.networkMembers.photo : FIELDS.networkMembers.cv;
  const url = `https://content.airtable.com/v0/${env.airtableBaseId}/${recordId}/${encodeURIComponent(fieldName)}/uploadAttachment`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.airtablePat}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ contentType, filename, file: base64 }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Airtable upload failed (${res.status}): ${text}`);
  }
  return getMemberById(recordId);
}

export async function clearMemberAttachment(
  recordId: string,
  field: "photo" | "cv",
): Promise<MemberRecord | null> {
  const fieldName = field === "photo" ? FIELDS.networkMembers.photo : FIELDS.networkMembers.cv;
  await base(TABLES.networkMembers).update([
    { id: recordId, fields: { [fieldName]: [] } as FieldSet },
  ]);
  return getMemberById(recordId);
}

// ---------------------------------------------------------------------------
// Admin: Network Members
// ---------------------------------------------------------------------------

function memberAdminFromRecord(r: AirtableRecord<FieldSet>): MemberAdminRecord {
  return {
    ...memberFromRecord(r),
    dailyRate: numOrNull(r, FIELDS.networkMembers.dailyRate),
    htp42DailyRate: numOrNull(r, FIELDS.networkMembers.htp42DailyRate),
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

export type SignInActivity = {
  id: string;
  memberCode: string;
  fullName: string;
  email: string;
  status: MemberStatus;
  role: MemberRole | "";
  photoUrl: string | null;
  lastSignIn: string | null; // ISO datetime string
  signInCount: number;
  // Updated by the portal heartbeat (~ every 60s while the user has the
  // app open). Null = the member has never opened the portal since the
  // heartbeat shipped.
  lastActivity: string | null;
};

// Admin: list every member with their sign-in activity. Members who have
// never signed in have lastSignIn = null and signInCount = 0.
export async function listSignInActivity(): Promise<SignInActivity[]> {
  const records = await base(TABLES.networkMembers)
    .select({
      fields: [
        FIELDS.networkMembers.memberCode,
        FIELDS.networkMembers.fullName,
        FIELDS.networkMembers.email,
        FIELDS.networkMembers.memberStatus,
        FIELDS.networkMembers.role,
        FIELDS.networkMembers.photo,
        FIELDS.networkMembers.lastSignIn,
        FIELDS.networkMembers.signInCount,
        FIELDS.networkMembers.lastActivity,
      ],
    })
    .all();
  return records.map((r) => ({
    id: r.id,
    memberCode: str(r, FIELDS.networkMembers.memberCode),
    fullName: str(r, FIELDS.networkMembers.fullName),
    email: str(r, FIELDS.networkMembers.email),
    status: (str(r, FIELDS.networkMembers.memberStatus) as MemberStatus) || "Inactive",
    role: (str(r, FIELDS.networkMembers.role) as MemberRole) || "",
    photoUrl: firstAttachment(r, FIELDS.networkMembers.photo)?.url ?? null,
    lastSignIn: (r.get(FIELDS.networkMembers.lastSignIn) as string | undefined) ?? null,
    signInCount: num(r, FIELDS.networkMembers.signInCount),
    lastActivity: (r.get(FIELDS.networkMembers.lastActivity) as string | undefined) ?? null,
  }));
}

// Best-effort: bump Last Sign In and Sign In Count for the member who just
// completed an SSO login. Failures are swallowed — we never want a transient
// Airtable hiccup to block someone from signing in.
export async function recordSignIn(memberRecordId: string): Promise<void> {
  try {
    const r = await base(TABLES.networkMembers).find(memberRecordId);
    const current = num(r, FIELDS.networkMembers.signInCount);
    const now = new Date().toISOString();
    await base(TABLES.networkMembers).update([
      {
        id: memberRecordId,
        fields: {
          [FIELDS.networkMembers.lastSignIn]: now,
          [FIELDS.networkMembers.signInCount]: current + 1,
          [FIELDS.networkMembers.lastActivity]: now,
        },
      },
    ]);
  } catch {
    // ignore
  }
}

// Bumped by a client-side heartbeat (~ once a minute while the portal tab is
// open + visible). Throttled in-process: if the member's most recent value
// is within `minIntervalMs`, we skip the Airtable write to spare the rate
// limit. Failures are swallowed since presence is non-critical UX.
const lastActivityMemoryCache = new Map<string, number>();
const DEFAULT_HEARTBEAT_INTERVAL_MS = 45_000;
export async function recordHeartbeat(
  memberRecordId: string,
  minIntervalMs: number = DEFAULT_HEARTBEAT_INTERVAL_MS,
): Promise<void> {
  const prev = lastActivityMemoryCache.get(memberRecordId);
  const now = Date.now();
  if (prev !== undefined && now - prev < minIntervalMs) return;
  lastActivityMemoryCache.set(memberRecordId, now);
  try {
    await base(TABLES.networkMembers).update([
      {
        id: memberRecordId,
        fields: {
          [FIELDS.networkMembers.lastActivity]: new Date(now).toISOString(),
        },
      },
    ]);
  } catch {
    // On failure forget the cache entry so the next heartbeat retries.
    lastActivityMemoryCache.delete(memberRecordId);
  }
}

export type MemberAdminUpdate = MemberProfileUpdate & {
  memberCode?: string;
  email?: string;
  role?: MemberRole;
  status?: MemberStatus;
  title?: string;
  dailyRate?: number | null;
  htp42DailyRate?: number | null;
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
  if (input.personalEmail !== undefined) {
    fields[FIELDS.networkMembers.personalEmail] = input.personalEmail || null;
  }
  if (input.dailyRate !== undefined) fields[FIELDS.networkMembers.dailyRate] = input.dailyRate;
  if (input.htp42DailyRate !== undefined) {
    fields[FIELDS.networkMembers.htp42DailyRate] = input.htp42DailyRate;
  }
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
  if (input.personalEmail !== undefined) {
    fields[FIELDS.networkMembers.personalEmail] = input.personalEmail || null;
  }
  if (input.introduction !== undefined) fields[FIELDS.networkMembers.introduction] = input.introduction;
  if (input.country !== undefined) fields[FIELDS.networkMembers.country] = input.country;
  if (input.phone !== undefined) fields[FIELDS.networkMembers.phone] = input.phone;
  if (input.legalEntity !== undefined) fields[FIELDS.networkMembers.legalEntity] = input.legalEntity;
  if (input.title !== undefined) fields[FIELDS.networkMembers.title] = input.title;
  if (input.role !== undefined) fields[FIELDS.networkMembers.role] = input.role;
  if (input.status !== undefined) fields[FIELDS.networkMembers.status] = input.status;
  if (input.dailyRate !== undefined) fields[FIELDS.networkMembers.dailyRate] = input.dailyRate;
  if (input.htp42DailyRate !== undefined) {
    fields[FIELDS.networkMembers.htp42DailyRate] = input.htp42DailyRate;
  }
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

export async function adminUpdateMemberStatus(
  recordId: string,
  status: MemberStatus,
): Promise<void> {
  await base(TABLES.networkMembers).update([
    {
      id: recordId,
      fields: {
        [FIELDS.networkMembers.status]: status,
      } as FieldSet,
    },
  ]);
}

// ---------------------------------------------------------------------------
// Admin: Clients
// ---------------------------------------------------------------------------

function clientFromRecord(r: AirtableRecord<FieldSet>): ClientRecord {
  return {
    id: r.id,
    clientCode: str(r, FIELDS.clients.clientCode),
    clientName: str(r, FIELDS.clients.clientName),
    kind: (str(r, FIELDS.clients.kind) as ClientKind) || "",
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
  kind: ClientKind | "";
  industry: string;
  country: string;
  keyContact: string;
  notes: string;
};

function clientFields(input: ClientInput): Record<string, unknown> {
  return {
    [FIELDS.clients.clientCode]: input.clientCode,
    [FIELDS.clients.clientName]: input.clientName,
    [FIELDS.clients.kind]: input.kind === "" ? null : input.kind,
    [FIELDS.clients.industry]: input.industry,
    [FIELDS.clients.country]: input.country,
    [FIELDS.clients.keyContact]: input.keyContact,
    [FIELDS.clients.notes]: input.notes,
  };
}

export async function createClient(input: ClientInput): Promise<string> {
  const [created] = await base(TABLES.clients).create(
    [{ fields: clientFields(input) as FieldSet }],
    { typecast: true },
  );
  return created.id;
}

export async function updateClient(recordId: string, input: ClientInput): Promise<void> {
  await base(TABLES.clients).update(
    [{ id: recordId, fields: clientFields(input) as FieldSet }],
    { typecast: true },
  );
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

function parsePaymentSchedule(raw: string): PaymentScheduleEntry[] {
  // Stored as JSON in a multilineText field. Treat any parse / shape issue
  // as "no schedule yet" so a hand-edit in Airtable can't crash reads.
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: PaymentScheduleEntry[] = [];
    for (const e of parsed) {
      if (!e || typeof e !== "object") continue;
      const kind = (e as { kind?: unknown }).kind;
      const percent = Number((e as { percent?: unknown }).percent);
      if (!Number.isFinite(percent)) continue;
      if (kind === "milestone") {
        out.push({
          kind: "milestone",
          milestone: typeof (e as { milestone?: unknown }).milestone === "string"
            ? (e as { milestone: string }).milestone
            : "",
          percent,
          date:
            typeof (e as { date?: unknown }).date === "string" && (e as { date: string }).date
              ? (e as { date: string }).date
              : null,
        });
      } else if (kind === "month") {
        out.push({
          kind: "month",
          month: typeof (e as { month?: unknown }).month === "string"
            ? (e as { month: string }).month
            : "",
          percent,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function projectFromRecord(r: AirtableRecord<FieldSet>): ProjectRecord {
  return {
    id: r.id,
    projectCode: str(r, FIELDS.projects.projectCode),
    projectName: str(r, FIELDS.projects.projectName),
    clientRecordIds: linkedIds(r, FIELDS.projects.clientCode),
    clientCodes: linkedDisplay(r, FIELDS.projects.clientCode),
    projectLeaderRecordIds: linkedIds(r, FIELDS.projects.projectLeaders),
    projectLeaderCodes: linkedDisplay(r, FIELDS.projects.projectLeaders),
    type: str(r, FIELDS.projects.type) as ProjectType | "",
    objective: str(r, FIELDS.projects.objective),
    startDate: dateOrNull(r, FIELDS.projects.startDate),
    endDate: dateOrNull(r, FIELDS.projects.endDate),
    currency: str(r, FIELDS.projects.currency) as Currency | "",
    totalAmount: numOrNull(r, FIELDS.projects.totalAmount),
    fxToEur: numOrNull(r, FIELDS.projects.fxToEur),
    totalAmountEur: numOrNull(r, FIELDS.projects.totalAmountEur),
    status: str(r, FIELDS.projects.status) as ProjectStatus | "",
    paymentSchedule: parsePaymentSchedule(str(r, FIELDS.projects.paymentSchedule)),
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
  projectLeaderRecordIds: string[];
  type: ProjectType | "";
  objective: string;
  startDate: string | null;
  endDate: string | null;
  currency: Currency | "";
  totalAmount: number | null;
  fxToEur: number | null;
  status: ProjectStatus | "";
  paymentSchedule: PaymentScheduleEntry[];
};

function serialisePaymentSchedule(entries: PaymentScheduleEntry[]): string | null {
  // Empty array → null so Airtable shows a clean empty cell instead of "[]".
  if (!entries || entries.length === 0) return null;
  return JSON.stringify(entries);
}

function projectFields(input: ProjectInput): Record<string, unknown> {
  return {
    [FIELDS.projects.projectCode]: input.projectCode,
    [FIELDS.projects.projectName]: input.projectName,
    [FIELDS.projects.clientCode]: input.clientRecordIds,
    [FIELDS.projects.projectLeaders]: input.projectLeaderRecordIds,
    [FIELDS.projects.type]: input.type === "" ? null : input.type,
    [FIELDS.projects.objective]: input.objective,
    [FIELDS.projects.startDate]: input.startDate,
    [FIELDS.projects.endDate]: input.endDate,
    [FIELDS.projects.currency]: input.currency === "" ? null : input.currency,
    [FIELDS.projects.totalAmount]: input.totalAmount,
    [FIELDS.projects.fxToEur]: input.fxToEur,
    [FIELDS.projects.status]: input.status === "" ? null : input.status,
    [FIELDS.projects.paymentSchedule]: serialisePaymentSchedule(input.paymentSchedule),
  };
}

export async function createProject(input: ProjectInput): Promise<string> {
  const [created] = await base(TABLES.projects).create([
    { fields: projectFields(input) as FieldSet },
  ]);
  return created.id;
}

export async function updateProjectStatus(
  recordId: string,
  status: ProjectStatus | "",
): Promise<void> {
  await base(TABLES.projects).update([
    {
      id: recordId,
      fields: {
        [FIELDS.projects.status]: status === "" ? null : status,
      } as FieldSet,
    },
  ]);
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
    memberInvoiceRecordIds: linkedIds(r, FIELDS.payments.memberInvoice),
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
    dueDate: dateOrNull(r, FIELDS.payments.dueDate),
    beneficiary: str(r, FIELDS.payments.beneficiary),
    comment: str(r, FIELDS.payments.comment),
    invoiceUrl: str(r, FIELDS.payments.invoiceUrl),
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
  memberInvoiceRecordIds: string[];
  invoiceDate: string | null;
  invoiceReference: string;
  invoiceCurrency: Currency | "";
  invoiceValue: number | null;
  fxRateToEur: number | null;
  invoiceValueEur: number | null;
  paymentTerms: string;
  paymentStatus: PaymentStatus | "";
  paymentDate: string | null;
  dueDate: string | null;
  beneficiary: string;
  comment: string;
  invoiceUrl: string;
};

function paymentFields(input: PaymentInput): Record<string, unknown> {
  return {
    [FIELDS.payments.direction]: input.direction === "" ? null : input.direction,
    [FIELDS.payments.type]: input.type,
    [FIELDS.payments.project]: input.projectRecordIds,
    [FIELDS.payments.client]: input.clientRecordIds,
    [FIELDS.payments.member]: input.memberRecordIds,
    [FIELDS.payments.memberInvoice]: input.memberInvoiceRecordIds,
    [FIELDS.payments.invoiceDate]: input.invoiceDate,
    [FIELDS.payments.invoiceReference]: input.invoiceReference,
    [FIELDS.payments.invoiceCurrency]: input.invoiceCurrency === "" ? null : input.invoiceCurrency,
    [FIELDS.payments.invoiceValue]: input.invoiceValue,
    [FIELDS.payments.fxRateToEur]: input.fxRateToEur,
    [FIELDS.payments.invoiceValueEur]: input.invoiceValueEur,
    [FIELDS.payments.paymentTerms]: input.paymentTerms,
    [FIELDS.payments.paymentStatus]: input.paymentStatus === "" ? null : input.paymentStatus,
    // Payment Date should reflect the day money actually moved — only
    // accept it when the payment has been executed (Paid). Otherwise clear.
    [FIELDS.payments.paymentDate]: input.paymentStatus === "Paid" ? input.paymentDate : null,
    [FIELDS.payments.dueDate]: input.dueDate,
    [FIELDS.payments.beneficiary]: input.beneficiary,
    [FIELDS.payments.comment]: input.comment,
    // Empty string clears the URL field; Airtable accepts "" for url fields.
    [FIELDS.payments.invoiceUrl]: input.invoiceUrl || null,
  };
}

export async function createPayment(input: PaymentInput): Promise<string> {
  const [created] = await base(TABLES.payments).create([
    { fields: paymentFields(input) as FieldSet },
  ]);
  return created.id;
}

export async function updatePaymentStatus(
  recordId: string,
  status: PaymentStatus | "",
): Promise<void> {
  const fields: Record<string, unknown> = {
    [FIELDS.payments.paymentStatus]: status === "" ? null : status,
  };
  // Keep Payment Date consistent with the lifecycle: if the payment isn't
  // executed anymore, drop any stale date that might have been set earlier.
  if (status !== "Paid") {
    fields[FIELDS.payments.paymentDate] = null;
  }
  await base(TABLES.payments).update([{ id: recordId, fields: fields as FieldSet }]);
}

export async function updatePayment(recordId: string, input: PaymentInput): Promise<void> {
  await base(TABLES.payments).update([
    { id: recordId, fields: paymentFields(input) as FieldSet },
  ]);
}

export async function deletePayment(recordId: string): Promise<void> {
  await base(TABLES.payments).destroy([recordId]);
}

// ---------------------------------------------------------------------------
// Member Invoices — submitted by network members (PDF upload + status flow)
// ---------------------------------------------------------------------------

export type InvoiceStatus = "To be paid" | "Paid" | "Cancelled";
export const INVOICE_STATUSES: InvoiceStatus[] = ["To be paid", "Paid", "Cancelled"];

export type MemberInvoiceRecord = {
  id: string;
  invoiceCode: string;
  memberRecordId: string;
  memberCode: string;
  memberName: string;
  staffingRecordId: string;
  staffingCode: string;
  projectRecordId: string;
  projectCode: string;
  projectName: string;
  pdf: AttachmentRef | null;
  submissionDate: string | null;
  amount: number | null;
  currency: Currency | "";
  status: InvoiceStatus | "";
  comment: string;
  emailSent: boolean;
  emailSentAt: string | null;
  emailError: string;
};

function invoiceFromRecord(
  r: AirtableRecord<FieldSet>,
  memberById: Map<string, { code: string; name: string }>,
  projectById: Map<string, { code: string; name: string }>,
  staffingById: Map<string, { code: string; projectCode: string; projectName: string }>,
): MemberInvoiceRecord {
  const memberIds = linkedIds(r, FIELDS.memberInvoices.member);
  const projectIds = linkedIds(r, FIELDS.memberInvoices.project);
  const staffingIds = linkedIds(r, FIELDS.memberInvoices.staffing);
  const m = memberIds[0] ? memberById.get(memberIds[0]) : undefined;
  const s = staffingIds[0] ? staffingById.get(staffingIds[0]) : undefined;
  // Project info: prefer the staffing's project (the source of truth now);
  // fall back to the legacy Project link for invoices created before the
  // staffing field existed.
  const p = projectIds[0] ? projectById.get(projectIds[0]) : undefined;
  const projectCode = s?.projectCode || p?.code || "";
  const projectName = s?.projectName || p?.name || "";
  return {
    id: r.id,
    invoiceCode: str(r, FIELDS.memberInvoices.invoiceCode),
    memberRecordId: memberIds[0] ?? "",
    memberCode: m?.code ?? "",
    memberName: m?.name ?? "",
    staffingRecordId: staffingIds[0] ?? "",
    staffingCode: s?.code ?? "",
    projectRecordId: projectIds[0] ?? "",
    projectCode,
    projectName,
    pdf: firstAttachment(r, FIELDS.memberInvoices.pdf),
    submissionDate: (r.get(FIELDS.memberInvoices.submissionDate) as string | undefined) ?? null,
    amount: numOrNull(r, FIELDS.memberInvoices.amount),
    currency: str(r, FIELDS.memberInvoices.currency) as Currency | "",
    status: (str(r, FIELDS.memberInvoices.status) as InvoiceStatus) || "",
    comment: str(r, FIELDS.memberInvoices.comment),
    emailSent: r.get(FIELDS.memberInvoices.emailSent) === true,
    emailSentAt: (r.get(FIELDS.memberInvoices.emailSentAt) as string | undefined) ?? null,
    emailError: str(r, FIELDS.memberInvoices.emailError),
  };
}

async function getProjectIndex(): Promise<Map<string, { code: string; name: string }>> {
  const records = await base(TABLES.projects)
    .select({ fields: [FIELDS.projects.projectCode, FIELDS.projects.projectName] })
    .all();
  return new Map(
    records.map((r) => [
      r.id,
      {
        code: str(r, FIELDS.projects.projectCode),
        name: str(r, FIELDS.projects.projectName),
      },
    ]),
  );
}

async function getMemberIndex(): Promise<Map<string, { code: string; name: string }>> {
  const records = await base(TABLES.networkMembers)
    .select({
      fields: [FIELDS.networkMembers.memberCode, FIELDS.networkMembers.fullName],
    })
    .all();
  return new Map(
    records.map((r) => [
      r.id,
      {
        code: str(r, FIELDS.networkMembers.memberCode),
        name: str(r, FIELDS.networkMembers.fullName),
      },
    ]),
  );
}

async function getStaffingIndex(): Promise<
  Map<string, { code: string; projectCode: string; projectName: string }>
> {
  const [records, projectNames] = await Promise.all([
    base(TABLES.projectStaffing)
      .select({
        fields: [FIELDS.projectStaffing.staffingCode, FIELDS.projectStaffing.projectCode],
      })
      .all(),
    getProjectNameMap(),
  ]);
  const map = new Map<string, { code: string; projectCode: string; projectName: string }>();
  for (const r of records) {
    const projectCode = str(r, FIELDS.projectStaffing.projectCode);
    map.set(r.id, {
      code: str(r, FIELDS.projectStaffing.staffingCode),
      projectCode,
      projectName: projectNames.get(projectCode) ?? "",
    });
  }
  return map;
}

export async function listInvoicesForMember(
  memberRecordId: string,
): Promise<MemberInvoiceRecord[]> {
  const [records, projectById, memberById, staffingById] = await Promise.all([
    base(TABLES.memberInvoices)
      .select({ sort: [{ field: FIELDS.memberInvoices.submissionDate, direction: "desc" }] })
      .all(),
    getProjectIndex(),
    getMemberIndex(),
    getStaffingIndex(),
  ]);
  return records
    .map((r) => invoiceFromRecord(r, memberById, projectById, staffingById))
    .filter((inv) => inv.memberRecordId === memberRecordId);
}

export async function listAllInvoices(): Promise<MemberInvoiceRecord[]> {
  const [records, projectById, memberById, staffingById] = await Promise.all([
    base(TABLES.memberInvoices)
      .select({ sort: [{ field: FIELDS.memberInvoices.submissionDate, direction: "desc" }] })
      .all(),
    getProjectIndex(),
    getMemberIndex(),
    getStaffingIndex(),
  ]);
  return records.map((r) => invoiceFromRecord(r, memberById, projectById, staffingById));
}

export async function getInvoiceById(recordId: string): Promise<MemberInvoiceRecord | null> {
  try {
    const [r, projectById, memberById, staffingById] = await Promise.all([
      base(TABLES.memberInvoices).find(recordId),
      getProjectIndex(),
      getMemberIndex(),
      getStaffingIndex(),
    ]);
    return invoiceFromRecord(r, memberById, projectById, staffingById);
  } catch {
    return null;
  }
}

export type InvoiceCreateInput = {
  memberRecordId: string;
  staffingRecordId: string;
  // Derived from the staffing for convenience: keeps the legacy Project
  // link populated so admin views that filter by project still work.
  projectRecordId: string;
  amount: number | null;
  currency: Currency | "";
  comment: string;
  // PDF is uploaded directly via Airtable's content endpoint and the
  // returned URL is passed back in here so the record references it as
  // an attachment.
  pdfAttachment: { url: string; filename: string } | null;
};

export async function createMemberInvoice(input: InvoiceCreateInput): Promise<string> {
  const fields: Record<string, unknown> = {
    [FIELDS.memberInvoices.member]: [input.memberRecordId],
    [FIELDS.memberInvoices.staffing]: [input.staffingRecordId],
    [FIELDS.memberInvoices.project]: [input.projectRecordId],
    [FIELDS.memberInvoices.submissionDate]: new Date().toISOString(),
    [FIELDS.memberInvoices.amount]: input.amount,
    [FIELDS.memberInvoices.currency]: input.currency === "" ? null : input.currency,
    [FIELDS.memberInvoices.status]: "To be paid",
    [FIELDS.memberInvoices.comment]: input.comment,
    [FIELDS.memberInvoices.emailSent]: false,
  };
  const [created] = await base(TABLES.memberInvoices).create([
    { fields: fields as FieldSet },
  ]);
  return created.id;
}

// Uploads the PDF directly to the invoice record's PDF field via Airtable's
// content endpoint (the only supported way to attach a file we hold in
// memory rather than referenced by URL).
export async function attachInvoicePdf(
  recordId: string,
  filename: string,
  base64: string,
): Promise<void> {
  const url = `https://content.airtable.com/v0/${env.airtableBaseId}/${recordId}/${encodeURIComponent(FIELDS.memberInvoices.pdf)}/uploadAttachment`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.airtablePat}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ contentType: "application/pdf", filename, file: base64 }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Airtable upload failed (${res.status}): ${text}`);
  }
}

export async function updateInvoiceStatus(
  recordId: string,
  status: InvoiceStatus,
): Promise<void> {
  await base(TABLES.memberInvoices).update([
    { id: recordId, fields: { [FIELDS.memberInvoices.status]: status } as FieldSet },
  ]);
}

export async function deleteInvoice(recordId: string): Promise<void> {
  await base(TABLES.memberInvoices).destroy([recordId]);
}

export async function markInvoiceEmail(
  recordId: string,
  result: { ok: true; sentAt: string } | { ok: false; error: string },
): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (result.ok) {
    fields[FIELDS.memberInvoices.emailSent] = true;
    fields[FIELDS.memberInvoices.emailSentAt] = result.sentAt;
    fields[FIELDS.memberInvoices.emailError] = "";
  } else {
    fields[FIELDS.memberInvoices.emailSent] = false;
    fields[FIELDS.memberInvoices.emailError] = result.error.slice(0, 250);
  }
  await base(TABLES.memberInvoices).update([
    { id: recordId, fields: fields as FieldSet },
  ]);
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
  // Treat staffings whose status is null or anything other than Completed as
  // eligible. Status is auto-derived (see deriveStaffingStatus) so this in
  // practice excludes only staffings whose allocation has been fully consumed.
  return all.filter((s) => s.status !== "Completed");
}

// Returns the set of network-member record IDs the given user shares at least
// one project with — used to scope the Tasks "assignees" picker so members
// can only tag teammates, not arbitrary people in the network. Always
// includes the caller themselves.
export async function getTeammateMemberRecordIds(
  memberCode: string,
): Promise<Set<string>> {
  const staffings = await base(TABLES.projectStaffing).select().all();
  const myProjectCodes = new Set<string>();
  for (const r of staffings) {
    if (str(r, FIELDS.projectStaffing.memberCode) === memberCode) {
      myProjectCodes.add(str(r, FIELDS.projectStaffing.projectCode));
    }
  }
  const teammateCodes = new Set<string>([memberCode]);
  for (const r of staffings) {
    if (myProjectCodes.has(str(r, FIELDS.projectStaffing.projectCode))) {
      teammateCodes.add(str(r, FIELDS.projectStaffing.memberCode));
    }
  }
  const members = await listAllMembers();
  const ids = new Set<string>();
  for (const m of members) {
    if (teammateCodes.has(m.memberCode)) ids.add(m.id);
  }
  return ids;
}

// The linked Member Code field on staffing uses Network Members record IDs, but
// filterByFormula sees their primary-field values (the member codes). We filter
// by the visible memberCode string with FIND to remain robust if multiple links exist.
async function staffingsByMemberCodeString(memberCode: string): Promise<Map<string, StaffingRecord>> {
  const [records, projectNames] = await Promise.all([
    base(TABLES.projectStaffing)
      .select({
        filterByFormula: `FIND("${escape(memberCode)}", ARRAYJOIN({${FIELDS.projectStaffing.memberCode}}))`,
      })
      .all(),
    getProjectNameMap(),
  ]);
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
  // Legacy fold: a few rows still carry "Invoiced"/"Paid" on the old Billing
  // Status field while their main Status is still "Submitted". Treat the
  // billing value as the source of truth in that case so the admin UI shows
  // the right state without a one-shot migration script.
  const rawStatus = (str(r, FIELDS.timesheets.status) as TimesheetStatus) || "Draft";
  const billing = str(r, FIELDS.timesheets.billingStatus);
  let status: TimesheetStatus = rawStatus;
  if (rawStatus === "Submitted" && (billing === "Invoiced" || billing === "Paid")) {
    status = billing;
  }
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
    status,
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
    // Fan out the three Airtable calls instead of awaiting them in series.
    // The ownership check uses the member-code map, which is also needed by
    // toTimesheet's caller, so fetching it in parallel costs nothing extra.
    const [r, staffings, memberCodeById] = await Promise.all([
      base(TABLES.timesheets).find(recordId),
      staffingsByMemberCodeString(memberCode),
      getMemberCodeMap(),
    ]);
    const ts = toTimesheet(r, staffings);
    if (!ts.memberRecordId) return null;
    if (memberCodeById.get(ts.memberRecordId) !== memberCode) return null;
    return ts;
  } catch {
    return null;
  }
}

// Same as getTimesheetById, but also returns the eligible staffings the form
// needs so the page can render fully on the server with no client-side fetch.
export async function getTimesheetWithEligibleStaffings(
  recordId: string,
  memberCode: string,
  weekMondayIso: string | null,
): Promise<{ timesheet: TimesheetRecord; eligible: StaffingRecord[] } | null> {
  try {
    const [r, staffings, memberCodeById] = await Promise.all([
      base(TABLES.timesheets).find(recordId),
      staffingsByMemberCodeString(memberCode),
      getMemberCodeMap(),
    ]);
    const ts = toTimesheet(r, staffings);
    if (!ts.memberRecordId) return null;
    if (memberCodeById.get(ts.memberRecordId) !== memberCode) return null;
    const all = [...staffings.values()];
    const active = all.filter(
      (s) => s.status === null || s.status === "In Progress" || s.status === "Not Started",
    );
    const eligible = weekMondayIso
      ? active.filter((s) => weekOverlapsRangeBetween(weekMondayIso, s.startDate, s.endDate))
      : active;
    return { timesheet: ts, eligible };
  } catch {
    return null;
  }
}

function weekOverlapsRangeBetween(monday: string, start: string | null, end: string | null): boolean {
  // Friday = monday + 4 days. Use string compare on YYYY-MM-DD.
  const md = new Date(monday + "T00:00:00Z");
  md.setUTCDate(md.getUTCDate() + 4);
  const friday = md.toISOString().slice(0, 10);
  if (start && friday < start) return false;
  if (end && monday > end) return false;
  return true;
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

// Admin-side timesheet status edit. Allows transitions to any status the
// admin should be able to set, including the new Invoiced / Paid options.
// Member-driven transitions (Draft ↔ Submitted) still go through the
// member endpoints.
export async function adminUpdateTimesheetStatus(
  recordId: string,
  status: TimesheetStatus,
): Promise<void> {
  await base(TABLES.timesheets).update([
    {
      id: recordId,
      fields: { [FIELDS.timesheets.status]: status } as FieldSet,
    },
  ]);
}

// ---------------------------------------------------------------------------
// Admin: Project Staffings (full CRUD)
// ---------------------------------------------------------------------------

function staffingAdminFromRecord(
  r: AirtableRecord<FieldSet>,
  projectNames: Map<string, string>,
  memberCodeById?: Map<string, string>,
  daysUsedByStaffingId?: Map<string, number>,
): StaffingAdminRecord {
  const projectCode = str(r, FIELDS.projectStaffing.projectCode);
  const rate = numOrNull(r, FIELDS.projectStaffing.ratePerDay);
  const days = numOrNull(r, FIELDS.projectStaffing.daysAllocated);
  const fx = numOrNull(r, FIELDS.projectStaffing.fxToEur);
  const totalAmount = rate != null && days != null ? rate * days : null;
  const totalAmountEur = totalAmount != null && fx != null ? totalAmount * fx : null;
  const memberRecordIds = linkedIds(r, FIELDS.projectStaffing.memberCode);
  // The linked field returns raw record IDs in some Airtable configurations.
  // Resolve to actual member codes via memberCodeById when available.
  const memberCodes = memberCodeById
    ? memberRecordIds.map((id) => memberCodeById.get(id) ?? id)
    : linkedDisplay(r, FIELDS.projectStaffing.memberCode);
  return {
    id: r.id,
    staffingCode: str(r, FIELDS.projectStaffing.staffingCode),
    projectCode,
    projectName: projectNames.get(projectCode) ?? "",
    memberRecordIds,
    memberCodes,
    roleInProject: str(r, FIELDS.projectStaffing.roleInProject),
    projectRole: str(r, FIELDS.projectStaffing.projectRole) as ProjectRole | "",
    ratePerDay: rate,
    currency: str(r, FIELDS.projectStaffing.currency) as Currency | "",
    daysAllocated: days,
    daysUsed: daysUsedByStaffingId?.get(r.id) ?? 0,
    fxToEur: fx,
    totalAmount,
    totalAmountEur,
    sowReference: str(r, FIELDS.projectStaffing.sowReference),
    sowStatus: str(r, FIELDS.projectStaffing.sowStatus) as SowStatus | "",
    startDate: dateOrNull(r, FIELDS.projectStaffing.startDate),
    endDate: dateOrNull(r, FIELDS.projectStaffing.endDate),
    // Status is derived from the data; the stored field is no longer source-of-truth.
    status: deriveStaffingStatus(days, daysUsedByStaffingId?.get(r.id) ?? 0),
    notes: str(r, FIELDS.projectStaffing.notes),
  };
}

async function getDaysUsedByStaffingId(): Promise<Map<string, number>> {
  // Sum total hours per Project Staffing across all non-Deleted timesheets,
  // then convert to days at HOURS_PER_DAY = 8.
  const records = await base(TABLES.timesheets)
    .select({
      fields: [
        FIELDS.timesheets.projectStaffing,
        FIELDS.timesheets.status,
        FIELDS.timesheets.mondayHours,
        FIELDS.timesheets.tuesdayHours,
        FIELDS.timesheets.wednesdayHours,
        FIELDS.timesheets.thursdayHours,
        FIELDS.timesheets.fridayHours,
      ],
    })
    .all();
  const hoursByStaffingId = new Map<string, number>();
  for (const r of records) {
    const status = str(r, FIELDS.timesheets.status) as TimesheetStatus;
    if (status === "Deleted") continue;
    const staffingId = firstLinkedId(r, FIELDS.timesheets.projectStaffing);
    if (!staffingId) continue;
    const hours =
      num(r, FIELDS.timesheets.mondayHours) +
      num(r, FIELDS.timesheets.tuesdayHours) +
      num(r, FIELDS.timesheets.wednesdayHours) +
      num(r, FIELDS.timesheets.thursdayHours) +
      num(r, FIELDS.timesheets.fridayHours);
    hoursByStaffingId.set(staffingId, (hoursByStaffingId.get(staffingId) ?? 0) + hours);
  }
  const daysByStaffingId = new Map<string, number>();
  for (const [id, hours] of hoursByStaffingId) {
    daysByStaffingId.set(id, hours / HOURS_PER_DAY);
  }
  return daysByStaffingId;
}

async function getMemberCodeMap(): Promise<Map<string, string>> {
  const records = await base(TABLES.networkMembers)
    .select({ fields: [FIELDS.networkMembers.memberCode] })
    .all();
  return new Map(records.map((r) => [r.id, str(r, FIELDS.networkMembers.memberCode)]));
}

export async function listAllStaffings(): Promise<StaffingAdminRecord[]> {
  const [records, projectNames, memberCodeById, daysUsedByStaffingId] = await Promise.all([
    base(TABLES.projectStaffing).select().all(),
    getProjectNameMap(),
    getMemberCodeMap(),
    getDaysUsedByStaffingId(),
  ]);
  return records
    .map((r) => staffingAdminFromRecord(r, projectNames, memberCodeById, daysUsedByStaffingId))
    // Hide memberless rows from the admin listing. Our API enforces a
    // non-empty Member link at create/update, but Airtable's own UI lets a
    // user "+ Add row" without filling the link — and the auto-generated
    // Staffing Code formula then falls back to "{Project Code}_" which
    // visually looks like a project record sitting in the staffing table.
    // Surface real assignments only; orphans should be cleaned up in
    // Airtable, not displayed as ghost entries.
    .filter((s) => s.memberRecordIds.length > 0)
    .sort((a, b) => a.staffingCode.localeCompare(b.staffingCode));
}

export async function getStaffingById(recordId: string): Promise<StaffingAdminRecord | null> {
  try {
    const [r, projectNames, memberCodeById, daysUsedByStaffingId] = await Promise.all([
      base(TABLES.projectStaffing).find(recordId),
      getProjectNameMap(),
      getMemberCodeMap(),
      getDaysUsedByStaffingId(),
    ]);
    return staffingAdminFromRecord(r, projectNames, memberCodeById, daysUsedByStaffingId);
  } catch {
    return null;
  }
}

export type StaffingInput = {
  projectCode: string;
  memberRecordIds: string[];
  roleInProject: string;
  projectRole: ProjectRole | "";
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
    [FIELDS.projectStaffing.projectRole]: input.projectRole === "" ? null : input.projectRole,
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

// Hard invariant: every Project Staffing record must link to a Network
// Member. The Zod schema in the route handlers enforces this at the API
// boundary, but we re-check here so a future direct caller (a script, a
// migration helper, a new endpoint someone wires up) can't accidentally
// reintroduce the ghost-row bug from a different code path.
function assertHasMember(input: StaffingInput): void {
  if (!input.memberRecordIds || input.memberRecordIds.length === 0) {
    throw new Error("A staffing must be linked to a network member.");
  }
}

export async function createStaffing(input: StaffingInput): Promise<string> {
  assertHasMember(input);
  const [created] = await base(TABLES.projectStaffing).create([
    { fields: staffingFields(input) as FieldSet },
  ]);
  return created.id;
}

export async function updateStaffing(recordId: string, input: StaffingInput): Promise<void> {
  assertHasMember(input);
  await base(TABLES.projectStaffing).update([
    { id: recordId, fields: staffingFields(input) as FieldSet },
  ]);
}

export async function deleteStaffing(recordId: string): Promise<void> {
  await base(TABLES.projectStaffing).destroy([recordId]);
}

export async function updateStaffingStatus(
  recordId: string,
  status: StaffingStatus | "",
): Promise<void> {
  await base(TABLES.projectStaffing).update([
    {
      id: recordId,
      fields: {
        [FIELDS.projectStaffing.status]: status === "" ? null : status,
      } as FieldSet,
    },
  ]);
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

// ---------------------------------------------------------------------------
// Team timesheets (for project leaders)
// ---------------------------------------------------------------------------

export type LeaderProjectInfo = {
  projectCode: string;
  projectName: string;
  projectRecordId: string;
};

export type TeamTimesheetRecord = TimesheetRecord & {
  memberCode: string;
  memberName: string;
};

// Returns the list of projects where the member is recognised as a Project
// Leader. Two signals count, combined:
//   1. The project's "Project Leaders" linked field includes the member's
//      record ID (the new, project-level source of truth).
//   2. The member has a staffing on the project whose "Project Role" field is
//      "Project Lead" (legacy / per-staffing source of truth).
// The second signal is what older setups configured before the project-level
// field existed and we honour it so existing data keeps working.
export async function getLedProjects(
  memberRecordId: string,
  memberCode?: string,
): Promise<LeaderProjectInfo[]> {
  if (!memberRecordId) return [];

  const projectsPromise = base(TABLES.projects)
    .select({
      fields: [
        FIELDS.projects.projectCode,
        FIELDS.projects.projectName,
        FIELDS.projects.projectLeaders,
      ],
    })
    .all();

  // Only query staffings if we know the visible memberCode (linked-field
  // formulas compare against the primary string, not the record ID).
  const staffingsPromise =
    memberCode && memberCode.length > 0
      ? base(TABLES.projectStaffing)
          .select({
            filterByFormula: `AND(
              FIND("${escape(memberCode)}", ARRAYJOIN(ARRAYCOMPACT({${FIELDS.projectStaffing.memberCode}}))),
              OR(
                {${FIELDS.projectStaffing.projectRole}} = "Project Lead",
                {${FIELDS.projectStaffing.projectRole}} = "Engagement Lead"
              )
            )`,
            fields: [FIELDS.projectStaffing.projectCode, FIELDS.projectStaffing.memberCode],
          })
          .all()
      : Promise.resolve([] as AirtableRecord<FieldSet>[]);

  const [projectRecords, staffingRecords] = await Promise.all([
    projectsPromise,
    staffingsPromise,
  ]);

  // Build an index of every project we've seen, keyed by projectCode.
  const byCode = new Map<string, LeaderProjectInfo>();

  for (const r of projectRecords) {
    const code = str(r, FIELDS.projects.projectCode);
    if (!code) continue;
    byCode.set(code, {
      projectCode: code,
      projectName: str(r, FIELDS.projects.projectName),
      projectRecordId: r.id,
    });
  }

  const out: LeaderProjectInfo[] = [];
  const added = new Set<string>();

  for (const r of projectRecords) {
    const leaders = linkedIds(r, FIELDS.projects.projectLeaders);
    if (!leaders.includes(memberRecordId)) continue;
    const code = str(r, FIELDS.projects.projectCode);
    if (!code || added.has(code)) continue;
    added.add(code);
    const info = byCode.get(code);
    if (info) out.push(info);
  }

  for (const r of staffingRecords) {
    const code = str(r, FIELDS.projectStaffing.projectCode);
    if (!code || added.has(code)) continue;
    const info = byCode.get(code);
    if (!info) continue; // staffing references a project we didn't load (deleted?)
    added.add(code);
    out.push(info);
  }

  return out.sort((a, b) => a.projectCode.localeCompare(b.projectCode));
}

// ---------------------------------------------------------------------------
// Project summary (per-project view for a Project Lead)
// ---------------------------------------------------------------------------

export type ProjectTeamMember = {
  memberRecordId: string;
  memberCode: string;
  memberName: string;
  photoUrl: string | null;
  staffings: Array<{
    id: string;
    staffingCode: string;
    roleInProject: string;
    projectRole: ProjectRole | "";
    ratePerDay: number | null;
    currency: Currency | "";
    daysAllocated: number | null;
    fxToEur: number | null;
    startDate: string | null;
    endDate: string | null;
    status: StaffingStatus | "";
  }>;
  daysAllocatedTotal: number;
  hoursActualTotal: number;
  daysActualTotal: number; // hours / 8
  // Flat list of timesheets for this member on this project, newest first.
  timesheets: Array<TimesheetRecord & { staffingCode: string }>;
};

export type ProjectSummary = {
  project: ProjectRecord;
  members: ProjectTeamMember[];
  // Aggregate totals across the full team on this project.
  totals: {
    allocatedDays: number;
    actualHours: number;
    actualDays: number;
    submittedTimesheets: number;
    draftTimesheets: number;
  };
};

const HOURS_PER_DAY = 8;

// Build a complete "Project Summary" payload for a single project, scoped by
// a leader's access. Caller must verify the leader has access before invoking.
export async function getProjectSummaryByCode(projectCode: string): Promise<ProjectSummary | null> {
  const [projectRecords, stRecords, tsRecords, allMembers] = await Promise.all([
    base(TABLES.projects)
      .select({
        filterByFormula: `{${FIELDS.projects.projectCode}} = "${escape(projectCode)}"`,
        maxRecords: 1,
      })
      .firstPage(),
    base(TABLES.projectStaffing)
      .select({
        filterByFormula: `{${FIELDS.projectStaffing.projectCode}} = "${escape(projectCode)}"`,
      })
      .all(),
    base(TABLES.timesheets)
      .select({ sort: [{ field: FIELDS.timesheets.startDate, direction: "desc" }] })
      .all(),
    listAllMembers(),
  ]);
  if (projectRecords.length === 0) return null;
  const project = projectFromRecord(projectRecords[0]);

  const memberById = new Map(allMembers.map((m) => [m.id, m]));

  // Per-member accumulator of staffings + timesheets on this project.
  const memberIndex = new Map<string, ProjectTeamMember>();

  // Map staffingRecordId -> staffingCode (for timesheet join + display).
  const staffingCodeById = new Map<string, string>();

  for (const r of stRecords) {
    const staffingId = r.id;
    const staffingCode = str(r, FIELDS.projectStaffing.staffingCode);
    staffingCodeById.set(staffingId, staffingCode);
    const linkedMemberIds = linkedIds(r, FIELDS.projectStaffing.memberCode);
    const daysAllocated = numOrNull(r, FIELDS.projectStaffing.daysAllocated);
    const staffingRow = {
      id: staffingId,
      staffingCode,
      roleInProject: str(r, FIELDS.projectStaffing.roleInProject),
      projectRole: str(r, FIELDS.projectStaffing.projectRole) as ProjectRole | "",
      ratePerDay: numOrNull(r, FIELDS.projectStaffing.ratePerDay),
      currency: str(r, FIELDS.projectStaffing.currency) as Currency | "",
      daysAllocated,
      fxToEur: numOrNull(r, FIELDS.projectStaffing.fxToEur),
      startDate: dateOrNull(r, FIELDS.projectStaffing.startDate),
      endDate: dateOrNull(r, FIELDS.projectStaffing.endDate),
      status: (str(r, FIELDS.projectStaffing.status) as StaffingStatus) || "",
    };
    for (const mid of linkedMemberIds) {
      const m = memberById.get(mid);
      if (!memberIndex.has(mid)) {
        memberIndex.set(mid, {
          memberRecordId: mid,
          memberCode: m?.memberCode ?? mid,
          memberName: m?.fullName ?? "",
          photoUrl: m?.photo?.url ?? null,
          staffings: [],
          daysAllocatedTotal: 0,
          hoursActualTotal: 0,
          daysActualTotal: 0,
          timesheets: [],
        });
      }
      const acc = memberIndex.get(mid)!;
      acc.staffings.push(staffingRow);
      if (typeof daysAllocated === "number") acc.daysAllocatedTotal += daysAllocated;
    }
  }

  // Walk timesheets and attach those whose staffing belongs to this project.
  // We reuse toTimesheet with a minimal staffing map so the projectCode is set.
  const staffingMapForToTimesheet = new Map<string, StaffingRecord>();
  for (const r of stRecords) {
    staffingMapForToTimesheet.set(r.id, {
      id: r.id,
      staffingCode: str(r, FIELDS.projectStaffing.staffingCode),
      projectCode,
      projectName: project.projectName,
      startDate: dateOrNull(r, FIELDS.projectStaffing.startDate),
      endDate: dateOrNull(r, FIELDS.projectStaffing.endDate),
      status: (str(r, FIELDS.projectStaffing.status) as StaffingStatus) || null,
    });
  }

  let submittedTimesheets = 0;
  let draftTimesheets = 0;

  for (const r of tsRecords) {
    const staffingId = firstLinkedId(r, FIELDS.timesheets.projectStaffing);
    if (!staffingId || !staffingMapForToTimesheet.has(staffingId)) continue;
    const ts = toTimesheet(r, staffingMapForToTimesheet);
    const mid = ts.memberRecordId;
    if (!memberIndex.has(mid)) {
      const m = memberById.get(mid);
      memberIndex.set(mid, {
        memberRecordId: mid,
        memberCode: m?.memberCode ?? mid,
        memberName: m?.fullName ?? "",
        photoUrl: m?.photo?.url ?? null,
        staffings: [],
        daysAllocatedTotal: 0,
        hoursActualTotal: 0,
        daysActualTotal: 0,
        timesheets: [],
      });
    }
    const acc = memberIndex.get(mid)!;
    acc.timesheets.push({ ...ts, staffingCode: staffingCodeById.get(staffingId) ?? "" });
    if (ts.status !== "Deleted") {
      acc.hoursActualTotal += ts.totalHours;
      acc.daysActualTotal = acc.hoursActualTotal / HOURS_PER_DAY;
    }
    if (ts.status === "Submitted") submittedTimesheets += 1;
    else if (ts.status === "Draft") draftTimesheets += 1;
  }

  const members = [...memberIndex.values()].sort((a, b) => {
    // Engagement Leads first, then Project Leaders, then everyone else.
    const aRank = leadRank(a);
    const bRank = leadRank(b);
    if (aRank !== bRank) return aRank - bRank;
    return (
      a.memberName.localeCompare(b.memberName) || a.memberCode.localeCompare(b.memberCode)
    );
  });

  const totals = {
    allocatedDays: members.reduce((s, m) => s + m.daysAllocatedTotal, 0),
    actualHours: members.reduce((s, m) => s + m.hoursActualTotal, 0),
    actualDays: members.reduce((s, m) => s + m.daysActualTotal, 0),
    submittedTimesheets,
    draftTimesheets,
  };

  return { project, members, totals };
}

// ---------------------------------------------------------------------------
// "My projects" — every project the signed-in member is working on
// ---------------------------------------------------------------------------

export type MyProjectStaffing = {
  id: string;
  staffingCode: string;
  roleInProject: string;
  projectRole: ProjectRole | "";
  daysAllocated: number | null;
  startDate: string | null;
  endDate: string | null;
  status: StaffingStatus | "";
};

export type MyProjectTeamMember = {
  memberRecordId: string;
  memberCode: string;
  fullName: string;
  photoUrl: string | null;
  isLeader: boolean;
  // Strongest role across this member's staffings on the project.
  // "Engagement Lead" > "Project Lead" > "Consultant" > "".
  role: ProjectRole | "";
};

export type MyProjectRecord = {
  projectCode: string;
  projectName: string;
  clientCodes: string[];
  clientNames: string[];
  status: ProjectStatus | "";
  startDate: string | null;
  endDate: string | null;
  isLeader: boolean;
  staffings: MyProjectStaffing[];
  team: MyProjectTeamMember[];
  daysAllocatedTotal: number;
  hoursActualTotal: number;
  daysActualTotal: number;
  submittedTimesheets: number;
  draftTimesheets: number;
};

// Returns one record per project that the member has at least one staffing on.
// Aggregates allocated days from the staffings + actual hours/days from the
// member's timesheets on those staffings. Marks isLeader=true if either the
// project's "Project Leaders" field includes the member or any of the
// member's staffings has Project Role = "Project Lead".
export async function listMyProjects(
  memberRecordId: string,
  memberCode: string,
): Promise<MyProjectRecord[]> {
  if (!memberCode) return [];

  const [staffingRecords, allProjects, allClients, tsRecords] = await Promise.all([
    base(TABLES.projectStaffing)
      .select({
        filterByFormula: `FIND("${escape(memberCode)}", ARRAYJOIN(ARRAYCOMPACT({${FIELDS.projectStaffing.memberCode}})))`,
      })
      .all(),
    listProjects(),
    listClients(),
    base(TABLES.timesheets)
      .select({
        filterByFormula: `FIND("${escape(memberCode)}", ARRAYJOIN({${FIELDS.timesheets.memberCode}}))`,
        sort: [{ field: FIELDS.timesheets.startDate, direction: "desc" }],
      })
      .all(),
  ]);

  const projectByCode = new Map(allProjects.map((p) => [p.projectCode, p]));
  // Index clients by record ID so we can resolve linked fields that return raw IDs.
  const clientNameById = new Map(allClients.map((c) => [c.id, c.clientName]));
  const clientCodeById = new Map(allClients.map((c) => [c.id, c.clientCode]));

  // Map staffingRecordId -> projectCode for timesheet attribution.
  const projectByStaffingId = new Map<string, string>();

  const out = new Map<string, MyProjectRecord>();

  for (const r of staffingRecords) {
    const code = str(r, FIELDS.projectStaffing.projectCode);
    if (!code) continue;
    projectByStaffingId.set(r.id, code);

    if (!out.has(code)) {
      const proj = projectByCode.get(code);
      const clientRecIds = proj?.clientRecordIds ?? [];
      out.set(code, {
        projectCode: code,
        projectName: proj?.projectName ?? "",
        clientCodes: clientRecIds.map((id) => clientCodeById.get(id) ?? id),
        clientNames: clientRecIds.map((id) => clientNameById.get(id) ?? id),
        status: proj?.status ?? "",
        startDate: proj?.startDate ?? null,
        endDate: proj?.endDate ?? null,
        isLeader: proj?.projectLeaderRecordIds.includes(memberRecordId) ?? false,
        staffings: [],
        team: [],
        daysAllocatedTotal: 0,
        hoursActualTotal: 0,
        daysActualTotal: 0,
        submittedTimesheets: 0,
        draftTimesheets: 0,
      });
    }
    const acc = out.get(code)!;
    const daysAllocated = numOrNull(r, FIELDS.projectStaffing.daysAllocated);
    const projectRole = str(r, FIELDS.projectStaffing.projectRole) as ProjectRole | "";
    if (projectRole === "Project Lead" || projectRole === "Engagement Lead") {
      acc.isLeader = true;
    }
    acc.staffings.push({
      id: r.id,
      staffingCode: str(r, FIELDS.projectStaffing.staffingCode),
      roleInProject: str(r, FIELDS.projectStaffing.roleInProject),
      projectRole,
      daysAllocated,
      startDate: dateOrNull(r, FIELDS.projectStaffing.startDate),
      endDate: dateOrNull(r, FIELDS.projectStaffing.endDate),
      status: (str(r, FIELDS.projectStaffing.status) as StaffingStatus) || "",
    });
    if (typeof daysAllocated === "number") acc.daysAllocatedTotal += daysAllocated;
  }

  for (const t of tsRecords) {
    const staffingId = firstLinkedId(t, FIELDS.timesheets.projectStaffing);
    const code = projectByStaffingId.get(staffingId);
    if (!code) continue;
    const acc = out.get(code);
    if (!acc) continue;
    const status = (str(t, FIELDS.timesheets.status) as TimesheetStatus) || "Draft";
    if (status === "Submitted") acc.submittedTimesheets += 1;
    else if (status === "Draft") acc.draftTimesheets += 1;
    if (status === "Deleted") continue;
    const hours =
      num(t, FIELDS.timesheets.mondayHours) +
      num(t, FIELDS.timesheets.tuesdayHours) +
      num(t, FIELDS.timesheets.wednesdayHours) +
      num(t, FIELDS.timesheets.thursdayHours) +
      num(t, FIELDS.timesheets.fridayHours);
    acc.hoursActualTotal += hours;
    acc.daysActualTotal = acc.hoursActualTotal / HOURS_PER_DAY;
  }

  // Resolve teammates for each project so the UI can render avatar bubbles.
  const projectCodesList = [...out.keys()];
  if (projectCodesList.length > 0) {
    const formula = `OR(${projectCodesList
      .map((c) => `{${FIELDS.projectStaffing.projectCode}} = "${escape(c)}"`)
      .join(",")})`;
    const [allStaffingsForProjects, allMemberRecords] = await Promise.all([
      base(TABLES.projectStaffing).select({ filterByFormula: formula }).all(),
      base(TABLES.networkMembers)
        .select({
          fields: [
            FIELDS.networkMembers.memberCode,
            FIELDS.networkMembers.fullName,
            FIELDS.networkMembers.photo,
          ],
        })
        .all(),
    ]);
    const memberById = new Map(
      allMemberRecords.map((r) => [
        r.id,
        {
          id: r.id,
          memberCode: str(r, FIELDS.networkMembers.memberCode),
          fullName: str(r, FIELDS.networkMembers.fullName),
          photoUrl: firstAttachment(r, FIELDS.networkMembers.photo)?.url ?? null,
        },
      ]),
    );

    const ROLE_RANK: Record<ProjectRole | "", number> = {
      "Engagement Lead": 0,
      "Project Lead": 1,
      "Consultant": 2,
      "": 3,
    };
    const upgradeRole = (current: ProjectRole | "", candidate: ProjectRole | ""): ProjectRole | "" =>
      ROLE_RANK[candidate] < ROLE_RANK[current] ? candidate : current;

    for (const s of allStaffingsForProjects) {
      const code = str(s, FIELDS.projectStaffing.projectCode);
      const acc = out.get(code);
      if (!acc) continue;
      const memberIds = linkedIds(s, FIELDS.projectStaffing.memberCode);
      const projectRole = str(s, FIELDS.projectStaffing.projectRole) as ProjectRole | "";
      for (const mid of memberIds) {
        const m = memberById.get(mid);
        if (!m) continue;
        let existing = acc.team.find((t) => t.memberRecordId === mid);
        if (!existing) {
          existing = {
            memberRecordId: mid,
            memberCode: m.memberCode,
            fullName: m.fullName,
            photoUrl: m.photoUrl,
            isLeader: false,
            role: "",
          };
          acc.team.push(existing);
        }
        existing.role = upgradeRole(existing.role, projectRole);
        if (projectRole === "Project Lead" || projectRole === "Engagement Lead") {
          existing.isLeader = true;
        }
      }
    }

    // Also flag leaders from the project's "Project Leaders" field.
    for (const [code, acc] of out) {
      const proj = projectByCode.get(code);
      if (!proj) continue;
      for (const lid of proj.projectLeaderRecordIds) {
        const m = memberById.get(lid);
        if (!m) continue;
        const existing = acc.team.find((t) => t.memberRecordId === lid);
        if (existing) {
          existing.isLeader = true;
          existing.role = upgradeRole(existing.role, "Project Lead");
        } else {
          acc.team.push({
            memberRecordId: lid,
            memberCode: m.memberCode,
            fullName: m.fullName,
            photoUrl: m.photoUrl,
            isLeader: true,
            role: "Project Lead",
          });
        }
      }
      // Sort: Engagement Lead → Project Lead → Consultant → others, then by name.
      acc.team.sort((a, b) => {
        const ra = ROLE_RANK[a.role];
        const rb = ROLE_RANK[b.role];
        if (ra !== rb) return ra - rb;
        return (a.fullName || a.memberCode).localeCompare(b.fullName || b.memberCode);
      });
    }
  }

  return [...out.values()].sort((a, b) => a.projectCode.localeCompare(b.projectCode));
}


// ---------------------------------------------------------------------------
// Tasks — lightweight tracker. A task is either personal (no Project link) or
// attached to a project (visible to anyone staffed on it). Assignees + the
// creator can always see + edit it.
// ---------------------------------------------------------------------------

export type TaskStatus = "To do" | "In Progress" | "Done" | "Cancelled";
export const TASK_STATUSES: TaskStatus[] = ["To do", "In Progress", "Done", "Cancelled"];

export type TaskPriority = "Low" | "Medium" | "High" | "Urgent";
export const TASK_PRIORITIES: TaskPriority[] = ["Low", "Medium", "High", "Urgent"];

export type TaskVisibility = "Personal" | "Shared";
export const TASK_VISIBILITIES: TaskVisibility[] = ["Personal", "Shared"];

export type TaskRecord = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus | "";
  priority: TaskPriority | "";
  dueDate: string | null;
  effortHours: number | null;
  projectRecordId: string;
  projectCode: string;
  projectName: string;
  assigneeRecordIds: string[];
  assigneeCodes: string[];
  assigneeNames: string[];
  createdByRecordId: string;
  createdByCode: string;
  createdByName: string;
  createdAt: string | null;
  updatedAt: string | null;
  // Personal = visible only to the creator (and assignees, if any), even when
  // linked to a Project. Shared = visible to everyone staffed on the linked
  // Project. Stored on the Tasks table as a single-select.
  visibility: TaskVisibility;
};

function taskFromRecord(
  r: AirtableRecord<FieldSet>,
  memberById: Map<string, { code: string; name: string }>,
  projectById: Map<string, { code: string; name: string }>,
): TaskRecord {
  const assigneeIds = linkedIds(r, FIELDS.tasks.assignees);
  const createdByIds = linkedIds(r, FIELDS.tasks.createdBy);
  const projectIds = linkedIds(r, FIELDS.tasks.project);
  const p = projectIds[0] ? projectById.get(projectIds[0]) : undefined;
  const creator = createdByIds[0] ? memberById.get(createdByIds[0]) : undefined;
  // Default older rows without an explicit Visibility to "Shared" when a
  // project is set (matches the legacy behavior) and "Personal" otherwise.
  const visRaw = str(r, FIELDS.tasks.visibility);
  const visibility: TaskVisibility =
    visRaw === "Personal" || visRaw === "Shared"
      ? visRaw
      : projectIds[0]
        ? "Shared"
        : "Personal";
  return {
    id: r.id,
    title: str(r, FIELDS.tasks.title),
    description: str(r, FIELDS.tasks.description),
    status: (str(r, FIELDS.tasks.status) as TaskStatus) || "",
    priority: (str(r, FIELDS.tasks.priority) as TaskPriority) || "",
    dueDate: dateOrNull(r, FIELDS.tasks.dueDate),
    effortHours: numOrNull(r, FIELDS.tasks.effortHours),
    projectRecordId: projectIds[0] ?? "",
    projectCode: p?.code ?? "",
    projectName: p?.name ?? "",
    assigneeRecordIds: assigneeIds,
    assigneeCodes: assigneeIds.map((id) => memberById.get(id)?.code ?? ""),
    assigneeNames: assigneeIds.map((id) => memberById.get(id)?.name ?? ""),
    createdByRecordId: createdByIds[0] ?? "",
    createdByCode: creator?.code ?? "",
    createdByName: creator?.name ?? "",
    createdAt: (r.get(FIELDS.tasks.createdAt) as string | undefined) ?? null,
    updatedAt: (r.get(FIELDS.tasks.updatedAt) as string | undefined) ?? null,
    visibility,
  };
}

// Returns every task the caller is allowed to see:
//   - they created it, OR they are assigned, OR
//   - the task is linked to a project they are staffed on, OR
//   - the caller is an admin (admins use listAllTasks instead).
export async function listTasksVisibleTo(
  memberRecordId: string,
  memberCode: string,
): Promise<TaskRecord[]> {
  const [records, projectById, memberById, myStaffings] = await Promise.all([
    base(TABLES.tasks)
      .select({ sort: [{ field: FIELDS.tasks.createdAt, direction: "desc" }] })
      .all(),
    getProjectIndex(),
    getMemberIndex(),
    getStaffingsForMember(memberCode),
  ]);
  const myProjectCodes = new Set(myStaffings.map((s) => s.projectCode));
  return records
    .map((r) => taskFromRecord(r, memberById, projectById))
    .filter((t) => {
      // Personal tasks are always private to creator (and explicit assignees),
      // even when linked to a project — being staffed on the project doesn't
      // grant visibility.
      if (t.visibility === "Personal") {
        if (t.createdByRecordId === memberRecordId) return true;
        if (t.assigneeRecordIds.includes(memberRecordId)) return true;
        return false;
      }
      // Shared tasks: creator, explicit assignees, and anyone staffed on the
      // linked project can see them.
      if (t.createdByRecordId === memberRecordId) return true;
      if (t.assigneeRecordIds.includes(memberRecordId)) return true;
      if (t.projectCode && myProjectCodes.has(t.projectCode)) return true;
      return false;
    });
}

export async function listAllTasks(): Promise<TaskRecord[]> {
  const [records, projectById, memberById] = await Promise.all([
    base(TABLES.tasks)
      .select({ sort: [{ field: FIELDS.tasks.createdAt, direction: "desc" }] })
      .all(),
    getProjectIndex(),
    getMemberIndex(),
  ]);
  return records.map((r) => taskFromRecord(r, memberById, projectById));
}

export async function getTaskById(recordId: string): Promise<TaskRecord | null> {
  try {
    const [r, projectById, memberById] = await Promise.all([
      base(TABLES.tasks).find(recordId),
      getProjectIndex(),
      getMemberIndex(),
    ]);
    return taskFromRecord(r, memberById, projectById);
  } catch {
    return null;
  }
}

export type TaskCreateInput = {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority | "";
  dueDate: string | null;
  effortHours: number | null;
  projectRecordId: string;
  assigneeRecordIds: string[];
  createdByRecordId: string;
  visibility: TaskVisibility;
};

export async function createTask(input: TaskCreateInput): Promise<string> {
  const now = new Date().toISOString();
  const fields: Record<string, unknown> = {
    [FIELDS.tasks.title]: input.title,
    [FIELDS.tasks.description]: input.description,
    [FIELDS.tasks.status]: input.status,
    [FIELDS.tasks.priority]: input.priority || null,
    [FIELDS.tasks.dueDate]: input.dueDate,
    [FIELDS.tasks.effortHours]: input.effortHours,
    [FIELDS.tasks.project]: input.projectRecordId ? [input.projectRecordId] : [],
    [FIELDS.tasks.assignees]: input.assigneeRecordIds,
    [FIELDS.tasks.createdBy]: [input.createdByRecordId],
    [FIELDS.tasks.createdAt]: now,
    [FIELDS.tasks.updatedAt]: now,
    [FIELDS.tasks.visibility]: input.visibility,
  };
  const [created] = await base(TABLES.tasks).create([{ fields: fields as FieldSet }]);
  return created.id;
}

export type TaskUpdateInput = Partial<{
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority | "";
  dueDate: string | null;
  effortHours: number | null;
  projectRecordId: string;
  assigneeRecordIds: string[];
  visibility: TaskVisibility;
}>;

export async function updateTask(recordId: string, input: TaskUpdateInput): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (input.title !== undefined) fields[FIELDS.tasks.title] = input.title;
  if (input.description !== undefined) fields[FIELDS.tasks.description] = input.description;
  if (input.status !== undefined) fields[FIELDS.tasks.status] = input.status;
  if (input.priority !== undefined) {
    fields[FIELDS.tasks.priority] = input.priority || null;
  }
  if (input.dueDate !== undefined) fields[FIELDS.tasks.dueDate] = input.dueDate;
  if (input.effortHours !== undefined) fields[FIELDS.tasks.effortHours] = input.effortHours;
  if (input.projectRecordId !== undefined) {
    fields[FIELDS.tasks.project] = input.projectRecordId ? [input.projectRecordId] : [];
  }
  if (input.assigneeRecordIds !== undefined) {
    fields[FIELDS.tasks.assignees] = input.assigneeRecordIds;
  }
  if (input.visibility !== undefined) fields[FIELDS.tasks.visibility] = input.visibility;
  fields[FIELDS.tasks.updatedAt] = new Date().toISOString();
  await base(TABLES.tasks).update([{ id: recordId, fields: fields as FieldSet }]);
}

export async function deleteTask(recordId: string): Promise<void> {
  await base(TABLES.tasks).destroy([recordId]);
}

// ---------------------------------------------------------------------------
// Admin: Contracts
// ---------------------------------------------------------------------------

// Contracts cover NDAs, MSAs, SoWs, service agreements, etc. The data
// shape is messy by design: dates are stored as singleSelect or
// multilineText (not date fields) because admins enter free-form values
// like "MSA: Indefinite – SoW: 15/11 → 15/12/2025". We surface every
// field as a plain string and let the admin reason about it visually
// rather than try to parse semantics into a tight schema we'd have to
// maintain alongside Airtable.
export type ContractSide = "Client" | "Network Member" | "Partner" | "Other";
export const CONTRACT_SIDES: ContractSide[] = [
  "Client",
  "Network Member",
  "Partner",
  "Other",
];

// Canonical type set the admin should pick from. Historical rows carry
// any number of legacy values ("MSA + SoW", "Customer Facing SoW",
// "Service Contract", ...) — those keep rendering as-is but new edits
// snap to this short list.
export type ContractType = "NDA" | "MSA" | "SOW" | "Other";
export const CONTRACT_TYPES: ContractType[] = ["NDA", "MSA", "SOW", "Other"];

// Canonical contract Status (renamed from "Stage" in the UI). Simplified
// from the previous 10-value list — every legacy choice was migrated to
// one of these five.
export type ContractStatus =
  | "Draft"
  | "Under Negotiation"
  | "Pending Signature"
  | "Signed"
  | "Terminated";
export const CONTRACT_STATUSES: ContractStatus[] = [
  "Draft",
  "Under Negotiation",
  "Pending Signature",
  "Signed",
  "Terminated",
];

// Computed validity. Stored Validity in Airtable is ignored: admins set
// Stage and Expiry Date, the portal derives the rest. Four states:
//   N/A             — not signed yet
//   Valid           — signed AND expiry date is on or after today
//   Expired         — signed AND expiry date is in the past
//   Expiry Missing  — signed but no parseable expiry on file (warning state)
// `refresh regularly / daily` is satisfied implicitly because every
// server-side read recomputes from the current date.
export type ComputedValidity = "Valid" | "Expired" | "N/A" | "Expiry Missing";

export function computeValidity(stage: string, expiryDate: string): ComputedValidity {
  const s = stage.trim().toLowerCase();
  if (s !== "signed") return "N/A";
  const iso = parseLooseDate(expiryDate);
  if (!iso) return "Expiry Missing";
  const today = new Date().toISOString().slice(0, 10);
  return iso < today ? "Expired" : "Valid";
}

// Best-effort parse of the messy date strings Airtable carries (e.g.
// "15/12/2025", "1/1/24", "Late May 2026"). Returns ISO yyyy-mm-dd or
// null when the string isn't a date.
function parseLooseDate(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!m) return null;
  let [, d, mo, y] = m;
  if (y.length === 2) y = String(2000 + Number(y));
  const dd = String(Number(d)).padStart(2, "0");
  const mm = String(Number(mo)).padStart(2, "0");
  if (Number(dd) < 1 || Number(dd) > 31) return null;
  if (Number(mm) < 1 || Number(mm) > 12) return null;
  return `${y}-${mm}-${dd}`;
}

// One signatory: name + role + company + signing date. The two parties
// on a contract usually sign on different days, so each side carries
// its own date.
export type ContractSignatory = {
  name: string;
  role: string;
  company: string;
  date: string;
};

export type ContractRecord = {
  id: string;
  // Identity
  side: ContractSide | "";
  contractType: string;
  otherDescription: string;
  clientRecordIds: string[];
  clientCodes: string[];
  clientNames: string[];
  projectRecordIds: string[];
  projectCodes: string[];
  projectCode: string; // legacy free-form Project Code (multilineText)
  memberRecordIds: string[];
  memberCodes: string[];
  // Signatories
  signatory1: ContractSignatory;
  signatory2: ContractSignatory;
  // Lifecycle
  signatureDate: string;
  expiryDate: string;
  stage: string;
  validity: ComputedValidity;
  // Summary + attachment + notes
  keyTerms: string;
  comment: string;
  pdf: AttachmentRef | null;
};

type LookupMaps = {
  memberCodeById: Map<string, string>;
  clientById: Map<string, { code: string; name: string }>;
  projectById: Map<string, { code: string; name: string }>;
};

function contractFromRecord(
  r: AirtableRecord<FieldSet>,
  maps: LookupMaps,
): ContractRecord {
  const memberRecordIds = linkedIds(r, FIELDS.contracts.memberCode);
  const clientRecordIds = linkedIds(r, FIELDS.contracts.client);
  const projectRecordIds = linkedIds(r, FIELDS.contracts.project);
  const stage = str(r, FIELDS.contracts.stage);
  const expiryDate = str(r, FIELDS.contracts.expiryDate);
  return {
    id: r.id,
    // Identity
    side: (str(r, FIELDS.contracts.side) as ContractSide) || "",
    contractType: str(r, FIELDS.contracts.contractType),
    otherDescription: str(r, FIELDS.contracts.otherDescription),
    clientRecordIds,
    clientCodes: clientRecordIds.map((id) => maps.clientById.get(id)?.code ?? id),
    clientNames: clientRecordIds.map((id) => maps.clientById.get(id)?.name ?? ""),
    projectRecordIds,
    projectCodes: projectRecordIds.map((id) => maps.projectById.get(id)?.code ?? id),
    projectCode: str(r, FIELDS.contracts.projectCode),
    memberRecordIds,
    memberCodes: memberRecordIds.map((id) => maps.memberCodeById.get(id) ?? id),
    // Signatories
    signatory1: {
      name: str(r, FIELDS.contracts.signatory1Name),
      role: str(r, FIELDS.contracts.signatory1Role),
      company: str(r, FIELDS.contracts.signatory1Company),
      date: str(r, FIELDS.contracts.signatory1Date),
    },
    signatory2: {
      name: str(r, FIELDS.contracts.signatory2Name),
      role: str(r, FIELDS.contracts.signatory2Role),
      company: str(r, FIELDS.contracts.signatory2Company),
      date: str(r, FIELDS.contracts.signatory2Date),
    },
    // Lifecycle. Validity is derived from Status + Expiry Date so it's
    // always fresh — admins don't have to chase stale "Valid" labels
    // when an MSA quietly rolls past its expiry.
    signatureDate: str(r, FIELDS.contracts.signatureDate),
    expiryDate,
    stage,
    validity: computeValidity(stage, expiryDate),
    // Summary + attachment + notes
    keyTerms: str(r, FIELDS.contracts.keyTerms),
    comment: str(r, FIELDS.contracts.comment),
    pdf: firstAttachment(r, FIELDS.contracts.pdf),
  };
}

async function getClientIndex(): Promise<Map<string, { code: string; name: string }>> {
  const records = await base(TABLES.clients)
    .select({ fields: [FIELDS.clients.clientCode, FIELDS.clients.clientName] })
    .all();
  return new Map(
    records.map((r) => [
      r.id,
      {
        code: str(r, FIELDS.clients.clientCode),
        name: str(r, FIELDS.clients.clientName),
      },
    ]),
  );
}

async function buildLookupMaps(): Promise<LookupMaps> {
  const [memberCodeById, clientById, projectById] = await Promise.all([
    getMemberCodeMap(),
    getClientIndex(),
    getProjectIndex(),
  ]);
  return { memberCodeById, clientById, projectById };
}

export async function listAllContracts(): Promise<ContractRecord[]> {
  const [records, maps] = await Promise.all([
    base(TABLES.contracts).select().all(),
    buildLookupMaps(),
  ]);
  return records
    .map((r) => contractFromRecord(r, maps))
    // Most-recent signature first when the dd/mm/yyyy parse succeeds;
    // unparseable rows sink to the bottom so admins see the freshest
    // contracts as soon as the page opens.
    .sort((a, b) => {
      const ts = (s: string) => {
        const m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
        if (!m) return 0;
        const [, d, mo, y] = m;
        const year = y.length === 2 ? 2000 + Number(y) : Number(y);
        return new Date(Date.UTC(year, Number(mo) - 1, Number(d))).getTime();
      };
      return ts(b.signatureDate) - ts(a.signatureDate);
    });
}

export async function getContractById(recordId: string): Promise<ContractRecord | null> {
  try {
    const [r, maps] = await Promise.all([
      base(TABLES.contracts).find(recordId),
      buildLookupMaps(),
    ]);
    return contractFromRecord(r, maps);
  } catch {
    return null;
  }
}

// Partial update for the admin-editable contract fields. Every field is
// individually optional — only the keys explicitly passed get written,
// so editing one field doesn't accidentally clear siblings. typecast=true
// lets the Airtable singleSelect choices auto-grow when an admin types a
// brand-new value (matches how the "Under Review" payment status was
// bootstrapped).
export type ContractEditableFields = {
  // Identity
  side?: ContractSide | "";
  contractType?: string;
  otherDescription?: string;
  clientRecordIds?: string[];
  projectRecordIds?: string[];
  projectCode?: string;
  memberRecordIds?: string[];
  // Signatories
  signatory1Name?: string;
  signatory1Role?: string;
  signatory1Company?: string;
  signatory1Date?: string;
  signatory2Name?: string;
  signatory2Role?: string;
  signatory2Company?: string;
  signatory2Date?: string;
  // Lifecycle
  signatureDate?: string;
  expiryDate?: string;
  stage?: string;
  // Summary + notes
  keyTerms?: string;
  comment?: string;
};

export async function updateContractFields(
  recordId: string,
  fields: ContractEditableFields,
): Promise<void> {
  const updates: Record<string, unknown> = {};
  const setText = (key: keyof typeof FIELDS.contracts, value: string | undefined) => {
    if (value === undefined) return;
    updates[FIELDS.contracts[key]] = value || null;
  };
  // Identity
  setText("side", fields.side);
  setText("contractType", fields.contractType);
  setText("otherDescription", fields.otherDescription);
  setText("projectCode", fields.projectCode);
  // Signatories
  setText("signatory1Name", fields.signatory1Name);
  setText("signatory1Role", fields.signatory1Role);
  setText("signatory1Company", fields.signatory1Company);
  setText("signatory1Date", fields.signatory1Date);
  setText("signatory2Name", fields.signatory2Name);
  setText("signatory2Role", fields.signatory2Role);
  setText("signatory2Company", fields.signatory2Company);
  setText("signatory2Date", fields.signatory2Date);
  // Lifecycle
  setText("signatureDate", fields.signatureDate);
  setText("expiryDate", fields.expiryDate);
  setText("stage", fields.stage);
  // Summary + notes
  setText("keyTerms", fields.keyTerms);
  setText("comment", fields.comment);
  // Linked records — null arrays should clear the link.
  if (fields.memberRecordIds !== undefined) {
    updates[FIELDS.contracts.memberCode] = fields.memberRecordIds;
  }
  if (fields.clientRecordIds !== undefined) {
    updates[FIELDS.contracts.client] = fields.clientRecordIds;
  }
  if (fields.projectRecordIds !== undefined) {
    updates[FIELDS.contracts.project] = fields.projectRecordIds;
  }
  if (Object.keys(updates).length === 0) return;
  await base(TABLES.contracts).update(
    [{ id: recordId, fields: updates as FieldSet }],
    { typecast: true },
  );
}

// Create a new Contracts row with the supplied fields and return its
// record id (plus the freshly-read ContractRecord so the client can
// open the edit modal without a second round-trip). Mirrors
// updateContractFields' field handling — every key is optional, so the
// caller can either create a fully blank shell or pre-populate the
// fields extracted from an uploaded PDF.
export async function createContract(
  fields: ContractEditableFields,
): Promise<ContractRecord> {
  const updates: Record<string, unknown> = {};
  const setText = (key: keyof typeof FIELDS.contracts, value: string | undefined) => {
    if (value === undefined || value === "") return;
    updates[FIELDS.contracts[key]] = value;
  };
  setText("side", fields.side);
  setText("contractType", fields.contractType);
  setText("otherDescription", fields.otherDescription);
  setText("projectCode", fields.projectCode);
  setText("signatory1Name", fields.signatory1Name);
  setText("signatory1Role", fields.signatory1Role);
  setText("signatory1Company", fields.signatory1Company);
  setText("signatory1Date", fields.signatory1Date);
  setText("signatory2Name", fields.signatory2Name);
  setText("signatory2Role", fields.signatory2Role);
  setText("signatory2Company", fields.signatory2Company);
  setText("signatory2Date", fields.signatory2Date);
  setText("signatureDate", fields.signatureDate);
  setText("expiryDate", fields.expiryDate);
  setText("stage", fields.stage);
  setText("keyTerms", fields.keyTerms);
  setText("comment", fields.comment);
  if (fields.memberRecordIds && fields.memberRecordIds.length > 0) {
    updates[FIELDS.contracts.memberCode] = fields.memberRecordIds;
  }
  if (fields.clientRecordIds && fields.clientRecordIds.length > 0) {
    updates[FIELDS.contracts.client] = fields.clientRecordIds;
  }
  if (fields.projectRecordIds && fields.projectRecordIds.length > 0) {
    updates[FIELDS.contracts.project] = fields.projectRecordIds;
  }
  const [created] = await base(TABLES.contracts).create(
    [{ fields: updates as FieldSet }],
    { typecast: true },
  );
  const maps = await buildLookupMaps();
  return contractFromRecord(created, maps);
}

// Permanently delete a contract row.
export async function deleteContract(recordId: string): Promise<void> {
  await base(TABLES.contracts).destroy([recordId]);
}

// Attach a PDF to the Contracts row via Airtable's content endpoint
// (same path as attachInvoicePdf). Airtable replaces the existing
// attachment if any, which matches the admin's mental model of "the
// signed PDF" — a single up-to-date file per contract.
export async function attachContractPdf(
  recordId: string,
  filename: string,
  base64: string,
): Promise<void> {
  const url = `https://content.airtable.com/v0/${env.airtableBaseId}/${recordId}/${encodeURIComponent(FIELDS.contracts.pdf)}/uploadAttachment`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.airtablePat}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ contentType: "application/pdf", filename, file: base64 }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Airtable upload failed (${res.status}): ${text}`);
  }
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export type ChatKind = "Direct" | "Group";

export type ChatConversation = {
  id: string;
  title: string;
  kind: ChatKind;
  memberRecordIds: string[];
  createdByRecordId: string;
  createdAt: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string;
};

export type ChatMessage = {
  id: string;
  body: string;
  conversationId: string;
  senderRecordId: string;
  senderName: string;
  senderPhotoUrl: string | null;
  sentAt: string | null;
};

function conversationFromRecord(r: AirtableRecord<FieldSet>): ChatConversation {
  return {
    id: r.id,
    title: str(r, FIELDS.chatConversations.title),
    kind: (str(r, FIELDS.chatConversations.kind) as ChatKind) || "Direct",
    memberRecordIds: linkedIds(r, FIELDS.chatConversations.members),
    createdByRecordId: linkedIds(r, FIELDS.chatConversations.createdBy)[0] ?? "",
    createdAt: (r.get(FIELDS.chatConversations.createdAt) as string | undefined) ?? null,
    lastMessageAt: (r.get(FIELDS.chatConversations.lastMessageAt) as string | undefined) ?? null,
    lastMessagePreview: str(r, FIELDS.chatConversations.lastMessagePreview),
  };
}

// Lists conversations the caller is a participant of, sorted most-recently-
// active first. Members are stored as linked-record IDs; we filter using a
// filterByFormula that checks the linked Member Code primary field via
// ARRAYJOIN — the cheapest reliable way to filter linked records.
export async function listConversationsFor(
  memberRecordId: string,
  memberCode: string,
): Promise<ChatConversation[]> {
  // Empty code would degenerate the filterByFormula into matching every
  // row. Bail out immediately.
  if (!memberCode) return [];
  const safeCode = escape(memberCode);
  const records = await base(TABLES.chatConversations)
    .select({
      // Match conversations where the caller's member code shows up in the
      // ARRAY of linked Member Codes. The "," buffer guards against false
      // positives on codes that share a prefix.
      filterByFormula: `FIND("," & "${safeCode}" & ",", "," & ARRAYJOIN({${FIELDS.chatConversations.members}}, ",") & ",") > 0`,
      // Sort by Last Message At first; brand-new conversations with no
      // messages yet fall back to Created At so they surface near the top
      // of the list instead of sinking until the first message lands.
      sort: [
        { field: FIELDS.chatConversations.lastMessageAt, direction: "desc" },
        { field: FIELDS.chatConversations.createdAt, direction: "desc" },
      ],
    })
    .all();
  // Belt-and-braces: the filterByFormula above is only a coarse pre-filter;
  // the linked-record membership check is authoritative.
  return records
    .map(conversationFromRecord)
    .filter((c) => c.memberRecordIds.includes(memberRecordId));
}

export async function getConversation(
  recordId: string,
): Promise<ChatConversation | null> {
  try {
    const r = await base(TABLES.chatConversations).find(recordId);
    return conversationFromRecord(r);
  } catch {
    return null;
  }
}

// Short-lived membership cache for chat authorization. Every messages
// GET/POST has to verify the caller is in the conversation's Members; with
// a 3 s message poll that doubles every user's Airtable read budget. The
// cache holds the participant list for ~10 s, which is short enough that
// removing someone takes effect quickly while still collapsing the rapid
// poll traffic into one read per conversation per window.
const conversationAuthCache = new Map<string, { ts: number; memberIds: string[] }>();
const CONV_AUTH_TTL_MS = 10_000;
export async function getConversationMemberIdsCached(
  recordId: string,
): Promise<string[] | null> {
  const cached = conversationAuthCache.get(recordId);
  const now = Date.now();
  if (cached && now - cached.ts < CONV_AUTH_TTL_MS) return cached.memberIds;
  const conv = await getConversation(recordId);
  if (!conv) {
    conversationAuthCache.delete(recordId);
    return null;
  }
  conversationAuthCache.set(recordId, { ts: now, memberIds: conv.memberRecordIds });
  return conv.memberRecordIds;
}

// Stable participant key for a DM. Sorting the two record IDs makes the key
// order-independent: ensureDirectConversation(A, B) and ensureDirectConversation(B, A)
// must hit the same row.
function directKeyFor(a: string, b: string): string {
  return [a, b].sort().join("|");
}

// Direct conversations are deduped by participant set: if a DM already exists
// between exactly the two members, we reuse it instead of creating a new row.
// Group conversations are always new (the same set of people can have
// multiple distinct group rooms).
//
// Dedupe strategy: a `Direct Key` text field on the conversation row carries
// the sorted "recA|recB" pair, and we filter by that. The previous approach
// (listConversationsFor + JS .find on member record IDs) was both expensive
// and occasionally raced — between two rapid clicks, or in some empty-result
// edge cases — creating duplicate DMs. The text-key filter is exact and
// race-free.
export async function ensureDirectConversation(
  callerRecordId: string,
  _callerCode: string,
  otherRecordId: string,
): Promise<ChatConversation> {
  void _callerCode;
  if (!callerRecordId || !otherRecordId) {
    throw new Error("Both participants must have record ids.");
  }
  const key = directKeyFor(callerRecordId, otherRecordId);
  const records = await base(TABLES.chatConversations)
    .select({
      filterByFormula: `{${FIELDS.chatConversations.directKey}} = "${escape(key)}"`,
      maxRecords: 1,
    })
    .firstPage();
  if (records.length > 0) {
    return conversationFromRecord(records[0]);
  }
  const now = new Date().toISOString();
  const [created] = await base(TABLES.chatConversations).create([
    {
      fields: {
        [FIELDS.chatConversations.kind]: "Direct",
        [FIELDS.chatConversations.members]: [callerRecordId, otherRecordId],
        [FIELDS.chatConversations.createdBy]: [callerRecordId],
        [FIELDS.chatConversations.createdAt]: now,
        [FIELDS.chatConversations.directKey]: key,
      } as FieldSet,
    },
  ]);
  return conversationFromRecord(created);
}

export async function createGroupConversation(
  callerRecordId: string,
  title: string,
  memberRecordIds: string[],
): Promise<ChatConversation> {
  const all = Array.from(new Set([callerRecordId, ...memberRecordIds])).filter(Boolean);
  const now = new Date().toISOString();
  const [created] = await base(TABLES.chatConversations).create([
    {
      fields: {
        [FIELDS.chatConversations.title]: title,
        [FIELDS.chatConversations.kind]: "Group",
        [FIELDS.chatConversations.members]: all,
        [FIELDS.chatConversations.createdBy]: [callerRecordId],
        [FIELDS.chatConversations.createdAt]: now,
      } as FieldSet,
    },
  ]);
  return conversationFromRecord(created);
}

function messageFromRecord(
  r: AirtableRecord<FieldSet>,
  memberById: Map<string, { fullName: string; photoUrl: string | null }>,
): ChatMessage {
  const senderIds = linkedIds(r, FIELDS.chatMessages.sender);
  const senderId = senderIds[0] ?? "";
  const sender = senderId ? memberById.get(senderId) : null;
  return {
    id: r.id,
    body: str(r, FIELDS.chatMessages.body),
    conversationId: linkedIds(r, FIELDS.chatMessages.conversation)[0] ?? "",
    senderRecordId: senderId,
    // Fall back to a placeholder rather than an empty string so the bubble
    // header still renders something readable when the sender's member row
    // has been deleted.
    senderName: sender?.fullName ?? (senderId ? "Removed member" : "Unknown"),
    senderPhotoUrl: sender?.photoUrl ?? null,
    sentAt: (r.get(FIELDS.chatMessages.sentAt) as string | undefined) ?? null,
  };
}

// Cache the member roster for ~60s so the chat poll doesn't re-fetch every
// 3s just to attach sender names. Member metadata changes rarely; a minute
// of staleness is fine for an avatar + display name.
let cachedMembers: { ts: number; list: MemberAdminRecord[] } | null = null;
const MEMBERS_CACHE_TTL_MS = 60_000;
async function cachedListAllMembers(): Promise<MemberAdminRecord[]> {
  const now = Date.now();
  if (cachedMembers && now - cachedMembers.ts < MEMBERS_CACHE_TTL_MS) {
    return cachedMembers.list;
  }
  const list = await listAllMembers();
  cachedMembers = { ts: now, list };
  return list;
}

// Loads the last `limit` messages for a conversation in chronological order.
// We need a member lookup to attach sender names + photos for rendering.
export async function listMessages(
  conversationId: string,
  limit: number = 200,
): Promise<ChatMessage[]> {
  const [records, members] = await Promise.all([
    base(TABLES.chatMessages)
      .select({
        // Filter by the denormalized text id. The previous approach
        // (FIND on ARRAYJOIN of the linked field) silently matched zero
        // rows for DMs because the conversation's primary field (Title)
        // is empty.
        filterByFormula: `{${FIELDS.chatMessages.conversationId}} = "${escape(conversationId)}"`,
        sort: [{ field: FIELDS.chatMessages.sentAt, direction: "desc" }],
        maxRecords: limit,
      })
      .all(),
    cachedListAllMembers(),
  ]);
  const memberById = new Map(
    members.map((m) => [
      m.id,
      { fullName: m.fullName || m.memberCode, photoUrl: m.photo?.url ?? null },
    ]),
  );
  return records
    .map((r) => messageFromRecord(r, memberById))
    .filter((m) => m.conversationId === conversationId)
    .reverse();
}

// Returns a single message by id (or null if it's gone). Used by the
// edit/delete API to enforce sender-only authorization before mutating.
export async function getChatMessage(recordId: string): Promise<ChatMessage | null> {
  try {
    const r = await base(TABLES.chatMessages).find(recordId);
    const senderIds = linkedIds(r, FIELDS.chatMessages.sender);
    const senderId = senderIds[0] ?? "";
    const member = senderId ? await getMemberById(senderId) : null;
    const memberById = new Map(
      member
        ? [[
            member.id,
            { fullName: member.fullName || member.memberCode, photoUrl: member.photo?.url ?? null },
          ] as const]
        : [],
    );
    return messageFromRecord(r, memberById);
  } catch {
    return null;
  }
}

// Refreshes the conversation's Last Message At / Preview based on the
// current most-recent message. Called after edit/delete so the
// conversations list stays accurate. Safe no-op if the conversation now
// has zero messages.
async function refreshConversationPreview(conversationId: string): Promise<void> {
  try {
    const recent = await base(TABLES.chatMessages)
      .select({
        filterByFormula: `{${FIELDS.chatMessages.conversationId}} = "${escape(conversationId)}"`,
        sort: [{ field: FIELDS.chatMessages.sentAt, direction: "desc" }],
        maxRecords: 1,
      })
      .firstPage();
    if (recent.length === 0) {
      // Use `unknown` cast so we can write `null` to clear the datetime
      // field — Airtable's FieldSet type doesn't include null directly.
      await base(TABLES.chatConversations).update([
        {
          id: conversationId,
          fields: {
            [FIELDS.chatConversations.lastMessageAt]: null,
            [FIELDS.chatConversations.lastMessagePreview]: "",
          } as unknown as FieldSet,
        },
      ]);
      return;
    }
    const latest = recent[0];
    const body = str(latest, FIELDS.chatMessages.body);
    const preview = body.replace(/\s+/g, " ").trim().slice(0, 140);
    const sentAt = (latest.get(FIELDS.chatMessages.sentAt) as string | undefined) ?? null;
    await base(TABLES.chatConversations).update([
      {
        id: conversationId,
        fields: {
          [FIELDS.chatConversations.lastMessageAt]: sentAt,
          [FIELDS.chatConversations.lastMessagePreview]: preview,
        } as FieldSet,
      },
    ]);
  } catch {
    // Non-fatal — the next message will fix the preview anyway.
  }
}

export async function updateChatMessage(
  recordId: string,
  body: string,
): Promise<ChatMessage | null> {
  await base(TABLES.chatMessages).update([
    {
      id: recordId,
      fields: { [FIELDS.chatMessages.body]: body } as FieldSet,
    },
  ]);
  const updated = await getChatMessage(recordId);
  if (updated?.conversationId) {
    await refreshConversationPreview(updated.conversationId);
  }
  return updated;
}

export async function deleteChatMessage(recordId: string): Promise<void> {
  // Capture the conversation id before deletion so we can refresh its
  // preview after the row is gone.
  const existing = await getChatMessage(recordId);
  await base(TABLES.chatMessages).destroy([recordId]);
  if (existing?.conversationId) {
    await refreshConversationPreview(existing.conversationId);
  }
}

// Posts a new message and bumps the conversation's lastMessage{At,Preview}
// in the same flow so the conversation list orders correctly without a
// follow-up read.
export async function sendChatMessage(
  conversationId: string,
  senderRecordId: string,
  body: string,
): Promise<ChatMessage> {
  const now = new Date().toISOString();
  const preview = body.replace(/\s+/g, " ").trim().slice(0, 140);
  const [created] = await base(TABLES.chatMessages).create([
    {
      fields: {
        [FIELDS.chatMessages.body]: body,
        [FIELDS.chatMessages.conversation]: [conversationId],
        [FIELDS.chatMessages.conversationId]: conversationId,
        [FIELDS.chatMessages.sender]: [senderRecordId],
        [FIELDS.chatMessages.sentAt]: now,
      } as FieldSet,
    },
  ]);
  // Best-effort metadata bump. A failure here doesn't undo the message.
  try {
    await base(TABLES.chatConversations).update([
      {
        id: conversationId,
        fields: {
          [FIELDS.chatConversations.lastMessageAt]: now,
          [FIELDS.chatConversations.lastMessagePreview]: preview,
        } as FieldSet,
      },
    ]);
  } catch {
    // ignore
  }
  // Only the sender's info is needed to enrich the freshly created message
  // for the response, so we skip the full roster fetch.
  const sender = await getMemberById(senderRecordId);
  const memberById = new Map(
    sender
      ? [[
          sender.id,
          { fullName: sender.fullName || sender.memberCode, photoUrl: sender.photo?.url ?? null },
        ] as const]
      : [],
  );
  return messageFromRecord(created, memberById);
}
