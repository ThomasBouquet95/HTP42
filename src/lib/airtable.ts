import { cache } from "react";
import Airtable, { type FieldSet, type Record as AirtableRecord } from "airtable";
import { env } from "./env";
import { resolvePaymentEur } from "./fx";
import type { PagePerms, RolePermissions } from "./permissions";

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
  opportunities: "Opportunities",
  clientSurveys: "Client Surveys",
  projectRetribution: "Project Retribution",
  chatConversations: "Chat Conversations",
  chatMessages: "Chat Messages",
  vendorInvoices: "Vendor Invoices",
  timesheetReviews: "Timesheet Reviews",
  rolePermissions: "Role Permissions",
  emailTemplates: "Email Templates",
  emailLog: "Email Log",
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
    activityLog: "Activity Log",
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
    subjectToDes: "Subject to DES",
  },
  opportunities: {
    title: "Title",
    client: "Client",
    stage: "Stage",
    status: "Status",
    statusNote: "Status Note",
    contact: "Contact",
    description: "Description",
    estimatedValue: "Estimated Value",
    currency: "Currency",
    expectedStart: "Expected Start",
    convertedProject: "Converted Project",
  },
  clientSurveys: {
    token: "Token",
    projectCode: "Project Code",
    projectName: "Project Name",
    recipientName: "Recipient Name",
    recipientEmail: "Recipient Email",
    sentAt: "Sent At",
    completedAt: "Completed At",
    overallGrade: "Overall Grade",
    overallWentWell: "Overall Went Well",
    overallImprove: "Overall Improve",
    membersJson: "Members JSON",
    memberRatingsJson: "Member Ratings JSON",
    emailSent: "Email Sent",
    emailError: "Email Error",
  },
  projectRetribution: {
    retributionCode: "Retribution Code",
    project: "Project",
    category: "Category",
    percentage: "Percentage",
    recipient: "Recipient",
    member: "Member",
    costBasis: "Cost Basis",
    otherDescription: "Other Description",
    amountType: "Amount Type",
    dailyAmount: "Daily Amount",
    workedStaffing: "Worked Staffing",
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
    timesheets: "Timesheets",
    // Approval workflow config (lazily created via meta API).
    reviewMethod: "Review Method",
    reviewerName: "Reviewer Name",
    reviewerEmail: "Reviewer Email",
  },
  timesheets: {
    timesheetCode: "Timesheet Code",
    id: "Id",
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
    // Approval workflow (lazily created via meta API — see ensureTimesheetReviewFields).
    reviewMethod: "Review Method",
    reviewedBy: "Reviewed By",
    reviewedAt: "Reviewed At",
    reviewComment: "Review Comment",
    reviewToken: "Review Token",
    reviewTokenExpiresAt: "Review Token Expires At",
  },
  rolePermissions: {
    role: "Role",
    permissions: "Permissions",
  },
  emailTemplates: {
    key: "Key",
    subject: "Subject",
    body: "Body",
    to: "To",
    cc: "Cc",
    from: "From",
    updatedAt: "Updated At",
  },
  emailLog: {
    sentAt: "Sent At",
    label: "Email",
    status: "Status",
    from: "From",
    to: "To",
    cc: "Cc",
    subject: "Subject",
    attachments: "Attachments",
    error: "Error",
    body: "Body",
  },
  timesheetReviews: {
    entry: "Entry",
    timesheetId: "Timesheet Record Id",
    timesheetCode: "Timesheet Code",
    memberCode: "Member Code",
    staffingCode: "Staffing Code",
    action: "Action",
    actor: "Actor",
    method: "Method",
    comment: "Comment",
    at: "At",
  },
  payments: {
    paymentCode: "Payment Code",
    direction: "Direction",
    type: "Type",
    project: "Project",
    member: "Member",
    client: "Client",
    memberInvoice: "Member Invoice",
    // Link to the exact Project Staffing the payment settles (the member + project
    // + SOW the invoice was raised against). Source of truth for the payment's
    // project. Lazily created via meta API — see ensurePaymentStaffingField.
    staffing: "Staffing",
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
    invoicePdf: "Invoice PDF",
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
  vendorInvoices: {
    vendor: "Vendor",
    invoiceNumber: "Invoice Number",
    invoiceDate: "Invoice Date",
    amount: "Amount",
    currency: "Currency",
    amountEur: "Amount EUR",
    projectCode: "Project Code",
    status: "Status",
    pdf: "PDF",
    messageId: "Message Id",
    emailSubject: "Email Subject",
    emailFrom: "From",
    receivedAt: "Received At",
    notes: "Notes",
    // Record id of the auto-created "Paid" outflow payment (these invoices are
    // always already paid). The two are a linked pair: deleting one deletes
    // the other. Empty when no payment was created (e.g. amount unknown).
    paymentId: "Payment Id",
  },
} as const;

export type MemberStatus = "Active" | "Partially Active" | "Inactive";
export const MEMBER_STATUSES: MemberStatus[] = ["Active", "Partially Active", "Inactive"];

export type MemberRole =
  | "Managing Partner"
  | "Operating Partner"
  | "Associate Partner"
  | "Project Manager"
  | "Network Operations"
  | "Network Expert"
  | "Support";
export const MEMBER_ROLES: MemberRole[] = [
  "Managing Partner",
  "Operating Partner",
  "Associate Partner",
  "Network Operations",
  "Project Manager",
  "Network Expert",
  "Support",
];

// Roles granted access to the admin panel. Their per-page view/edit rights are
// configurable in the role manager. Everyone else — Network Expert, Support,
// and unassigned (no role) — is member-only with no admin access.
export const ADMIN_ROLES: MemberRole[] = [
  "Managing Partner",
  "Operating Partner",
  "Associate Partner",
  "Project Manager",
  "Network Operations",
];
export function isAdminRole(role: string | null | undefined): boolean {
  // "Admin" is the legacy pre-migration value, accepted for access only.
  return !!role && ((ADMIN_ROLES as string[]).includes(role) || role === "Admin");
}

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
//   Draft → Submitted (Under Review) → Approved → Invoiced → Paid.
// Branches: Submitted → Rejected / Cancelled; Rejected → Draft → Submitted.
// Members own Draft → Submitted and can Cancel until approved; the reviewer
// (admin or client, per the staffing's review method) owns Approved/Rejected;
// admins own Invoiced/Paid (the latter via the payment cascade). "Submitted"
// is stored but shown as "Under Review". Draft/Rejected/Cancelled/Deleted
// never count toward logged/billed days. The legacy "Billing Status" field is
// no longer written; it stays on Airtable for historical records but ignored.
export type TimesheetStatus =
  | "Draft"
  | "Submitted"
  | "Approved"
  | "Rejected"
  | "Invoiced"
  | "Paid"
  | "Cancelled"
  | "Deleted";
export const TIMESHEET_STATUSES: TimesheetStatus[] = [
  "Draft",
  "Submitted",
  "Approved",
  "Rejected",
  "Invoiced",
  "Paid",
  "Cancelled",
  "Deleted",
];

// Statuses that count as "logged effort" toward a staffing's days used and
// toward what an invoice/payment settles. Draft/Rejected/Cancelled/Deleted are
// excluded. (Submitted is included so days-in-flight still show while a week
// awaits review.)
export const LOGGED_TIMESHEET_STATUSES: TimesheetStatus[] = [
  "Submitted",
  "Approved",
  "Invoiced",
  "Paid",
];

// How a submitted timesheet gets reviewed, configured per staffing.
export type ReviewMethod = "Admin" | "Client";
export const REVIEW_METHODS: ReviewMethod[] = ["Admin", "Client"];

// Allowed status transitions (the single source of truth for the state
// machine — every route validates against this).
const TIMESHEET_TRANSITIONS: Record<TimesheetStatus, TimesheetStatus[]> = {
  Draft: ["Submitted", "Cancelled", "Deleted"],
  Submitted: ["Approved", "Rejected", "Cancelled"],
  Approved: ["Invoiced"],
  Rejected: ["Draft", "Submitted", "Cancelled", "Deleted"],
  Invoiced: ["Paid"],
  Paid: [],
  Cancelled: ["Draft"],
  Deleted: [],
};

export function canTransitionTimesheet(from: TimesheetStatus, to: TimesheetStatus): boolean {
  if (from === to) return true;
  return (TIMESHEET_TRANSITIONS[from] ?? []).includes(to);
}

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
  // Whether services to this client must be reported on the DES (Déclaration
  // Européenne de Services). "" = not set.
  subjectToDes: "Yes" | "No" | "";
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
  staffingRecordIds: string[];
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
  invoicePdf: AttachmentRef | null;
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
  // Resolved status shown in the list: explicit stored value if set, else
  // derived from days logged vs allocated.
  status: StaffingStatus | "";
  // The raw stored status ("" = no override, i.e. auto). Used by the edit
  // form so saving unrelated fields doesn't silently pin an auto status.
  rawStatus: StaffingStatus | "";
  notes: string;
  // Approval workflow config: who reviews submitted timesheets for this
  // staffing. "" defaults to Admin review. Reviewer name/email drive the
  // client-review email.
  reviewMethod: ReviewMethod | "";
  reviewerName: string;
  reviewerEmail: string;
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
  // Current review decision (denormalized for fast display + tooltip). The full
  // audit trail lives in the Timesheet Reviews table.
  reviewMethod: ReviewMethod | "";
  reviewedBy: string;
  reviewedAt: string | null;
  reviewComment: string;
  // Expiry of the active client-review link (null when none). The token value
  // itself is intentionally never surfaced on the record.
  reviewTokenExpiresAt: string | null;
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
// The content endpoint *appends*, so to make this behave like a replace we
// first clear the field. Otherwise "replace the CV" leaves the old file as
// the first attachment and firstAttachment() keeps returning the stale one.
export async function uploadMemberAttachment(
  recordId: string,
  field: "photo" | "cv",
  filename: string,
  contentType: string,
  base64: string,
): Promise<MemberRecord | null> {
  const fieldName = field === "photo" ? FIELDS.networkMembers.photo : FIELDS.networkMembers.cv;
  // Clear first so the upload replaces rather than appends.
  await base(TABLES.networkMembers).update([
    { id: recordId, fields: { [fieldName]: [] } as FieldSet },
  ]);
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

// Wrapped in React cache() so repeated calls within one server request (many
// admin pages assemble several lists that each rebuild this member index)
// hit Airtable once, not N times. cache() is request-scoped — no staleness.
export const listAllMembers = cache(async function listAllMembers(): Promise<
  MemberAdminRecord[]
> {
  const records = await base(TABLES.networkMembers)
    .select({
      sort: [{ field: FIELDS.networkMembers.memberCode, direction: "asc" }],
    })
    .all();
  return records.map(memberAdminFromRecord);
});

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
  // Per-day open counts, keyed by UTC day ("2026-07-01": 3). Pruned to the
  // most recent ~60 days. Populated going forward from when the activity log
  // shipped — historical opens before that aren't recorded.
  activityDays: Record<string, number>;
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
        FIELDS.networkMembers.activityLog,
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
    activityDays: parseActivityLog(r.get(FIELDS.networkMembers.activityLog) as string | undefined),
  }));
}

// The Activity Log field stores a compact JSON map of UTC-day -> open count.
// Parsing is defensive: anything malformed just yields an empty map.
function parseActivityLog(raw: string | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const n = typeof v === "number" ? v : Number(v);
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isFinite(n) && n > 0) {
        out[k] = Math.round(n);
      }
    }
    return out;
  } catch {
    return {};
  }
}

function utcDayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Keep only the most recent `keepDays` day-buckets so the JSON stays small.
function pruneActivityLog(
  log: Record<string, number>,
  keepDays: number,
  nowMs: number,
): Record<string, number> {
  const cutoff = utcDayKey(nowMs - keepDays * 24 * 60 * 60 * 1000);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(log)) {
    if (k >= cutoff) out[k] = v;
  }
  return out;
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
  // Log today's open so the admin can chart when the member connected. A
  // fresh SSO sign-in always increments the day's counter.
  await bumpMemberActivityDay(memberRecordId, true);
}

// Ensure the "Activity Log" long-text field exists on Network Members.
// Created lazily via the meta API (same pattern as ensurePaymentInvoicePdfField).
// Idempotent + cached so we don't hit the meta API on every heartbeat.
let activityLogFieldReady = false;
async function ensureMemberActivityLogField(): Promise<boolean> {
  if (activityLogFieldReady) return true;
  try {
    const metaUrl = `https://api.airtable.com/v0/meta/bases/${env.airtableBaseId}/tables`;
    const res = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${env.airtablePat}` },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      tables: Array<{ id: string; name: string; fields: Array<{ name: string }> }>;
    };
    const table = data.tables.find((t) => t.name === TABLES.networkMembers);
    if (!table) return false;
    if (table.fields.some((f) => f.name === FIELDS.networkMembers.activityLog)) {
      activityLogFieldReady = true;
      return true;
    }
    const create = await fetch(
      `https://api.airtable.com/v0/meta/bases/${env.airtableBaseId}/tables/${table.id}/fields`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.airtablePat}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: FIELDS.networkMembers.activityLog,
          type: "multilineText",
          description:
            "Per-day app-open counts as JSON ({\"2026-07-01\": 3}). Maintained by the HTP42 portal; do not edit by hand.",
        }),
      },
    );
    if (create.ok) activityLogFieldReady = true;
    return create.ok;
  } catch {
    return false;
  }
}

// Records that a member opened the app today. `increment` true adds to the
// day's counter (a genuine sign-in); false only ensures the day is marked
// present (a heartbeat on a persistent session). Best-effort and throttled:
// once we've logged a member for a given UTC day in this process, further
// heartbeats that day are skipped to spare Airtable writes.
const activityDayLoggedCache = new Map<string, string>();
async function bumpMemberActivityDay(
  memberRecordId: string,
  increment: boolean,
): Promise<void> {
  const nowMs = Date.now();
  const day = utcDayKey(nowMs);
  if (!increment && activityDayLoggedCache.get(memberRecordId) === day) return;
  try {
    const ok = await ensureMemberActivityLogField();
    if (!ok) return;
    const r = await base(TABLES.networkMembers).find(memberRecordId);
    const log = parseActivityLog(
      r.get(FIELDS.networkMembers.activityLog) as string | undefined,
    );
    if (increment) {
      log[day] = (log[day] ?? 0) + 1;
    } else {
      if (log[day]) {
        // Already recorded today — nothing to write, just mark the cache.
        activityDayLoggedCache.set(memberRecordId, day);
        return;
      }
      log[day] = 1;
    }
    const pruned = pruneActivityLog(log, 60, nowMs);
    await base(TABLES.networkMembers).update([
      {
        id: memberRecordId,
        fields: { [FIELDS.networkMembers.activityLog]: JSON.stringify(pruned) },
      },
    ]);
    activityDayLoggedCache.set(memberRecordId, day);
  } catch {
    // Best-effort; forget the cache so a later heartbeat retries.
    activityDayLoggedCache.delete(memberRecordId);
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
  // Mark today as an active day (once per member per UTC day) so the admin
  // activity chart fills in even when a session persists without a fresh
  // SSO sign-in.
  await bumpMemberActivityDay(memberRecordId, false);
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
  const [created] = await base(TABLES.networkMembers).create(
    [{ fields: fields as FieldSet }],
    // typecast lets Airtable auto-add a new Role single-select choice on write.
    { typecast: true },
  );
  return memberAdminFromRecord(created);
}

export async function adminDeleteMember(recordId: string): Promise<void> {
  await base(TABLES.networkMembers).destroy([recordId]);
}

// ---------------------------------------------------------------------------
// Admin role permissions (view/edit per role per admin page)
// ---------------------------------------------------------------------------

let rolePermissionsTableReady = false;

async function ensureRolePermissionsSchema(): Promise<boolean> {
  if (rolePermissionsTableReady) return true;
  try {
    const metaUrl = `https://api.airtable.com/v0/meta/bases/${env.airtableBaseId}/tables`;
    const res = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${env.airtablePat}` },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { tables: Array<{ name: string }> };
    if (data.tables.some((t) => t.name === TABLES.rolePermissions)) {
      rolePermissionsTableReady = true;
      return true;
    }
    const create = await fetch(metaUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.airtablePat}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: TABLES.rolePermissions,
        description: "Per-role admin-panel access (view/edit per page), managed in the app.",
        fields: [
          { name: FIELDS.rolePermissions.role, type: "singleLineText" },
          { name: FIELDS.rolePermissions.permissions, type: "multilineText" },
        ],
      }),
    });
    if (create.ok) {
      rolePermissionsTableReady = true;
      return true;
    }
    console.error("ensureRolePermissionsSchema: create failed:", await create.text().catch(() => ""));
    return false;
  } catch (e) {
    console.error("ensureRolePermissionsSchema failed:", e);
    return false;
  }
}

// All saved role overrides as { role -> PagePerms }. Roles without a row fall
// back to code defaults (handled by can() in lib/permissions).
export const getRolePermissions = cache(async function getRolePermissions(): Promise<RolePermissions> {
  try {
    const ok = await ensureRolePermissionsSchema();
    if (!ok) return {};
    const records = await base(TABLES.rolePermissions).select().all();
    const out: RolePermissions = {};
    for (const r of records) {
      const role = str(r, FIELDS.rolePermissions.role);
      if (!role) continue;
      try {
        out[role] = JSON.parse(str(r, FIELDS.rolePermissions.permissions) || "{}") as PagePerms;
      } catch {
        out[role] = {};
      }
    }
    return out;
  } catch (e) {
    console.error("getRolePermissions failed:", e);
    return {};
  }
});

export async function setRolePermissions(role: string, perms: PagePerms): Promise<void> {
  await ensureRolePermissionsSchema();
  const existing = await base(TABLES.rolePermissions)
    .select({ filterByFormula: `{${FIELDS.rolePermissions.role}} = "${escape(role)}"`, maxRecords: 1 })
    .firstPage();
  const fields = {
    [FIELDS.rolePermissions.role]: role,
    [FIELDS.rolePermissions.permissions]: JSON.stringify(perms),
  } as FieldSet;
  if (existing[0]) {
    await base(TABLES.rolePermissions).update([{ id: existing[0].id, fields }]);
  } else {
    await base(TABLES.rolePermissions).create([{ fields }]);
  }
}

// ---------------------------------------------------------------------------
// Email template overrides (admin-editable subject/body per email)
// ---------------------------------------------------------------------------

let emailTemplatesTableReady = false;

async function ensureEmailTemplatesSchema(): Promise<boolean> {
  if (emailTemplatesTableReady) return true;
  try {
    const metaUrl = `https://api.airtable.com/v0/meta/bases/${env.airtableBaseId}/tables`;
    const res = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${env.airtablePat}` },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      tables: Array<{ id: string; name: string; fields: Array<{ name: string }> }>;
    };
    const E = FIELDS.emailTemplates;
    const wanted = [
      { name: E.key, type: "singleLineText" },
      { name: E.subject, type: "singleLineText" },
      { name: E.body, type: "multilineText" },
      { name: E.to, type: "singleLineText" },
      { name: E.cc, type: "singleLineText" },
      { name: E.from, type: "singleLineText" },
      { name: E.updatedAt, type: "singleLineText" },
    ];
    const existingTable = data.tables.find((t) => t.name === TABLES.emailTemplates);
    if (existingTable) {
      // Add any fields introduced after the table was first created (e.g. the
      // To/Cc/From recipient overrides) so writes don't fail on unknown fields.
      const have = new Set((existingTable.fields ?? []).map((f) => f.name));
      const missing = wanted.filter((f) => !have.has(f.name));
      for (const field of missing) {
        await fetch(
          `https://api.airtable.com/v0/meta/bases/${env.airtableBaseId}/tables/${existingTable.id}/fields`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.airtablePat}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(field),
          },
        ).catch(() => null);
      }
      emailTemplatesTableReady = true;
      return true;
    }
    const create = await fetch(metaUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.airtablePat}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: TABLES.emailTemplates,
        description: "Admin-editable subject/body overrides for the portal's automated emails.",
        fields: [
          { name: E.key, type: "singleLineText" },
          { name: E.subject, type: "singleLineText" },
          { name: E.body, type: "multilineText" },
          { name: E.to, type: "singleLineText" },
          { name: E.cc, type: "singleLineText" },
          { name: E.from, type: "singleLineText" },
          { name: E.updatedAt, type: "singleLineText" },
        ],
      }),
    });
    if (create.ok) {
      emailTemplatesTableReady = true;
      return true;
    }
    console.error("ensureEmailTemplatesSchema: create failed:", await create.text().catch(() => ""));
    return false;
  } catch (e) {
    console.error("ensureEmailTemplatesSchema failed:", e);
    return false;
  }
}

// All saved overrides keyed by template key. Templates without a row use the
// coded defaults in lib/email-templates.
export const getEmailTemplateOverrides = cache(async function getEmailTemplateOverrides(): Promise<
  Record<string, StoredEmailTemplate>
> {
  try {
    const ok = await ensureEmailTemplatesSchema();
    if (!ok) return {};
    const E = FIELDS.emailTemplates;
    const records = await base(TABLES.emailTemplates).select().all();
    const out: Record<string, StoredEmailTemplate> = {};
    for (const r of records) {
      const key = str(r, E.key);
      if (!key) continue;
      out[key] = {
        key,
        subject: str(r, E.subject),
        body: str(r, E.body),
        to: str(r, E.to),
        cc: str(r, E.cc),
        from: str(r, E.from),
        updatedAt: str(r, E.updatedAt) || null,
      };
    }
    return out;
  } catch (e) {
    console.error("getEmailTemplateOverrides failed:", e);
    return {};
  }
});

export type StoredEmailTemplate = {
  key: string;
  subject: string;
  body: string;
  to: string;
  cc: string;
  from: string;
  updatedAt: string | null;
};

export async function getEmailTemplateOverride(
  key: string,
): Promise<StoredEmailTemplate | null> {
  const all = await getEmailTemplateOverrides();
  return all[key] ?? null;
}

export async function setEmailTemplateOverride(
  key: string,
  input: { subject: string; body: string; to: string; cc: string; from: string },
): Promise<void> {
  await ensureEmailTemplatesSchema();
  const E = FIELDS.emailTemplates;
  const existing = await base(TABLES.emailTemplates)
    .select({ filterByFormula: `{${E.key}} = "${escape(key)}"`, maxRecords: 1 })
    .firstPage();
  const fields = {
    [E.key]: key,
    [E.subject]: input.subject,
    [E.body]: input.body,
    [E.to]: input.to,
    [E.cc]: input.cc,
    [E.from]: input.from,
    [E.updatedAt]: new Date().toISOString(),
  } as FieldSet;
  if (existing[0]) {
    await base(TABLES.emailTemplates).update([{ id: existing[0].id, fields }]);
  } else {
    await base(TABLES.emailTemplates).create([{ fields }]);
  }
}

// Remove any override for a key, reverting the email to its coded default.
export async function resetEmailTemplateOverride(key: string): Promise<void> {
  await ensureEmailTemplatesSchema();
  const E = FIELDS.emailTemplates;
  const existing = await base(TABLES.emailTemplates)
    .select({ filterByFormula: `{${E.key}} = "${escape(key)}"` })
    .all();
  if (existing.length > 0) {
    await base(TABLES.emailTemplates).destroy(existing.map((r) => r.id));
  }
}

// ---------------------------------------------------------------------------
// Email send log (every message dispatched through Microsoft Graph)
// ---------------------------------------------------------------------------

let emailLogTableReady = false;

async function ensureEmailLogSchema(): Promise<boolean> {
  if (emailLogTableReady) return true;
  try {
    const metaUrl = `https://api.airtable.com/v0/meta/bases/${env.airtableBaseId}/tables`;
    const res = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${env.airtablePat}` },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { tables: Array<{ name: string }> };
    if (data.tables.some((t) => t.name === TABLES.emailLog)) {
      emailLogTableReady = true;
      return true;
    }
    const L = FIELDS.emailLog;
    const create = await fetch(metaUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.airtablePat}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: TABLES.emailLog,
        description: "Audit log of every automated email the portal dispatched (metadata only).",
        fields: [
          { name: L.sentAt, type: "singleLineText" },
          { name: L.label, type: "singleLineText" },
          { name: L.status, type: "singleLineText" },
          { name: L.from, type: "singleLineText" },
          { name: L.to, type: "singleLineText" },
          { name: L.cc, type: "singleLineText" },
          { name: L.subject, type: "singleLineText" },
          { name: L.attachments, type: "multilineText" },
          { name: L.error, type: "multilineText" },
          { name: L.body, type: "multilineText" },
        ],
      }),
    });
    if (create.ok) {
      emailLogTableReady = true;
      return true;
    }
    console.error("ensureEmailLogSchema: create failed:", await create.text().catch(() => ""));
    return false;
  } catch (e) {
    console.error("ensureEmailLogSchema failed:", e);
    return false;
  }
}

export type EmailLogInput = {
  label: string;
  status: "Sent" | "Failed";
  from: string;
  to: string;
  cc: string;
  subject: string;
  attachments: string;
  error: string;
  body: string;
};

// Append one row to the email log. Best-effort: a logging failure must never
// affect the send it is recording.
export async function logEmailSend(input: EmailLogInput): Promise<void> {
  try {
    const ok = await ensureEmailLogSchema();
    if (!ok) return;
    const L = FIELDS.emailLog;
    await base(TABLES.emailLog).create([
      {
        fields: {
          [L.sentAt]: new Date().toISOString(),
          [L.label]: input.label,
          [L.status]: input.status,
          [L.from]: input.from,
          [L.to]: input.to,
          [L.cc]: input.cc,
          [L.subject]: input.subject,
          [L.attachments]: input.attachments,
          [L.error]: input.error,
          [L.body]: input.body.slice(0, 8000),
        } as FieldSet,
      },
    ]);
  } catch (e) {
    console.error("logEmailSend failed:", e);
  }
}

export type EmailLogEntry = {
  id: string;
  sentAt: string | null;
  label: string;
  status: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  attachments: string;
  error: string;
  body: string;
};

export async function listEmailLogs(limit = 200): Promise<EmailLogEntry[]> {
  try {
    const ok = await ensureEmailLogSchema();
    if (!ok) return [];
    const L = FIELDS.emailLog;
    const records = await base(TABLES.emailLog)
      .select({ sort: [{ field: L.sentAt, direction: "desc" }], maxRecords: limit })
      .all();
    return records.map((r) => ({
      id: r.id,
      sentAt: (r.get(L.sentAt) as string | undefined) ?? null,
      label: str(r, L.label),
      status: str(r, L.status),
      from: str(r, L.from),
      to: str(r, L.to),
      cc: str(r, L.cc),
      subject: str(r, L.subject),
      attachments: str(r, L.attachments),
      error: str(r, L.error),
      body: str(r, L.body),
    }));
  } catch (e) {
    console.error("listEmailLogs failed:", e);
    return [];
  }
}

// Old → new member role for the one-shot migration. Returns null to leave a
// record untouched (already a current role, or unassigned).
function mapLegacyMemberRole(old: string): string | null {
  if ((MEMBER_ROLES as string[]).includes(old)) return null; // already migrated
  if (old === "") return null; // unassigned stays unassigned (no admin access)
  if (old === "Admin") return "Managing Partner";
  if (old === "Support Member") return "Support";
  return "Network Expert"; // Core Team / Extended Core Team / Network Member / anything else
}

// Count of members still on a legacy role value, for the admin banner.
export async function countLegacyMemberRoles(): Promise<number> {
  const records = await base(TABLES.networkMembers)
    .select({ fields: [FIELDS.networkMembers.role] })
    .all();
  return records.filter((r) => mapLegacyMemberRole(str(r, FIELDS.networkMembers.role)) !== null).length;
}

// One-shot role migration: Admin → Managing Partner, Support Member → Support,
// every other assigned legacy role → Network Expert. Unassigned members are
// left as-is (they have no admin access either way). Idempotent: current roles
// are skipped, so a re-run is safe.
export async function migrateMemberRoles(): Promise<{ updated: number }> {
  const records = await base(TABLES.networkMembers)
    .select({ fields: [FIELDS.networkMembers.role] })
    .all();
  const updates: { id: string; fields: FieldSet }[] = [];
  for (const r of records) {
    const next = mapLegacyMemberRole(str(r, FIELDS.networkMembers.role));
    if (next) updates.push({ id: r.id, fields: { [FIELDS.networkMembers.role]: next } as FieldSet });
  }
  for (let i = 0; i < updates.length; i += 10) {
    await base(TABLES.networkMembers).update(updates.slice(i, i + 10), { typecast: true });
  }
  return { updated: updates.length };
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
  const [updated] = await base(TABLES.networkMembers).update(
    [{ id: recordId, fields: fields as FieldSet }],
    { typecast: true },
  );
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
    subjectToDes: (str(r, FIELDS.clients.subjectToDes) as "Yes" | "No") || "",
  };
}

export const listClients = cache(async function listClients(): Promise<ClientRecord[]> {
  await ensureClientsSchema();
  const records = await base(TABLES.clients)
    .select({ sort: [{ field: FIELDS.clients.clientCode, direction: "asc" }] })
    .all();
  return records.map(clientFromRecord);
});

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
  subjectToDes: "Yes" | "No" | "";
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
    [FIELDS.clients.subjectToDes]: input.subjectToDes === "" ? null : input.subjectToDes,
  };
}

// The Clients table pre-exists; lazily add the "Subject to DES" single-select
// (Yes/No) so writes can set it. Idempotent + cached.
let clientsSchemaReady = false;
export async function ensureClientsSchema(): Promise<boolean> {
  if (clientsSchemaReady) return true;
  try {
    const metaUrl = `https://api.airtable.com/v0/meta/bases/${env.airtableBaseId}/tables`;
    const res = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${env.airtablePat}` },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      tables: Array<{ id: string; name: string; fields: Array<{ name: string }> }>;
    };
    const table = data.tables.find((t) => t.name === TABLES.clients);
    if (!table) return false;
    if (table.fields.some((f) => f.name === FIELDS.clients.subjectToDes)) {
      clientsSchemaReady = true;
      return true;
    }
    const create = await fetch(
      `https://api.airtable.com/v0/meta/bases/${env.airtableBaseId}/tables/${table.id}/fields`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${env.airtablePat}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: FIELDS.clients.subjectToDes,
          type: "singleSelect",
          options: { choices: [{ name: "Yes" }, { name: "No" }] },
        }),
      },
    );
    if (create.ok) clientsSchemaReady = true;
    return create.ok;
  } catch (e) {
    console.error("ensureClientsSchema failed:", e);
    return false;
  }
}

export async function createClient(input: ClientInput): Promise<string> {
  await ensureClientsSchema();
  const [created] = await base(TABLES.clients).create(
    [{ fields: clientFields(input) as FieldSet }],
    { typecast: true },
  );
  return created.id;
}

export async function updateClient(recordId: string, input: ClientInput): Promise<void> {
  await ensureClientsSchema();
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

// Derive a client code from the client name and guarantee it is unique against
// the existing clients (append a numeric suffix on collision). Mirrors the
// shape of suggestMemberCode / nextProjectCode.
export async function suggestClientCode(name: string): Promise<string> {
  const cleaned = name.trim();
  if (cleaned.length === 0) return "";
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  let stem = "";
  if (tokens.length > 1) {
    // First letter of each of the first three words.
    stem = tokens
      .map((t) => t.replace(/[^A-Za-z]/g, "").charAt(0))
      .filter(Boolean)
      .slice(0, 3)
      .join("")
      .toUpperCase();
  }
  if (stem.length < 3) {
    // Single word (or too few initials): first three letters of the name.
    stem = cleaned.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
  }
  if (stem.length === 0) return "";
  const existing = await listClients();
  const used = new Set(existing.map((c) => c.clientCode));
  if (!used.has(stem)) return stem;
  for (let n = 1; n < 100; n += 1) {
    const candidate = `${stem}${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return stem;
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

export const listProjects = cache(async function listProjects(): Promise<ProjectRecord[]> {
  const records = await base(TABLES.projects)
    .select({ sort: [{ field: FIELDS.projects.projectCode, direction: "asc" }] })
    .all();
  return records.map(projectFromRecord);
});

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
    staffingRecordIds: linkedIds(r, FIELDS.payments.staffing),
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
    invoicePdf: firstAttachment(r, FIELDS.payments.invoicePdf),
  };
}

// Raw payments straight from the table, WITHOUT project inheritance applied.
// The mismatch audit uses this to see the stored links as-is; everything else
// should use listPayments (which resolves the project from the linked invoice).
export async function listPaymentsRaw(): Promise<PaymentRecord[]> {
  const records = await base(TABLES.payments)
    .select({ sort: [{ field: FIELDS.payments.invoiceDate, direction: "desc" }] })
    .all();
  return records.map(paymentFromRecord);
}

export async function listPayments(): Promise<PaymentRecord[]> {
  return applyInheritedProjects(await listPaymentsRaw());
}

export async function getPaymentById(recordId: string): Promise<PaymentRecord | null> {
  try {
    const r = await base(TABLES.payments).find(recordId);
    const [p] = await applyInheritedProjects([paymentFromRecord(r)]);
    return p;
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
  // Optional: the staffing this payment settles. When omitted (undefined) the
  // stored value is left untouched; pass [] to clear. createPayment/updatePayment
  // fill it automatically from the linked invoice when the payment settles one.
  staffingRecordIds?: string[];
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
  // Always derive the FX rate + EUR value from the amount and currency at write
  // time so the stored "Invoice Value EUR" is never left blank (EUR normalizes
  // to rate 1). This keeps CSV exports/pivots and the cockpit in agreement.
  const { fxRateToEur, invoiceValueEur } = resolvePaymentEur({
    currency: input.invoiceCurrency,
    value: input.invoiceValue,
    fx: input.fxRateToEur,
  });
  return {
    [FIELDS.payments.direction]: input.direction === "" ? null : input.direction,
    [FIELDS.payments.type]: input.type,
    [FIELDS.payments.project]: input.projectRecordIds,
    [FIELDS.payments.client]: input.clientRecordIds,
    [FIELDS.payments.member]: input.memberRecordIds,
    [FIELDS.payments.memberInvoice]: input.memberInvoiceRecordIds,
    // Only touch Staffing when the caller provided a value (undefined = leave
    // as-is so an unrelated admin edit doesn't wipe the link).
    ...(input.staffingRecordIds !== undefined
      ? { [FIELDS.payments.staffing]: input.staffingRecordIds }
      : {}),
    [FIELDS.payments.invoiceDate]: input.invoiceDate,
    [FIELDS.payments.invoiceReference]: input.invoiceReference,
    [FIELDS.payments.invoiceCurrency]: input.invoiceCurrency === "" ? null : input.invoiceCurrency,
    [FIELDS.payments.invoiceValue]: input.invoiceValue,
    [FIELDS.payments.fxRateToEur]: fxRateToEur,
    [FIELDS.payments.invoiceValueEur]: invoiceValueEur,
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
  const resolved = await prepPaymentWrite(input);
  const [created] = await base(TABLES.payments).create([
    { fields: paymentFields(resolved) as FieldSet },
  ]);
  return created.id;
}

export async function updatePaymentStatus(
  recordId: string,
  status: PaymentStatus | "",
  paymentDate?: string | null,
): Promise<void> {
  const fields: Record<string, unknown> = {
    [FIELDS.payments.paymentStatus]: status === "" ? null : status,
  };
  // Payment Date follows the lifecycle: set it when marking Paid (the caller
  // requires the admin to provide it), and clear it when leaving Paid so no
  // stale date lingers.
  if (status === "Paid") {
    if (paymentDate) fields[FIELDS.payments.paymentDate] = paymentDate;
  } else {
    fields[FIELDS.payments.paymentDate] = null;
  }
  await base(TABLES.payments).update([{ id: recordId, fields: fields as FieldSet }]);
}

export async function updatePayment(recordId: string, input: PaymentInput): Promise<void> {
  const resolved = await prepPaymentWrite(input);
  await base(TABLES.payments).update([
    { id: recordId, fields: paymentFields(resolved) as FieldSet },
  ]);
}

// Resolve staffing + project for a write, and make sure the Staffing field
// exists before we try to write it. If the field can't be created (meta API
// hiccup), drop the staffing from the write so the payment still saves.
async function prepPaymentWrite(input: PaymentInput): Promise<PaymentInput> {
  const resolved = await withInheritedProject(input);
  if (resolved.staffingRecordIds !== undefined) {
    const ok = await ensurePaymentStaffingField();
    if (!ok) return { ...resolved, staffingRecordIds: undefined };
  }
  return resolved;
}

export async function deletePayment(recordId: string): Promise<void> {
  await base(TABLES.payments).destroy([recordId]);
}

// Delete a payment and, if it was the auto-created mirror of an automated
// vendor invoice, delete that invoice too (raw destroy on both to avoid the
// reverse cascade in deleteVendorInvoice looping back). Returns the linked
// invoice id when one was also removed, so the UI can say so.
export async function deletePaymentWithLinkedInvoice(
  recordId: string,
): Promise<{ deletedInvoiceId: string | null }> {
  const linked = await vendorInvoiceForPayment(recordId);
  await base(TABLES.payments).destroy([recordId]);
  if (linked) {
    await base(TABLES.vendorInvoices).destroy([linked.id]).catch(() => {});
  }
  return { deletedInvoiceId: linked?.id ?? null };
}

// One-time (re-runnable) backfill: recompute the stored FX rate + EUR value for
// every payment from its amount and currency, so the "Invoice Value EUR" field
// is never left blank (EUR normalizes to rate 1). New writes are normalized at
// save time via paymentFields; this repairs rows saved before that. Safe to run
// repeatedly, only touches rows whose stored values differ from the derived
// ones. Returns how many rows were scanned and updated.
export async function backfillPaymentEur(): Promise<{ scanned: number; updated: number }> {
  const records = await base(TABLES.payments).select().all();
  const F = FIELDS.payments;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const updates: { id: string; fields: FieldSet }[] = [];
  for (const r of records) {
    const value = numOrNull(r, F.invoiceValue);
    if (value == null) continue; // nothing to convert
    const currency = str(r, F.invoiceCurrency);
    const fx = numOrNull(r, F.fxRateToEur);
    const resolved = resolvePaymentEur({ currency, value, fx });
    const desiredFx = resolved.fxRateToEur;
    const desiredEur = resolved.invoiceValueEur == null ? null : round2(resolved.invoiceValueEur);
    const curFx = fx;
    const curEur = numOrNull(r, F.invoiceValueEur);
    const curEurRounded = curEur == null ? null : round2(curEur);
    if (curFx === desiredFx && curEurRounded === desiredEur) continue;
    updates.push({
      id: r.id,
      fields: {
        [F.fxRateToEur]: desiredFx,
        [F.invoiceValueEur]: desiredEur,
      } as FieldSet,
    });
  }
  // Airtable caps updates at 10 per request.
  for (let i = 0; i < updates.length; i += 10) {
    await base(TABLES.payments).update(updates.slice(i, i + 10));
  }
  return { scanned: records.length, updated: updates.length };
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

const getProjectIndex = cache(async function getProjectIndex(): Promise<
  Map<string, { code: string; name: string }>
> {
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
});

const getMemberIndex = cache(async function getMemberIndex(): Promise<
  Map<string, { code: string; name: string }>
> {
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
});

const getStaffingIndex = cache(async function getStaffingIndex(): Promise<
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
});

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

// ---------------------------------------------------------------------------
// Payment ↔ staffing linkage + project inheritance
//
// When a member submits an invoice they pick a STAFFING (member + project +
// SOW). The invoice links that staffing; the auto-created payment must link the
// SAME staffing — that's the source of truth. The payment's project is then
// DERIVED from the staffing's project, never chosen independently. This holds on
// read, on write, and via a backfill for legacy rows. Standalone payments (no
// linked invoice/staffing) keep their own project.
// ---------------------------------------------------------------------------

// project code -> project record id (inverse of getProjectIndex).
const getProjectIdByCode = cache(async function getProjectIdByCode(): Promise<Map<string, string>> {
  const idx = await getProjectIndex();
  const m = new Map<string, string>();
  for (const [id, p] of idx) if (p.code) m.set(p.code, id);
  return m;
});

// member-invoice record id -> the staffing record id it was raised against.
const getInvoiceStaffingIndex = cache(async function getInvoiceStaffingIndex(): Promise<
  Map<string, string>
> {
  const invoices = await listAllInvoices();
  return new Map(
    invoices.filter((i) => i.staffingRecordId).map((i) => [i.id, i.staffingRecordId] as const),
  );
});

// Resolve the staffing a payment settles: its own Staffing link first, else the
// staffing of the first linked invoice. Then the project that staffing belongs
// to. Returns nulls for a standalone payment (nothing to inherit).
async function resolvePaymentStaffingProject(p: {
  staffingRecordIds: string[];
  memberInvoiceRecordIds: string[];
}): Promise<{ staffingId: string | null; projectCode: string | null; projectId: string | null }> {
  let staffingId = p.staffingRecordIds[0] ?? null;
  if (!staffingId && p.memberInvoiceRecordIds.length > 0) {
    const invStaffing = await getInvoiceStaffingIndex();
    for (const invId of p.memberInvoiceRecordIds) {
      const s = invStaffing.get(invId);
      if (s) {
        staffingId = s;
        break;
      }
    }
  }
  if (!staffingId) return { staffingId: null, projectCode: null, projectId: null };
  const [staffingIdx, idByCode] = await Promise.all([getStaffingIndex(), getProjectIdByCode()]);
  const projectCode = staffingIdx.get(staffingId)?.projectCode ?? null;
  const projectId = projectCode ? idByCode.get(projectCode) ?? null : null;
  return { staffingId, projectCode, projectId };
}

// Read-side: for every payment that settles a staffing/invoice, surface the
// staffing link and the project derived from it, so the app is always correct
// regardless of what's stored on the row.
async function applyInheritedProjects(payments: PaymentRecord[]): Promise<PaymentRecord[]> {
  const needs = payments.some(
    (p) => p.staffingRecordIds.length > 0 || p.memberInvoiceRecordIds.length > 0,
  );
  if (!needs) return payments;
  const [staffingIdx, idByCode, invStaffing, projIdx] = await Promise.all([
    getStaffingIndex(),
    getProjectIdByCode(),
    getInvoiceStaffingIndex(),
    getProjectIndex(),
  ]);
  return payments.map((p) => {
    let staffingId = p.staffingRecordIds[0] ?? null;
    if (!staffingId) {
      for (const invId of p.memberInvoiceRecordIds) {
        const s = invStaffing.get(invId);
        if (s) {
          staffingId = s;
          break;
        }
      }
    }
    if (!staffingId) return p;
    const code = staffingIdx.get(staffingId)?.projectCode ?? null;
    const recId = code ? idByCode.get(code) : undefined;
    return {
      ...p,
      staffingRecordIds: [staffingId],
      projectCodes: recId ? [projIdx.get(recId)?.code ?? code!] : code ? [code] : p.projectCodes,
      projectRecordIds: recId ? [recId] : p.projectRecordIds,
    };
  });
}

// Write-side: before persisting, link the payment to its governing staffing
// (from the linked invoice when not set) and set the project from that staffing.
async function withInheritedProject(input: PaymentInput): Promise<PaymentInput> {
  const { staffingId, projectId } = await resolvePaymentStaffingProject({
    staffingRecordIds: input.staffingRecordIds ?? [],
    memberInvoiceRecordIds: input.memberInvoiceRecordIds,
  });
  if (!staffingId) return input; // standalone — leave project/staffing as given
  return {
    ...input,
    staffingRecordIds: [staffingId],
    ...(projectId ? { projectRecordIds: [projectId] } : {}),
  };
}

// Lazily add the "Staffing" link field to the Payments table (meta API), same
// pattern as ensurePaymentInvoicePdfField. Best-effort; returns whether the
// field exists so callers can decide to write to it.
let paymentStaffingFieldReady = false;
async function ensurePaymentStaffingField(): Promise<boolean> {
  if (paymentStaffingFieldReady) return true;
  try {
    const metaUrl = `https://api.airtable.com/v0/meta/bases/${env.airtableBaseId}/tables`;
    const res = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${env.airtablePat}` },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      tables: Array<{ id: string; name: string; fields: Array<{ name: string }> }>;
    };
    const table = data.tables.find((t) => t.name === TABLES.payments);
    if (!table) return false;
    if (table.fields.some((f) => f.name === FIELDS.payments.staffing)) {
      paymentStaffingFieldReady = true;
      return true;
    }
    const staffingTable = data.tables.find((t) => t.name === TABLES.projectStaffing);
    if (!staffingTable) return false;
    const create = await fetch(
      `https://api.airtable.com/v0/meta/bases/${env.airtableBaseId}/tables/${table.id}/fields`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.airtablePat}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: FIELDS.payments.staffing,
          type: "multipleRecordLinks",
          options: { linkedTableId: staffingTable.id },
          description:
            "The Project Staffing this payment settles (member + project + SOW). Drives the payment's project. Set by the HTP42 portal.",
        }),
      },
    );
    if (create.ok) paymentStaffingFieldReady = true;
    return paymentStaffingFieldReady;
  } catch (e) {
    console.error("ensurePaymentStaffingField failed:", e);
    return false;
  }
}

// One-off (re-runnable) backfill: for every payment that settles a member
// invoice, link it to the invoice's staffing and set its project from that
// staffing. Dry-run by default (apply=false). Idempotent — only touches rows
// whose staffing or project is missing/wrong.
export async function backfillPaymentProjects(apply: boolean): Promise<{
  scanned: number;
  toFix: number;
  updated: number;
  unresolved: number;
  diagnostics: {
    linkedToInvoice: number;
    standalone: number;
    invoiceNotFound: number;
    invoiceHasNoStaffing: number;
    alreadyCorrect: number;
  };
  changes: {
    paymentCode: string;
    staffingFrom: string;
    staffingTo: string;
    projectFrom: string;
    projectTo: string;
  }[];
}> {
  const raw = await listPaymentsRaw();
  const [invStaffing, staffingIdx, idByCode, projIdx] = await Promise.all([
    getInvoiceStaffingIndex(),
    getStaffingIndex(),
    getProjectIdByCode(),
    getProjectIndex(),
  ]);
  if (apply) await ensurePaymentStaffingField();
  const changes: {
    paymentCode: string;
    staffingFrom: string;
    staffingTo: string;
    projectFrom: string;
    projectTo: string;
  }[] = [];
  const updates: { id: string; fields: FieldSet }[] = [];
  let unresolved = 0;
  // Diagnostics so a dry-run explains WHY toFix is what it is.
  const diag = {
    linkedToInvoice: 0, // payments that link ≥1 member invoice
    standalone: 0, // payments with no member invoice link (can't inherit)
    invoiceNotFound: 0, // linked invoice id not present in the invoices table
    invoiceHasNoStaffing: 0, // invoice exists but carries no staffing link
    alreadyCorrect: 0, // staffing + project already right
  };
  for (const p of raw) {
    if (p.memberInvoiceRecordIds.length === 0) {
      diag.standalone += 1;
      continue;
    }
    diag.linkedToInvoice += 1;
    // Governing staffing = the invoice's staffing.
    let staffingId: string | undefined;
    let sawInvoice = false;
    for (const invId of p.memberInvoiceRecordIds) {
      if (invStaffing.has(invId)) {
        sawInvoice = true;
        staffingId = invStaffing.get(invId);
        break;
      }
    }
    if (!staffingId) {
      // Distinguish "invoice not in table" from "invoice has no staffing".
      if (!sawInvoice) diag.invoiceNotFound += 1;
      else diag.invoiceHasNoStaffing += 1;
      unresolved += 1;
      continue;
    }
    const code = staffingIdx.get(staffingId)?.projectCode;
    const targetProjectId = code ? idByCode.get(code) : undefined;
    const staffingOk = p.staffingRecordIds.includes(staffingId);
    const projectOk = targetProjectId ? p.projectRecordIds.includes(targetProjectId) : true;
    if (staffingOk && projectOk) {
      diag.alreadyCorrect += 1;
      continue;
    }
    const staffingCodeOf = (id: string) => staffingIdx.get(id)?.code ?? id;
    changes.push({
      paymentCode: p.paymentCode || p.id,
      staffingFrom: p.staffingRecordIds.map(staffingCodeOf).join(", ") || "(none)",
      staffingTo: staffingIdx.get(staffingId)?.code ?? staffingId,
      projectFrom: p.projectRecordIds.map((id) => projIdx.get(id)?.code ?? id).join(", ") || "(none)",
      projectTo: code ?? "(unresolved)",
    });
    const fields: Record<string, unknown> = { [FIELDS.payments.staffing]: [staffingId] };
    if (targetProjectId) fields[FIELDS.payments.project] = [targetProjectId];
    updates.push({ id: p.id, fields: fields as FieldSet });
  }
  let updated = 0;
  if (apply) {
    // Airtable caps batch writes at 10 records.
    for (let i = 0; i < updates.length; i += 10) {
      await base(TABLES.payments).update(updates.slice(i, i + 10));
      updated += Math.min(10, updates.length - i);
    }
  }
  // invStaffing built from invoices with a staffing — expose totals for context.
  return {
    scanned: raw.length,
    toFix: changes.length,
    updated,
    unresolved,
    diagnostics: diag,
    changes,
  };
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

export type MemberInvoiceUpdateInput = {
  amount: number | null;
  currency: string;
  comment: string;
  submissionDate: string | null;
};

// Admin edit of a member invoice. Writes only the editable fields — the PDF
// and the linked member/project/staffing are left untouched. typecast:true so
// the Status single-select accepts its canonical choices without complaint.
export async function updateMemberInvoice(
  recordId: string,
  input: MemberInvoiceUpdateInput,
): Promise<void> {
  const fields: Record<string, unknown> = {
    [FIELDS.memberInvoices.amount]: input.amount,
    [FIELDS.memberInvoices.currency]: input.currency === "" ? null : input.currency,
    [FIELDS.memberInvoices.comment]: input.comment,
    [FIELDS.memberInvoices.submissionDate]: input.submissionDate,
  };
  await base(TABLES.memberInvoices).update(
    [{ id: recordId, fields: fields as FieldSet }],
    { typecast: true },
  );
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

// When an Outflow payment linked to member invoice(s) is marked Paid, mark
// each linked member invoice Paid. Best-effort — callers wrap this so a cascade
// hiccup never blocks the payment update itself.
//
// Note: "Paid" is a PAYMENT (and member-invoice) status only. Timesheets are
// NOT flipped to Paid — a timesheet's lifecycle ends at Approved; whether the
// work was billed/paid is tracked on the payment, not the timesheet.
export async function cascadeInvoicePaidForPayment(payment: PaymentRecord): Promise<void> {
  for (const invoiceId of payment.memberInvoiceRecordIds) {
    try {
      const inv = await getInvoiceById(invoiceId);
      if (!inv) continue;
      // Mark the member invoice Paid (leave Cancelled / already-Paid alone).
      if (inv.status !== "Cancelled" && inv.status !== "Paid") {
        await base(TABLES.memberInvoices).update([
          { id: invoiceId, fields: { [FIELDS.memberInvoices.status]: "Paid" } as FieldSet },
        ]);
      }
    } catch (e) {
      console.error("cascadeInvoicePaidForPayment failed for invoice", invoiceId, e);
    }
  }
}

const getProjectNameMap = cache(async function getProjectNameMap(): Promise<
  Map<string, string>
> {
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
});

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
// All staffings keyed by record id (for toTimesheet when the member is
// unknown, e.g. resolving a client-review token).
async function getStaffingMap(): Promise<Map<string, StaffingRecord>> {
  const [records, projectNames] = await Promise.all([
    base(TABLES.projectStaffing).select().all(),
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

// Distinct project codes a member is staffed on (any Project Staffing linking
// them). Used to scope a Project Manager's admin views to their own projects.
export async function getMemberStaffedProjectCodes(memberCode: string): Promise<string[]> {
  if (!memberCode) return [];
  const records = await base(TABLES.projectStaffing)
    .select({
      filterByFormula: `FIND("${escape(memberCode)}", ARRAYJOIN({${FIELDS.projectStaffing.memberCode}}))`,
      fields: [FIELDS.projectStaffing.projectCode],
    })
    .all();
  const set = new Set<string>();
  for (const r of records) {
    const c = str(r, FIELDS.projectStaffing.projectCode);
    if (c) set.add(c);
  }
  return [...set];
}

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
  // The Status field is the single source of truth. The legacy "Billing
  // Status" fold was dropped with the approval workflow: a row whose real
  // Status is "Submitted" now shows as Under review (it must clear approval
  // before it can be invoiced), regardless of any stale Billing Status value.
  const status = (str(r, FIELDS.timesheets.status) as TimesheetStatus) || "Draft";
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
    reviewMethod: (str(r, FIELDS.timesheets.reviewMethod) as ReviewMethod) || "",
    reviewedBy: str(r, FIELDS.timesheets.reviewedBy),
    reviewedAt: (r.get(FIELDS.timesheets.reviewedAt) as string | undefined) ?? null,
    reviewComment: str(r, FIELDS.timesheets.reviewComment),
    reviewTokenExpiresAt: (r.get(FIELDS.timesheets.reviewTokenExpiresAt) as string | undefined) ?? null,
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

// Per-staffing sequence number for a new timesheet — the trailing "_N" in the
// Timesheet Code formula. Previously set by an Airtable automation that counted
// the timesheets linked to the staffing; we replicate that here (count of the
// staffing's existing timesheets + 1) so the automation can be removed. Timesheets
// are soft-deleted (status), so the link count is monotonic and numbers don't
// collide. Best-effort: falls back to 1 if the staffing can't be read.
async function nextTimesheetSeq(staffingRecordId: string): Promise<number> {
  if (!staffingRecordId) return 1;
  try {
    const staffing = await base(TABLES.projectStaffing).find(staffingRecordId);
    const links = staffing.get(FIELDS.projectStaffing.timesheets);
    return (Array.isArray(links) ? links.length : 0) + 1;
  } catch (e) {
    console.error("nextTimesheetSeq failed:", e);
    return 1;
  }
}

export async function createTimesheet(input: TimesheetInput): Promise<string> {
  const fields = toAirtableFields(input);
  // Assign the per-staffing sequence number (drives the Timesheet Code suffix).
  fields[FIELDS.timesheets.id] = await nextTimesheetSeq(input.staffingRecordId);
  const [created] = await base(TABLES.timesheets).create([{ fields }]);
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
  // typecast lets Airtable auto-add the single-select choice (e.g. the new
  // "Cancelled") the first time it's written, instead of rejecting it.
  await base(TABLES.timesheets).update([{ id: recordId, fields: fields as FieldSet }], {
    typecast: true,
  });
}

// Admin-side timesheet status edit. Allows transitions to any status the
// admin should be able to set, including the new Invoiced / Paid options.
// Member-driven transitions (Draft ↔ Submitted) still go through the
// member endpoints.
export async function adminUpdateTimesheetStatus(
  recordId: string,
  status: TimesheetStatus,
): Promise<void> {
  await base(TABLES.timesheets).update(
    [
      {
        id: recordId,
        fields: { [FIELDS.timesheets.status]: status } as FieldSet,
      },
    ],
    { typecast: true },
  );
}

// ---------------------------------------------------------------------------
// Timesheet approval workflow: schema, audit trail, client-review tokens
// ---------------------------------------------------------------------------

let timesheetApprovalReady = false;

// Lazily provisions everything the approval workflow needs:
//  - the six review fields on the Timesheets table,
//  - the three review-config fields on the Project Staffing table,
//  - the append-only "Timesheet Reviews" audit table.
// Best-effort + cached: safe to await before every write. Returns false if the
// meta API is unreachable (the caller can still proceed for status-only writes).
export async function ensureTimesheetApprovalSchema(): Promise<boolean> {
  if (timesheetApprovalReady) return true;
  try {
    const metaUrl = `https://api.airtable.com/v0/meta/bases/${env.airtableBaseId}/tables`;
    const res = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${env.airtablePat}` },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      tables: Array<{ id: string; name: string; fields: Array<{ name: string }> }>;
    };

    const addFields = async (
      tableName: string,
      wanted: Array<{ name: string; type: string; options?: Record<string, unknown> }>,
    ) => {
      const table = data.tables.find((t) => t.name === tableName);
      if (!table) return;
      for (const f of wanted) {
        if (table.fields.some((x) => x.name === f.name)) continue;
        const body: Record<string, unknown> = { name: f.name, type: f.type };
        if (f.options) body.options = f.options;
        const r = await fetch(
          `https://api.airtable.com/v0/meta/bases/${env.airtableBaseId}/tables/${table.id}/fields`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.airtablePat}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          },
        );
        if (!r.ok) console.error(`ensureTimesheetApprovalSchema: add ${tableName}.${f.name} failed:`, await r.text().catch(() => ""));
      }
    };

    const T = FIELDS.timesheets;
    await addFields(TABLES.timesheets, [
      { name: T.reviewMethod, type: "singleLineText" },
      { name: T.reviewedBy, type: "singleLineText" },
      { name: T.reviewedAt, type: "singleLineText" },
      { name: T.reviewComment, type: "multilineText" },
      { name: T.reviewToken, type: "singleLineText" },
      { name: T.reviewTokenExpiresAt, type: "singleLineText" },
    ]);

    const S = FIELDS.projectStaffing;
    await addFields(TABLES.projectStaffing, [
      {
        name: S.reviewMethod,
        type: "singleSelect",
        options: { choices: [{ name: "Admin" }, { name: "Client" }] },
      },
      { name: S.reviewerName, type: "singleLineText" },
      { name: S.reviewerEmail, type: "singleLineText" },
    ]);

    if (!data.tables.some((t) => t.name === TABLES.timesheetReviews)) {
      const R = FIELDS.timesheetReviews;
      const create = await fetch(metaUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.airtablePat}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: TABLES.timesheetReviews,
          description: "Append-only audit trail of timesheet approval actions.",
          fields: [
            { name: R.entry, type: "singleLineText" },
            { name: R.timesheetId, type: "singleLineText" },
            { name: R.timesheetCode, type: "singleLineText" },
            { name: R.memberCode, type: "singleLineText" },
            { name: R.staffingCode, type: "singleLineText" },
            { name: R.action, type: "singleLineText" },
            { name: R.actor, type: "singleLineText" },
            { name: R.method, type: "singleLineText" },
            { name: R.comment, type: "multilineText" },
            { name: R.at, type: "singleLineText" },
          ],
        }),
      });
      if (!create.ok) console.error("ensureTimesheetApprovalSchema: create reviews table failed:", await create.text().catch(() => ""));
    }

    timesheetApprovalReady = true;
    return true;
  } catch (e) {
    console.error("ensureTimesheetApprovalSchema failed:", e);
    return false;
  }
}

export type TimesheetReviewAction =
  | "Submitted"
  | "Review Requested"
  | "Approved"
  | "Rejected"
  | "Cancelled"
  | "Resubmitted"
  | "Reopened"
  | "Status Changed"
  | "Edited";

export type TimesheetReviewEntry = {
  id: string;
  timesheetId: string;
  timesheetCode: string;
  action: string;
  actor: string;
  method: string;
  comment: string;
  at: string | null;
};

// Append one immutable row to the audit trail. Best-effort: a logging failure
// must never block the actual state transition, so we swallow errors here.
export async function recordTimesheetReview(input: {
  timesheetId: string;
  timesheetCode?: string;
  memberCode?: string;
  staffingCode?: string;
  action: TimesheetReviewAction;
  actor: string;
  method: ReviewMethod | "System" | "";
  comment?: string;
}): Promise<void> {
  try {
    await ensureTimesheetApprovalSchema();
    const R = FIELDS.timesheetReviews;
    const at = new Date().toISOString();
    await base(TABLES.timesheetReviews).create([
      {
        fields: {
          [R.entry]: `${input.timesheetCode || input.timesheetId} · ${input.action} · ${at}`,
          [R.timesheetId]: input.timesheetId,
          [R.timesheetCode]: input.timesheetCode ?? "",
          [R.memberCode]: input.memberCode ?? "",
          [R.staffingCode]: input.staffingCode ?? "",
          [R.action]: input.action,
          [R.actor]: input.actor,
          [R.method]: input.method,
          [R.comment]: input.comment ?? "",
          [R.at]: at,
        } as FieldSet,
      },
    ]);
  } catch (e) {
    console.error("recordTimesheetReview failed:", e);
  }
}

export async function listTimesheetReviews(timesheetId: string): Promise<TimesheetReviewEntry[]> {
  if (!timesheetId) return [];
  try {
    await ensureTimesheetApprovalSchema();
    const R = FIELDS.timesheetReviews;
    const records = await base(TABLES.timesheetReviews)
      .select({ filterByFormula: `{${R.timesheetId}} = "${escape(timesheetId)}"` })
      .all();
    return records
      .map((r) => ({
        id: r.id,
        timesheetId: str(r, R.timesheetId),
        timesheetCode: str(r, R.timesheetCode),
        action: str(r, R.action),
        actor: str(r, R.actor),
        method: str(r, R.method),
        comment: str(r, R.comment),
        at: (r.get(R.at) as string | undefined) ?? null,
      }))
      .sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
  } catch (e) {
    console.error("listTimesheetReviews failed:", e);
    return [];
  }
}

// A single-use, expiring token for the client-review email. 18 random bytes of
// Web Crypto entropy (matches the surveys pattern). Expiry is stored on the
// timesheet; single-use is enforced by clearing the token once a decision lands
// and by requiring the timesheet to still be "Submitted".
export function generateReviewToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function setTimesheetReviewToken(
  recordId: string,
  token: string,
  expiresAtIso: string,
): Promise<void> {
  await ensureTimesheetApprovalSchema();
  await base(TABLES.timesheets).update([
    {
      id: recordId,
      fields: {
        [FIELDS.timesheets.reviewMethod]: "Client",
        [FIELDS.timesheets.reviewToken]: token,
        [FIELDS.timesheets.reviewTokenExpiresAt]: expiresAtIso,
      } as FieldSet,
    },
  ]);
}

// Resolve a client-review token to its timesheet. Returns null for unknown
// tokens. Callers must still check status === "Submitted" and expiry.
export async function getTimesheetByReviewToken(token: string): Promise<TimesheetRecord | null> {
  if (!token) return null;
  try {
    await ensureTimesheetApprovalSchema();
    const staffings = await getStaffingMap();
    const records = await base(TABLES.timesheets)
      .select({
        filterByFormula: `{${FIELDS.timesheets.reviewToken}} = "${escape(token)}"`,
        maxRecords: 1,
      })
      .firstPage();
    return records[0] ? toTimesheet(records[0], staffings) : null;
  } catch (e) {
    console.error("getTimesheetByReviewToken failed:", e);
    return null;
  }
}

// Count of timesheets still sitting in the legacy "Invoiced" state (from the
// pre-approval-workflow era) so the admin UI can offer a one-click reset.
export async function countLegacyInvoicedTimesheets(): Promise<number> {
  const records = await base(TABLES.timesheets)
    .select({
      filterByFormula: `{${FIELDS.timesheets.status}} = "Invoiced"`,
      fields: [FIELDS.timesheets.status],
    })
    .all();
  return records.length;
}

// One-shot cutover migration: legacy "Invoiced" timesheets (marked invoiced
// under the old flow, before the approval step existed) are reset to
// "Submitted" so they re-enter the review workflow as Under review. Clears the
// review fields, any client-review token, and the stale legacy Billing Status.
// Genuinely-Paid weeks are left untouched. Run ONCE at cutover — a later re-run
// would also revert weeks invoiced through the new flow.
export async function migrateLegacyInvoicedTimesheets(): Promise<{ updated: number }> {
  await ensureTimesheetApprovalSchema();
  const records = await base(TABLES.timesheets)
    .select({ filterByFormula: `{${FIELDS.timesheets.status}} = "Invoiced"` })
    .all();
  const updates = records.map((r) => ({
    id: r.id,
    fields: {
      [FIELDS.timesheets.status]: "Submitted",
      [FIELDS.timesheets.billingStatus]: "",
      [FIELDS.timesheets.reviewMethod]: "",
      [FIELDS.timesheets.reviewedBy]: "",
      [FIELDS.timesheets.reviewedAt]: "",
      [FIELDS.timesheets.reviewComment]: "",
      [FIELDS.timesheets.reviewToken]: "",
      [FIELDS.timesheets.reviewTokenExpiresAt]: "",
    } as FieldSet,
  }));
  for (let i = 0; i < updates.length; i += 10) {
    await base(TABLES.timesheets).update(updates.slice(i, i + 10), { typecast: true });
  }
  return { updated: updates.length };
}

// Timesheets sitting in "Paid" — a status that shouldn't apply to timesheets
// (Paid belongs to payments). Counted so the admin UI can offer a one-click fix.
export async function countPaidTimesheets(): Promise<number> {
  const records = await base(TABLES.timesheets)
    .select({
      filterByFormula: `{${FIELDS.timesheets.status}} = "Paid"`,
      fields: [FIELDS.timesheets.status],
    })
    .all();
  return records.length;
}

// Migrate timesheets stuck at "Paid" back to "Approved" — a timesheet's
// lifecycle ends at Approved; billed/paid is tracked on the payment. The
// approval fields are left intact (the work was accepted). Re-runnable and
// safe (only touches Paid rows). The billing-status cascade no longer sets
// this, so after one run new Paid timesheets shouldn't reappear.
export async function migratePaidTimesheetsToApproved(): Promise<{ updated: number }> {
  await ensureTimesheetApprovalSchema();
  const records = await base(TABLES.timesheets)
    .select({ filterByFormula: `{${FIELDS.timesheets.status}} = "Paid"` })
    .all();
  const updates = records.map((r) => ({
    id: r.id,
    fields: {
      [FIELDS.timesheets.status]: "Approved",
      [FIELDS.timesheets.billingStatus]: "",
    } as FieldSet,
  }));
  for (let i = 0; i < updates.length; i += 10) {
    await base(TABLES.timesheets).update(updates.slice(i, i + 10), { typecast: true });
  }
  return { updated: updates.length };
}

// Admin-side single-timesheet fetch (no member-ownership scoping) so admin
// routes can read the current status before enforcing a transition.
export async function getAdminTimesheetById(recordId: string): Promise<TimesheetRecord | null> {
  try {
    const [r, staffings] = await Promise.all([
      base(TABLES.timesheets).find(recordId),
      getStaffingMap(),
    ]);
    return toTimesheet(r, staffings);
  } catch {
    return null;
  }
}

// Clear any live client-review token (used when a pending timesheet is
// cancelled or reopened, so the emailed link stops resolving).
export async function clearTimesheetReviewToken(recordId: string): Promise<void> {
  try {
    await ensureTimesheetApprovalSchema();
    await base(TABLES.timesheets).update([
      {
        id: recordId,
        fields: {
          [FIELDS.timesheets.reviewToken]: "",
          [FIELDS.timesheets.reviewTokenExpiresAt]: "",
        } as FieldSet,
      },
    ]);
  } catch (e) {
    console.error("clearTimesheetReviewToken failed:", e);
  }
}

// Apply an Approved/Rejected decision: write the denormalized review fields +
// status, clear the client-review token so its link can't be reused, and append
// an audit row. `method` records who decided (Admin vs Client).
export async function decideTimesheet(input: {
  recordId: string;
  timesheetCode?: string;
  memberCode?: string;
  staffingCode?: string;
  decision: "Approved" | "Rejected";
  reviewMethod: ReviewMethod;
  reviewedBy: string;
  comment?: string;
}): Promise<void> {
  await ensureTimesheetApprovalSchema();
  const at = new Date().toISOString();
  await base(TABLES.timesheets).update(
    [
      {
        id: input.recordId,
        fields: {
          [FIELDS.timesheets.status]: input.decision,
          [FIELDS.timesheets.reviewMethod]: input.reviewMethod,
          [FIELDS.timesheets.reviewedBy]: input.reviewedBy,
          [FIELDS.timesheets.reviewedAt]: at,
          [FIELDS.timesheets.reviewComment]: input.comment ?? "",
          [FIELDS.timesheets.reviewToken]: "",
          [FIELDS.timesheets.reviewTokenExpiresAt]: "",
        } as FieldSet,
      },
    ],
    { typecast: true },
  );
  await recordTimesheetReview({
    timesheetId: input.recordId,
    timesheetCode: input.timesheetCode,
    memberCode: input.memberCode,
    staffingCode: input.staffingCode,
    action: input.decision,
    actor: input.reviewedBy,
    method: input.reviewMethod,
    comment: input.comment,
  });
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
    // An explicitly set status wins so admins can override; otherwise we
    // fall back to the value derived from days logged vs allocated.
    status:
      (str(r, FIELDS.projectStaffing.status) as StaffingStatus | "") ||
      deriveStaffingStatus(days, daysUsedByStaffingId?.get(r.id) ?? 0),
    rawStatus: str(r, FIELDS.projectStaffing.status) as StaffingStatus | "",
    notes: str(r, FIELDS.projectStaffing.notes),
    reviewMethod: (str(r, FIELDS.projectStaffing.reviewMethod) as ReviewMethod) || "",
    reviewerName: str(r, FIELDS.projectStaffing.reviewerName),
    reviewerEmail: str(r, FIELDS.projectStaffing.reviewerEmail),
  };
}

const getDaysUsedByStaffingId = cache(async function getDaysUsedByStaffingId(): Promise<
  Map<string, number>
> {
  // Sum total hours per Project Staffing across the logged lifecycle
  // (Submitted / Approved / Invoiced / Paid), then convert to days at
  // HOURS_PER_DAY = 8. Draft / Rejected / Cancelled / Deleted never count.
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
    if (!LOGGED_TIMESHEET_STATUSES.includes(status)) continue;
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
});

const getMemberCodeMap = cache(async function getMemberCodeMap(): Promise<Map<string, string>> {
  const records = await base(TABLES.networkMembers)
    .select({ fields: [FIELDS.networkMembers.memberCode] })
    .all();
  return new Map(records.map((r) => [r.id, str(r, FIELDS.networkMembers.memberCode)]));
});

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
  reviewMethod: ReviewMethod | "";
  reviewerName: string;
  reviewerEmail: string;
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
    [FIELDS.projectStaffing.reviewMethod]: input.reviewMethod === "" ? null : input.reviewMethod,
    [FIELDS.projectStaffing.reviewerName]: input.reviewerName,
    [FIELDS.projectStaffing.reviewerEmail]: input.reviewerEmail,
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

// Combine the project code and the member's code into the staffing code, e.g.
// "ECS-2026-05" + "BOUTH1" -> "ECS-2026-05_BOUTH1". This mirrors the examples
// already in the database. The code used to be computed by an Airtable formula;
// the application now owns it so it is stable, visible before the record
// round-trips, and can be regenerated when the project or member changes. If a
// member is re-staffed on the same project (a genuine collision) a numeric
// suffix keeps the code unique.
export function deriveStaffingCode(projectCode: string, memberCode: string): string {
  const p = (projectCode || "").trim();
  const m = (memberCode || "").trim();
  if (!p || !m) return "";
  return `${p}_${m}`;
}

async function resolveStaffingCode(
  projectCode: string,
  memberRecordId: string,
  excludeRecordId?: string,
): Promise<string> {
  const memberCode = (await getMemberCodeMap()).get(memberRecordId) ?? "";
  const baseCode = deriveStaffingCode(projectCode, memberCode);
  if (!baseCode) return "";
  const records = await base(TABLES.projectStaffing)
    .select({ fields: [FIELDS.projectStaffing.staffingCode] })
    .all();
  const used = new Set(
    records
      .filter((r) => r.id !== excludeRecordId)
      .map((r) => str(r, FIELDS.projectStaffing.staffingCode))
      .filter(Boolean),
  );
  if (!used.has(baseCode)) return baseCode;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${baseCode}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return baseCode;
}

// Write staffing fields, tolerating the migration window where the Airtable
// "Staffing Code" field may still be a computed formula (which rejects any
// written value). If the write is refused for that reason we retry without the
// code so staffing creation never hard-fails; once the field is switched to
// plain text in Airtable the app-generated code takes over automatically.
async function writeStaffing(
  recordId: string | null,
  fields: Record<string, unknown>,
): Promise<string> {
  const run = async (f: Record<string, unknown>): Promise<string> => {
    if (recordId) {
      await base(TABLES.projectStaffing).update([{ id: recordId, fields: f as FieldSet }]);
      return recordId;
    }
    const [created] = await base(TABLES.projectStaffing).create([{ fields: f as FieldSet }]);
    return created.id;
  };
  try {
    return await run(fields);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/cannot accept a value because the field is computed/i.test(msg)) throw e;
    const { [FIELDS.projectStaffing.staffingCode]: _omit, ...rest } = fields;
    void _omit;
    return run(rest);
  }
}

export async function createStaffing(input: StaffingInput): Promise<string> {
  assertHasMember(input);
  // The review-config fields are lazily created; make sure they exist before
  // we write to them (a plain create/update, unlike typecast, errors on an
  // unknown field name).
  await ensureTimesheetApprovalSchema();
  const staffingCode = await resolveStaffingCode(input.projectCode, input.memberRecordIds[0]);
  const fields = staffingFields(input);
  if (staffingCode) fields[FIELDS.projectStaffing.staffingCode] = staffingCode;
  return writeStaffing(null, fields);
}

export async function updateStaffing(recordId: string, input: StaffingInput): Promise<void> {
  assertHasMember(input);
  await ensureTimesheetApprovalSchema();
  const staffingCode = await resolveStaffingCode(
    input.projectCode,
    input.memberRecordIds[0],
    recordId,
  );
  const fields = staffingFields(input);
  if (staffingCode) fields[FIELDS.projectStaffing.staffingCode] = staffingCode;
  await writeStaffing(recordId, fields);
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
    // Actual logged effort counts the same states as days-used (Submitted,
    // Approved, Invoiced, Paid) — Draft/Rejected/Cancelled/Deleted don't.
    if (LOGGED_TIMESHEET_STATUSES.includes(ts.status)) {
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
    // Actual logged effort counts the same states as days-used (Submitted,
    // Approved, Invoiced, Paid); skip Draft/Rejected/Cancelled/Deleted.
    if (!LOGGED_TIMESHEET_STATUSES.includes(status)) continue;
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

const getClientIndex = cache(async function getClientIndex(): Promise<
  Map<string, { code: string; name: string }>
> {
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
});

const buildLookupMaps = cache(async function buildLookupMaps(): Promise<LookupMaps> {
  const [memberCodeById, clientById, projectById] = await Promise.all([
    getMemberCodeMap(),
    getClientIndex(),
    getProjectIndex(),
  ]);
  return { memberCodeById, clientById, projectById };
});

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

// ---------------------------------------------------------------------------
// Document search — a unified index of every saved PDF across the portal
// (contracts, member CVs, member invoices) so admins can fuzzy-search one
// place for any document.
// ---------------------------------------------------------------------------

export type DocumentKind = "Contract" | "CV" | "Invoice";

export type DocumentRecord = {
  id: string; // `${kind}:${recordId}`
  kind: DocumentKind;
  title: string;
  subtitle: string;
  date: string | null; // ISO-ish, best-effort, for sorting
  url: string;
  filename: string;
  // Space-joined lowercase haystack the client fuzzy-matches against.
  keywords: string;
};

export async function listAllDocuments(): Promise<DocumentRecord[]> {
  const [contracts, members, invoices, payments] = await Promise.all([
    listAllContracts(),
    listAllMembers(),
    listAllInvoices(),
    listPayments(),
  ]);

  const docs: DocumentRecord[] = [];

  for (const c of contracts) {
    if (!c.pdf?.url) continue;
    const typeLabel = c.contractType || c.otherDescription || c.side || "Contract";
    const parties = [...c.clientNames, ...c.clientCodes, ...c.memberCodes].filter(Boolean);
    docs.push({
      id: `Contract:${c.id}`,
      kind: "Contract",
      title: typeLabel,
      subtitle: [c.side, parties.join(", "), c.projectCodes.join(", ")]
        .filter(Boolean)
        .join(" · "),
      date: c.signatureDate || c.expiryDate || null,
      url: c.pdf.url,
      filename: c.pdf.filename || "contract.pdf",
      keywords: [
        typeLabel,
        c.side,
        c.contractType,
        c.otherDescription,
        ...c.clientNames,
        ...c.clientCodes,
        ...c.projectCodes,
        c.projectCode,
        ...c.memberCodes,
        c.signatory1?.name,
        c.signatory1?.company,
        c.signatory2?.name,
        c.signatory2?.company,
        c.keyTerms,
        c.pdf.filename,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    });
  }

  for (const m of members) {
    if (!m.cv?.url) continue;
    docs.push({
      id: `CV:${m.id}`,
      kind: "CV",
      title: m.fullName || m.memberCode,
      subtitle: [m.memberCode, m.role, m.title].filter(Boolean).join(" · "),
      date: null,
      url: m.cv.url,
      filename: m.cv.filename || "cv.pdf",
      keywords: [m.fullName, m.memberCode, m.role, m.title, m.country, m.cv.filename]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    });
  }

  for (const i of invoices) {
    if (!i.pdf?.url) continue;
    docs.push({
      id: `Invoice:${i.id}`,
      kind: "Invoice",
      title: i.invoiceCode || "Invoice",
      subtitle: [i.memberName || i.memberCode, i.staffingCode, i.projectName || i.projectCode]
        .filter(Boolean)
        .join(" · "),
      date: i.submissionDate,
      url: i.pdf.url,
      filename: i.pdf.filename || "invoice.pdf",
      keywords: [
        i.invoiceCode,
        i.memberName,
        i.memberCode,
        i.staffingCode,
        i.projectCode,
        i.projectName,
        i.currency,
        i.comment,
        i.pdf.filename,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    });
  }

  // Invoice PDFs attached to payments by an admin (e.g. a new payment with an
  // uploaded invoice). These live on the payment, not a member invoice, so
  // they'd otherwise be invisible outside the payment record.
  for (const p of payments) {
    if (!p.invoicePdf?.url) continue;
    const label = p.invoiceReference || p.paymentCode || "Invoice";
    docs.push({
      id: `Invoice:payment-${p.id}`,
      kind: "Invoice",
      title: label,
      subtitle: [p.direction, p.type, p.beneficiary].filter(Boolean).join(" · "),
      date: p.invoiceDate ?? p.dueDate ?? null,
      url: p.invoicePdf.url,
      filename: p.invoicePdf.filename || "invoice.pdf",
      keywords: [
        p.paymentCode,
        p.invoiceReference,
        p.beneficiary,
        p.type,
        p.direction,
        p.invoiceCurrency,
        p.comment,
        p.invoicePdf.filename,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    });
  }

  return docs;
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

// Attach (or replace) a project's SOW: finds the project's existing
// Client-side SOW contract and replaces its PDF, or creates a new SOW
// contract linked to the project + client. Keeps Projects and Legal in sync.
// Returns the resulting PDF ref.
export async function attachProjectSow(
  projectId: string,
  filename: string,
  base64: string,
): Promise<{ url: string; filename: string } | null> {
  const [project, contracts] = await Promise.all([
    getProjectById(projectId),
    listAllContracts(),
  ]);
  const existing = contracts.find(
    (c) =>
      c.projectRecordIds.includes(projectId) &&
      /sow|statement of work/i.test(c.contractType || ""),
  );
  let contractId: string;
  if (existing) {
    contractId = existing.id;
  } else {
    const today = new Date().toISOString().slice(0, 10);
    const created = await createContract({
      side: "Client",
      contractType: "SOW",
      clientRecordIds: project?.clientRecordIds ?? [],
      projectRecordIds: [projectId],
      projectCode: project?.projectCode ?? "",
      signatureDate: today,
    });
    contractId = created.id;
  }
  await attachContractPdf(contractId, filename, base64);
  const fresh = await getContractById(contractId);
  return fresh?.pdf ? { url: fresh.pdf.url, filename: fresh.pdf.filename || filename } : null;
}

// Ensure the "Invoice PDF" attachment field exists on the Payments
// table. Created lazily via the meta API (the MCP create_field flow
// needs a manual approval click; the server PAT has schema scope and
// doesn't). Idempotent: a no-op once the column exists.
export async function ensurePaymentInvoicePdfField(): Promise<void> {
  const metaUrl = `https://api.airtable.com/v0/meta/bases/${env.airtableBaseId}/tables`;
  const res = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${env.airtablePat}` },
    cache: "no-store",
  });
  if (!res.ok) return; // best-effort; the attach call will surface a clear error
  const data = (await res.json()) as {
    tables: Array<{ id: string; name: string; fields: Array<{ name: string }> }>;
  };
  const table = data.tables.find((t) => t.name === TABLES.payments);
  if (!table) return;
  if (table.fields.some((f) => f.name === FIELDS.payments.invoicePdf)) return;
  await fetch(
    `https://api.airtable.com/v0/meta/bases/${env.airtableBaseId}/tables/${table.id}/fields`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.airtablePat}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: FIELDS.payments.invoicePdf,
        type: "multipleAttachments",
        description:
          "Scanned / PDF copy of the invoice for this payment. Uploaded via the HTP42 admin portal.",
      }),
    },
  );
}

// Attach a PDF to the Payments row's "Invoice PDF" field via Airtable's
// content endpoint. Mirrors attachContractPdf.
export async function attachPaymentPdf(
  recordId: string,
  filename: string,
  base64: string,
): Promise<void> {
  const url = `https://content.airtable.com/v0/${env.airtableBaseId}/${recordId}/${encodeURIComponent(FIELDS.payments.invoicePdf)}/uploadAttachment`;
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

// ---------------------------------------------------------------------------
// Admin: Opportunities (sales pipeline). A lightweight CRM: a potential
// project tied to a client that can later be converted into a real Project.
// The table is created lazily via the meta API (like the fields elsewhere)
// so no manual Airtable setup is needed.
// ---------------------------------------------------------------------------

export type OpportunityStage = "Cold" | "In Discussion" | "Advanced";
export const OPPORTUNITY_STAGES: OpportunityStage[] = ["Cold", "In Discussion", "Advanced"];

export type OpportunityStatus =
  | "In Progress"
  | "At Risk"
  | "On Hold"
  | "Won"
  | "Lost";
export const OPPORTUNITY_STATUSES: OpportunityStatus[] = [
  "In Progress",
  "At Risk",
  "On Hold",
  "Won",
  "Lost",
];

export type OpportunityRecord = {
  id: string;
  title: string;
  clientRecordIds: string[];
  clientCode: string;
  clientName: string;
  stage: OpportunityStage | "";
  status: OpportunityStatus | "";
  statusNote: string;
  contact: string;
  description: string;
  estimatedValue: number | null;
  currency: Currency | "";
  expectedStart: string | null;
  convertedProject: string;
};

export type OpportunityInput = {
  title: string;
  clientRecordIds: string[];
  stage: OpportunityStage | "";
  status: OpportunityStatus | "";
  statusNote: string;
  contact: string;
  description: string;
  estimatedValue: number | null;
  currency: Currency | "";
  expectedStart: string | null;
  convertedProject?: string;
};

function opportunityFromRecord(
  r: AirtableRecord<FieldSet>,
  clientById: Map<string, { code: string; name: string }>,
): OpportunityRecord {
  const clientRecordIds = linkedIds(r, FIELDS.opportunities.client);
  const c = clientRecordIds[0] ? clientById.get(clientRecordIds[0]) : undefined;
  return {
    id: r.id,
    title: str(r, FIELDS.opportunities.title),
    clientRecordIds,
    clientCode: c?.code ?? "",
    clientName: c?.name ?? "",
    stage: (str(r, FIELDS.opportunities.stage) as OpportunityStage) || "",
    status: (str(r, FIELDS.opportunities.status) as OpportunityStatus) || "",
    statusNote: str(r, FIELDS.opportunities.statusNote),
    contact: str(r, FIELDS.opportunities.contact),
    description: str(r, FIELDS.opportunities.description),
    estimatedValue: numOrNull(r, FIELDS.opportunities.estimatedValue),
    currency: (str(r, FIELDS.opportunities.currency) as Currency) || "",
    expectedStart: dateOrNull(r, FIELDS.opportunities.expectedStart),
    convertedProject: str(r, FIELDS.opportunities.convertedProject),
  };
}

// Create the Opportunities table (with its fields) if it doesn't exist yet.
// Idempotent + cached. Returns true when the table is present/ready.
let opportunitiesTableReady = false;
export async function ensureOpportunitiesSchema(): Promise<boolean> {
  if (opportunitiesTableReady) return true;
  try {
    const metaUrl = `https://api.airtable.com/v0/meta/bases/${env.airtableBaseId}/tables`;
    const res = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${env.airtablePat}` },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      tables: Array<{ id: string; name: string }>;
    };
    if (data.tables.some((t) => t.name === TABLES.opportunities)) {
      opportunitiesTableReady = true;
      return true;
    }
    const clientsTable = data.tables.find((t) => t.name === TABLES.clients);
    const F = FIELDS.opportunities;
    const fields: Array<Record<string, unknown>> = [
      { name: F.title, type: "singleLineText" },
      ...(clientsTable
        ? [
            {
              name: F.client,
              type: "multipleRecordLinks",
              options: { linkedTableId: clientsTable.id },
            },
          ]
        : []),
      {
        name: F.stage,
        type: "singleSelect",
        options: { choices: OPPORTUNITY_STAGES.map((s) => ({ name: s })) },
      },
      {
        name: F.status,
        type: "singleSelect",
        options: { choices: OPPORTUNITY_STATUSES.map((s) => ({ name: s })) },
      },
      { name: F.statusNote, type: "multilineText" },
      { name: F.contact, type: "singleLineText" },
      { name: F.description, type: "multilineText" },
      { name: F.estimatedValue, type: "number", options: { precision: 2 } },
      {
        name: F.currency,
        type: "singleSelect",
        options: { choices: (CURRENCIES as readonly string[]).map((c) => ({ name: c })) },
      },
      { name: F.expectedStart, type: "date", options: { dateFormat: { name: "iso" } } },
      { name: F.convertedProject, type: "singleLineText" },
    ];
    const create = await fetch(metaUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.airtablePat}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: TABLES.opportunities,
        description: "Sales pipeline: potential projects that can convert into a Project.",
        fields,
      }),
    });
    if (create.ok) {
      opportunitiesTableReady = true;
      return true;
    }
    console.error("Failed to create Opportunities table:", await create.text().catch(() => ""));
    return false;
  } catch (e) {
    console.error("ensureOpportunitiesSchema failed:", e);
    return false;
  }
}

export async function listOpportunities(): Promise<OpportunityRecord[]> {
  try {
    const ok = await ensureOpportunitiesSchema();
    if (!ok) return [];
    const [records, clientById] = await Promise.all([
      base(TABLES.opportunities).select().all(),
      getClientIndex(),
    ]);
    return records.map((r) => opportunityFromRecord(r, clientById));
  } catch (e) {
    console.error("listOpportunities failed:", e);
    return [];
  }
}

export async function getOpportunityById(recordId: string): Promise<OpportunityRecord | null> {
  try {
    const [r, clientById] = await Promise.all([
      base(TABLES.opportunities).find(recordId),
      getClientIndex(),
    ]);
    return opportunityFromRecord(r, clientById);
  } catch {
    return null;
  }
}

function opportunityFields(input: OpportunityInput): Record<string, unknown> {
  const F = FIELDS.opportunities;
  const fields: Record<string, unknown> = {
    [F.title]: input.title,
    [F.client]: input.clientRecordIds,
    [F.stage]: input.stage === "" ? null : input.stage,
    [F.status]: input.status === "" ? null : input.status,
    [F.statusNote]: input.statusNote,
    [F.contact]: input.contact,
    [F.description]: input.description,
    [F.estimatedValue]: input.estimatedValue,
    [F.currency]: input.currency === "" ? null : input.currency,
    [F.expectedStart]: input.expectedStart,
  };
  if (input.convertedProject !== undefined) {
    fields[F.convertedProject] = input.convertedProject;
  }
  return fields;
}

export async function createOpportunity(input: OpportunityInput): Promise<string> {
  await ensureOpportunitiesSchema();
  const [created] = await base(TABLES.opportunities).create(
    [{ fields: opportunityFields(input) as FieldSet }],
    { typecast: true },
  );
  return created.id;
}

export async function updateOpportunity(recordId: string, input: OpportunityInput): Promise<void> {
  await base(TABLES.opportunities).update(
    [{ id: recordId, fields: opportunityFields(input) as FieldSet }],
    { typecast: true },
  );
}

// Partial update — used to mark an opportunity Won + stamp the created project.
export async function patchOpportunity(
  recordId: string,
  patch: Partial<{ status: OpportunityStatus | ""; convertedProject: string; statusNote: string }>,
): Promise<void> {
  const F = FIELDS.opportunities;
  const fields: Record<string, unknown> = {};
  if (patch.status !== undefined) fields[F.status] = patch.status === "" ? null : patch.status;
  if (patch.convertedProject !== undefined) fields[F.convertedProject] = patch.convertedProject;
  if (patch.statusNote !== undefined) fields[F.statusNote] = patch.statusNote;
  if (Object.keys(fields).length === 0) return;
  await base(TABLES.opportunities).update(
    [{ id: recordId, fields: fields as FieldSet }],
    { typecast: true },
  );
}

export async function deleteOpportunity(recordId: string): Promise<void> {
  await base(TABLES.opportunities).destroy([recordId]);
}

// ---------------------------------------------------------------------------
// Client feedback surveys. Each row is one recipient's survey instance,
// reached by an unguessable token link (no login). One submission per link.
// A "campaign" is just the set of rows sharing a project; the admin view
// consolidates by project. The table is created lazily via the meta API.
// ---------------------------------------------------------------------------

export type SurveyMemberRating = {
  code: string;
  name: string;
  grade: number | null;
  wentWell: string;
  improve: string;
};

export type SurveyTeamMember = { code: string; name: string };

export type SurveyRecord = {
  id: string;
  token: string;
  projectCode: string;
  projectName: string;
  recipientName: string;
  recipientEmail: string;
  sentAt: string | null;
  completedAt: string | null;
  overallGrade: number | null;
  overallWentWell: string;
  overallImprove: string;
  members: SurveyTeamMember[];
  memberRatings: SurveyMemberRating[];
  emailSent: boolean;
  emailError: string;
};

function parseJsonArray<T>(raw: string): T[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

function surveyFromRecord(r: AirtableRecord<FieldSet>): SurveyRecord {
  const F = FIELDS.clientSurveys;
  return {
    id: r.id,
    token: str(r, F.token),
    projectCode: str(r, F.projectCode),
    projectName: str(r, F.projectName),
    recipientName: str(r, F.recipientName),
    recipientEmail: str(r, F.recipientEmail),
    sentAt: str(r, F.sentAt) || null,
    completedAt: str(r, F.completedAt) || null,
    overallGrade: numOrNull(r, F.overallGrade),
    overallWentWell: str(r, F.overallWentWell),
    overallImprove: str(r, F.overallImprove),
    members: parseJsonArray<SurveyTeamMember>(str(r, F.membersJson)),
    memberRatings: parseJsonArray<SurveyMemberRating>(str(r, F.memberRatingsJson)),
    emailSent: r.get(F.emailSent) === true,
    emailError: str(r, F.emailError),
  };
}

let clientSurveysTableReady = false;
export async function ensureClientSurveysSchema(): Promise<boolean> {
  if (clientSurveysTableReady) return true;
  try {
    const metaUrl = `https://api.airtable.com/v0/meta/bases/${env.airtableBaseId}/tables`;
    const res = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${env.airtablePat}` },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { tables: Array<{ name: string }> };
    if (data.tables.some((t) => t.name === TABLES.clientSurveys)) {
      clientSurveysTableReady = true;
      return true;
    }
    const F = FIELDS.clientSurveys;
    const fields: Array<Record<string, unknown>> = [
      { name: F.token, type: "singleLineText" },
      { name: F.projectCode, type: "singleLineText" },
      { name: F.projectName, type: "singleLineText" },
      { name: F.recipientName, type: "singleLineText" },
      { name: F.recipientEmail, type: "singleLineText" },
      { name: F.sentAt, type: "singleLineText" },
      { name: F.completedAt, type: "singleLineText" },
      { name: F.overallGrade, type: "number", options: { precision: 1 } },
      { name: F.overallWentWell, type: "multilineText" },
      { name: F.overallImprove, type: "multilineText" },
      { name: F.membersJson, type: "multilineText" },
      { name: F.memberRatingsJson, type: "multilineText" },
      { name: F.emailSent, type: "checkbox", options: { color: "greenBright", icon: "check" } },
      { name: F.emailError, type: "singleLineText" },
    ];
    const create = await fetch(metaUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.airtablePat}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: TABLES.clientSurveys,
        description: "Client feedback surveys — one row per recipient link.",
        fields,
      }),
    });
    if (create.ok) {
      clientSurveysTableReady = true;
      return true;
    }
    console.error("Failed to create Client Surveys table:", await create.text().catch(() => ""));
    return false;
  } catch (e) {
    console.error("ensureClientSurveysSchema failed:", e);
    return false;
  }
}

// The staffed team on a project (unique members), for the per-member ratings.
export async function getProjectTeam(projectCode: string): Promise<SurveyTeamMember[]> {
  if (!projectCode) return [];
  const [staffings, members] = await Promise.all([listAllStaffings(), listAllMembers()]);
  const memberById = new Map(members.map((m) => [m.id, m]));
  const out = new Map<string, SurveyTeamMember>();
  for (const s of staffings) {
    if (s.projectCode !== projectCode) continue;
    s.memberRecordIds.forEach((id, i) => {
      const m = memberById.get(id);
      const code = m?.memberCode ?? s.memberCodes[i] ?? id;
      const name = m?.fullName ?? code;
      if (!out.has(code)) out.set(code, { code, name });
    });
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function listSurveys(): Promise<SurveyRecord[]> {
  try {
    const ok = await ensureClientSurveysSchema();
    if (!ok) return [];
    const records = await base(TABLES.clientSurveys).select().all();
    return records.map(surveyFromRecord);
  } catch (e) {
    console.error("listSurveys failed:", e);
    return [];
  }
}

export async function getSurveyByToken(token: string): Promise<SurveyRecord | null> {
  if (!token) return null;
  try {
    await ensureClientSurveysSchema();
    const records = await base(TABLES.clientSurveys)
      .select({
        filterByFormula: `{${FIELDS.clientSurveys.token}} = "${escape(token)}"`,
        maxRecords: 1,
      })
      .firstPage();
    return records[0] ? surveyFromRecord(records[0]) : null;
  } catch (e) {
    console.error("getSurveyByToken failed:", e);
    return null;
  }
}

export type SurveyRecipientInput = {
  projectCode: string;
  projectName: string;
  recipientName: string;
  recipientEmail: string;
  members: SurveyTeamMember[];
};

// Create one survey row (one recipient link) and return the token + id.
export async function createSurveyRecipient(
  input: SurveyRecipientInput,
): Promise<{ id: string; token: string }> {
  await ensureClientSurveysSchema();
  // Web Crypto (global in Node 18+) — avoids a node:crypto import that would
  // break the client bundle, since this module is also imported by client UI.
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const F = FIELDS.clientSurveys;
  const [created] = await base(TABLES.clientSurveys).create([
    {
      fields: {
        [F.token]: token,
        [F.projectCode]: input.projectCode,
        [F.projectName]: input.projectName,
        [F.recipientName]: input.recipientName,
        [F.recipientEmail]: input.recipientEmail,
        [F.sentAt]: new Date().toISOString(),
        [F.membersJson]: JSON.stringify(input.members),
      } as FieldSet,
    },
  ]);
  return { id: created.id, token };
}

export async function markSurveyEmail(
  recordId: string,
  result: { ok: true } | { ok: false; error: string },
): Promise<void> {
  const F = FIELDS.clientSurveys;
  await base(TABLES.clientSurveys).update([
    {
      id: recordId,
      fields: (result.ok
        ? { [F.emailSent]: true, [F.emailError]: "" }
        : { [F.emailSent]: false, [F.emailError]: result.error.slice(0, 250) }) as FieldSet,
    },
  ]);
}

export type SurveySubmission = {
  overallGrade: number | null;
  overallWentWell: string;
  overallImprove: string;
  memberRatings: SurveyMemberRating[];
};

// Submit a survey by token. Returns false if the token is unknown or the
// survey has already been completed (one submission per link).
export async function submitSurvey(token: string, sub: SurveySubmission): Promise<boolean> {
  const existing = await getSurveyByToken(token);
  if (!existing) return false;
  if (existing.completedAt) return false;
  const F = FIELDS.clientSurveys;
  await base(TABLES.clientSurveys).update([
    {
      id: existing.id,
      fields: {
        [F.completedAt]: new Date().toISOString(),
        [F.overallGrade]: sub.overallGrade,
        [F.overallWentWell]: sub.overallWentWell,
        [F.overallImprove]: sub.overallImprove,
        [F.memberRatingsJson]: JSON.stringify(sub.memberRatings),
      } as FieldSet,
    },
  ]);
  return true;
}

export async function deleteSurvey(recordId: string): Promise<void> {
  await base(TABLES.clientSurveys).destroy([recordId]);
}

// ---------------------------------------------------------------------------
// Project Retribution — internal commission split per project.
// Each row: a category (Admin / Door Opening / Selling / Sourcing / Staffing /
// Other), a percentage, a cost basis (part of the project price vs on top of
// it), and the member who receives it. The monetary amount is derived on read
// from the project's Total Amount (percentage x total), so it tracks the live
// project value; the cost basis is a classification and does not change the
// figure (it will matter once retribution feeds margin/payments, out of scope).
// ---------------------------------------------------------------------------

export type RetributionCategory =
  | "Admin"
  | "Door Opening"
  | "Selling"
  | "Sourcing"
  | "Staffing"
  | "Other";
export const RETRIBUTION_CATEGORIES: RetributionCategory[] = [
  "Admin",
  "Door Opening",
  "Selling",
  "Sourcing",
  "Staffing",
  "Other",
];

export type RetributionBasis = "Part of project price" | "On top";
export const RETRIBUTION_BASES: RetributionBasis[] = ["Part of project price", "On top"];

// How a row's amount is derived: a percentage of the project price, or a daily
// rate multiplied by the worked consultant's logged days.
export type RetributionAmountType = "Percentage" | "Per day worked";
export const RETRIBUTION_AMOUNT_TYPES: RetributionAmountType[] = ["Percentage", "Per day worked"];

export type RetributionRecord = {
  id: string;
  projectRecordId: string;
  category: RetributionCategory | "";
  otherDescription: string;
  amountType: RetributionAmountType | "";
  // Decimal fraction as stored by Airtable's percent field (0.05 = 5%).
  percentage: number | null;
  // Per-day rate (project currency) when amountType is "Per day worked".
  dailyAmount: number | null;
  // The staffing (a consultant on the project) whose logged days drive the
  // per-day amount.
  workedStaffingId: string;
  costBasis: RetributionBasis | "";
  memberRecordId: string;
  // Legacy free-text recipient (usually a member code) — used as a display
  // fallback for rows created before the Member link existed.
  recipient: string;
};

export type RetributionInput = {
  projectRecordId: string;
  category: RetributionCategory | "";
  otherDescription: string;
  amountType: RetributionAmountType | "";
  percentage: number | null; // decimal fraction
  dailyAmount: number | null;
  workedStaffingId: string;
  costBasis: RetributionBasis | "";
  memberRecordId: string;
  recipient: string; // kept in sync with the member code for the legacy field
};

function retributionFromRecord(r: AirtableRecord<FieldSet>): RetributionRecord {
  const F = FIELDS.projectRetribution;
  return {
    id: r.id,
    projectRecordId: firstLinkedId(r, F.project),
    category: (str(r, F.category) as RetributionCategory) || "",
    otherDescription: str(r, F.otherDescription),
    // Rows created before Amount Type existed are percentage-based.
    amountType: (str(r, F.amountType) as RetributionAmountType) || "Percentage",
    percentage: numOrNull(r, F.percentage),
    dailyAmount: numOrNull(r, F.dailyAmount),
    workedStaffingId: firstLinkedId(r, F.workedStaffing),
    costBasis: (str(r, F.costBasis) as RetributionBasis) || "",
    memberRecordId: firstLinkedId(r, F.member),
    recipient: str(r, F.recipient),
  };
}

// The Project Retribution table already exists in the base; we lazily add the
// fields the portal needs (Member link, Cost Basis, Other Description) via the
// meta API. Idempotent + cached.
let retributionSchemaReady = false;
export async function ensureRetributionSchema(): Promise<boolean> {
  if (retributionSchemaReady) return true;
  try {
    const metaUrl = `https://api.airtable.com/v0/meta/bases/${env.airtableBaseId}/tables`;
    const res = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${env.airtablePat}` },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      tables: Array<{ id: string; name: string; fields: Array<{ name: string }> }>;
    };
    const table = data.tables.find((t) => t.name === TABLES.projectRetribution);
    if (!table) return false; // table is expected to pre-exist in the base
    const membersTable = data.tables.find((t) => t.name === TABLES.networkMembers);
    const staffingTable = data.tables.find((t) => t.name === TABLES.projectStaffing);
    const F = FIELDS.projectRetribution;
    const existing = new Set(table.fields.map((f) => f.name));
    const toCreate: Array<Record<string, unknown>> = [];
    if (!existing.has(F.member)) {
      if (!membersTable) {
        console.error("ensureRetributionSchema: Network Members table not found; cannot create Member link");
        return false;
      }
      toCreate.push({
        name: F.member,
        type: "multipleRecordLinks",
        options: { linkedTableId: membersTable.id },
      });
    }
    if (!existing.has(F.costBasis)) {
      toCreate.push({
        name: F.costBasis,
        type: "singleSelect",
        options: {
          choices: [{ name: "Part of project price" }, { name: "On top" }],
        },
      });
    }
    if (!existing.has(F.otherDescription)) {
      toCreate.push({ name: F.otherDescription, type: "singleLineText" });
    }
    if (!existing.has(F.amountType)) {
      toCreate.push({
        name: F.amountType,
        type: "singleSelect",
        options: { choices: [{ name: "Percentage" }, { name: "Per day worked" }] },
      });
    }
    if (!existing.has(F.dailyAmount)) {
      toCreate.push({ name: F.dailyAmount, type: "number", options: { precision: 2 } });
    }
    if (!existing.has(F.workedStaffing)) {
      if (!staffingTable) {
        console.error("ensureRetributionSchema: Project Staffing table not found; cannot create Worked Staffing link");
        return false;
      }
      toCreate.push({
        name: F.workedStaffing,
        type: "multipleRecordLinks",
        options: { linkedTableId: staffingTable.id },
      });
    }
    let allOk = true;
    for (const field of toCreate) {
      const create = await fetch(
        `https://api.airtable.com/v0/meta/bases/${env.airtableBaseId}/tables/${table.id}/fields`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.airtablePat}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(field),
        },
      );
      if (!create.ok) {
        console.error("ensureRetributionSchema field create failed:", await create.text().catch(() => ""));
        allOk = false;
      }
    }
    if (allOk) retributionSchemaReady = true;
    return allOk;
  } catch (e) {
    console.error("ensureRetributionSchema failed:", e);
    return false;
  }
}

export async function listRetributions(): Promise<RetributionRecord[]> {
  try {
    // Best-effort schema ensure, but don't gate the read on it: the table and
    // its rows already exist, and reading missing (not-yet-created) fields just
    // yields empty values. Gating reads here would blank the page on a
    // transient meta-API hiccup or a read-only PAT.
    await ensureRetributionSchema();
    const records = await base(TABLES.projectRetribution).select().all();
    return records.map(retributionFromRecord);
  } catch (e) {
    console.error("listRetributions failed:", e);
    return [];
  }
}

function retributionFields(input: RetributionInput): Record<string, unknown> {
  const F = FIELDS.projectRetribution;
  const isPerDay = input.amountType === "Per day worked";
  return {
    [F.project]: input.projectRecordId ? [input.projectRecordId] : [],
    [F.category]: input.category === "" ? null : input.category,
    [F.otherDescription]: input.otherDescription || null,
    [F.amountType]: input.amountType === "" ? null : input.amountType,
    // Only the fields relevant to the chosen mode are stored; the other is
    // cleared so a mode switch never leaves a stale value behind.
    [F.percentage]: isPerDay ? null : input.percentage,
    [F.dailyAmount]: isPerDay ? input.dailyAmount : null,
    [F.workedStaffing]: isPerDay && input.workedStaffingId ? [input.workedStaffingId] : [],
    [F.costBasis]: input.costBasis === "" ? null : input.costBasis,
    [F.member]: input.memberRecordId ? [input.memberRecordId] : [],
    [F.recipient]: input.recipient || null,
  };
}

export async function createRetribution(input: RetributionInput): Promise<string> {
  await ensureRetributionSchema();
  const [created] = await base(TABLES.projectRetribution).create(
    [{ fields: retributionFields(input) as FieldSet }],
    { typecast: true },
  );
  return created.id;
}

export async function updateRetribution(id: string, input: RetributionInput): Promise<void> {
  await ensureRetributionSchema();
  await base(TABLES.projectRetribution).update(
    [{ id, fields: retributionFields(input) as FieldSet }],
    { typecast: true },
  );
}

export async function deleteRetribution(id: string): Promise<void> {
  await base(TABLES.projectRetribution).destroy([id]);
}

// ---------------------------------------------------------------------------
// Vendor invoices (paid IT bills). These arrive by email already paid — this
// is record-keeping, not a payment workflow. A nightly importer reads PDF
// attachments from a shared mailbox and files one row per invoice, deduping
// by the email's Message Id. The table is created lazily via the meta API.
// ---------------------------------------------------------------------------

export type VendorInvoiceStatus = "Paid" | "Needs Review" | "Filed" | "";

export type VendorInvoiceRecord = {
  id: string;
  vendor: string;
  invoiceNumber: string;
  invoiceDate: string;
  amount: number | null;
  currency: string;
  amountEur: number | null;
  projectCode: string;
  status: VendorInvoiceStatus;
  messageId: string;
  emailSubject: string;
  emailFrom: string;
  receivedAt: string;
  notes: string;
  paymentId: string;
  pdf: AttachmentRef | null;
  createdTime: string;
};

function vendorInvoiceFromRecord(r: AirtableRecord<FieldSet>): VendorInvoiceRecord {
  const F = FIELDS.vendorInvoices;
  return {
    id: r.id,
    vendor: str(r, F.vendor),
    invoiceNumber: str(r, F.invoiceNumber),
    invoiceDate: str(r, F.invoiceDate),
    amount: numOrNull(r, F.amount),
    currency: str(r, F.currency),
    amountEur: numOrNull(r, F.amountEur),
    projectCode: str(r, F.projectCode),
    status: (str(r, F.status) as VendorInvoiceStatus) || "",
    messageId: str(r, F.messageId),
    emailSubject: str(r, F.emailSubject),
    emailFrom: str(r, F.emailFrom),
    receivedAt: str(r, F.receivedAt),
    notes: str(r, F.notes),
    paymentId: str(r, F.paymentId),
    pdf: firstAttachment(r, F.pdf),
    createdTime: (r as unknown as { _rawJson?: { createdTime?: string } })._rawJson?.createdTime ?? "",
  };
}

let vendorInvoicesTableReady = false;
export async function ensureVendorInvoicesSchema(): Promise<boolean> {
  if (vendorInvoicesTableReady) return true;
  try {
    const metaUrl = `https://api.airtable.com/v0/meta/bases/${env.airtableBaseId}/tables`;
    const res = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${env.airtablePat}` },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      tables: Array<{ id: string; name: string; fields: Array<{ name: string }> }>;
    };
    const F = FIELDS.vendorInvoices;
    const existing = data.tables.find((t) => t.name === TABLES.vendorInvoices);
    if (existing) {
      // Table already created on a prior run — lazily add the Payment Id link
      // field if it's missing (added after the table shipped). The "Paid"
      // status choice is auto-added by typecast on write.
      if (!existing.fields.some((f) => f.name === F.paymentId)) {
        await fetch(
          `https://api.airtable.com/v0/meta/bases/${env.airtableBaseId}/tables/${existing.id}/fields`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${env.airtablePat}`, "Content-Type": "application/json" },
            body: JSON.stringify({ name: F.paymentId, type: "singleLineText" }),
          },
        ).catch(() => {});
      }
      vendorInvoicesTableReady = true;
      return true;
    }
    const fields: Array<Record<string, unknown>> = [
      { name: F.vendor, type: "singleLineText" },
      { name: F.invoiceNumber, type: "singleLineText" },
      { name: F.invoiceDate, type: "singleLineText" },
      { name: F.amount, type: "number", options: { precision: 2 } },
      { name: F.currency, type: "singleLineText" },
      { name: F.amountEur, type: "number", options: { precision: 2 } },
      { name: F.projectCode, type: "singleLineText" },
      {
        name: F.status,
        type: "singleSelect",
        options: { choices: [{ name: "Paid" }, { name: "Needs Review" }, { name: "Filed" }] },
      },
      { name: F.pdf, type: "multipleAttachments" },
      { name: F.messageId, type: "singleLineText" },
      { name: F.emailSubject, type: "singleLineText" },
      { name: F.emailFrom, type: "singleLineText" },
      { name: F.receivedAt, type: "singleLineText" },
      { name: F.notes, type: "multilineText" },
      { name: F.paymentId, type: "singleLineText" },
    ];
    const create = await fetch(metaUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.airtablePat}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: TABLES.vendorInvoices,
        description: "Paid IT / vendor invoices imported from the billing mailbox — for the record.",
        fields,
      }),
    });
    if (create.ok) {
      vendorInvoicesTableReady = true;
      return true;
    }
    console.error("Failed to create Vendor Invoices table:", await create.text().catch(() => ""));
    return false;
  } catch (e) {
    console.error("ensureVendorInvoicesSchema failed:", e);
    return false;
  }
}

export async function listVendorInvoices(): Promise<VendorInvoiceRecord[]> {
  try {
    const ok = await ensureVendorInvoicesSchema();
    if (!ok) return [];
    const records = await base(TABLES.vendorInvoices).select().all();
    const rows = records.map(vendorInvoiceFromRecord);
    // Newest first — by received date when known, else Airtable creation time.
    rows.sort((a, b) => {
      const ka = a.receivedAt || a.createdTime;
      const kb = b.receivedAt || b.createdTime;
      return kb.localeCompare(ka);
    });
    return rows;
  } catch (e) {
    console.error("listVendorInvoices failed:", e);
    return [];
  }
}

export async function getVendorInvoiceById(id: string): Promise<VendorInvoiceRecord | null> {
  try {
    await ensureVendorInvoicesSchema();
    const r = await base(TABLES.vendorInvoices).find(id);
    return vendorInvoiceFromRecord(r);
  } catch {
    return null;
  }
}

// Dedup key for the importer — has this email already been filed?
export async function vendorInvoiceMessageIds(): Promise<Set<string>> {
  try {
    const ok = await ensureVendorInvoicesSchema();
    if (!ok) return new Set();
    const records = await base(TABLES.vendorInvoices)
      .select({ fields: [FIELDS.vendorInvoices.messageId] })
      .all();
    const ids = new Set<string>();
    for (const r of records) {
      const id = str(r, FIELDS.vendorInvoices.messageId);
      if (id) ids.add(id);
    }
    return ids;
  } catch (e) {
    console.error("vendorInvoiceMessageIds failed:", e);
    return new Set();
  }
}

export type VendorInvoiceInput = {
  vendor: string;
  invoiceNumber: string;
  invoiceDate: string;
  amount: number | null;
  currency: string;
  projectCode: string;
  status: VendorInvoiceStatus;
  messageId: string;
  emailSubject: string;
  emailFrom: string;
  receivedAt: string;
  notes: string;
  paymentId?: string;
};

function vendorInvoiceFields(input: Partial<VendorInvoiceInput>): Record<string, unknown> {
  const F = FIELDS.vendorInvoices;
  const out: Record<string, unknown> = {};
  if (input.vendor !== undefined) out[F.vendor] = input.vendor;
  if (input.invoiceNumber !== undefined) out[F.invoiceNumber] = input.invoiceNumber;
  if (input.invoiceDate !== undefined) out[F.invoiceDate] = input.invoiceDate;
  if (input.currency !== undefined) out[F.currency] = input.currency;
  if (input.projectCode !== undefined) out[F.projectCode] = input.projectCode;
  if (input.status !== undefined) out[F.status] = input.status === "" ? null : input.status;
  if (input.messageId !== undefined) out[F.messageId] = input.messageId;
  if (input.emailSubject !== undefined) out[F.emailSubject] = input.emailSubject;
  if (input.emailFrom !== undefined) out[F.emailFrom] = input.emailFrom;
  if (input.receivedAt !== undefined) out[F.receivedAt] = input.receivedAt;
  if (input.notes !== undefined) out[F.notes] = input.notes;
  if (input.paymentId !== undefined) out[F.paymentId] = input.paymentId;
  // Amount + EUR move together: whenever the amount or currency is touched,
  // recompute the EUR figure so the record-keeping total stays consistent.
  if (input.amount !== undefined || input.currency !== undefined) {
    const amount = input.amount ?? null;
    const { invoiceValueEur } = resolvePaymentEur({
      currency: input.currency ?? "EUR",
      value: amount,
      fx: null,
    });
    out[F.amount] = amount;
    out[F.amountEur] = invoiceValueEur;
  }
  return out;
}

export async function createVendorInvoice(input: VendorInvoiceInput): Promise<string> {
  await ensureVendorInvoicesSchema();
  const [created] = await base(TABLES.vendorInvoices).create(
    [{ fields: vendorInvoiceFields(input) as FieldSet }],
    { typecast: true },
  );
  return created.id;
}

export async function updateVendorInvoice(
  id: string,
  patch: Partial<VendorInvoiceInput>,
): Promise<void> {
  await ensureVendorInvoicesSchema();
  await base(TABLES.vendorInvoices).update(
    [{ id, fields: vendorInvoiceFields(patch) as FieldSet }],
    { typecast: true },
  );
}

export async function deleteVendorInvoice(id: string): Promise<void> {
  // These invoices are paired with an auto-created "Paid" payment. Deleting
  // the invoice also removes its payment (raw destroy, not deletePayment, to
  // avoid the reverse cascade looping back here).
  const rec = await getVendorInvoiceById(id).catch(() => null);
  await base(TABLES.vendorInvoices).destroy([id]);
  if (rec?.paymentId) {
    await base(TABLES.payments).destroy([rec.paymentId]).catch(() => {});
  }
}

// Create the "Paid" outflow payment that mirrors an already-paid vendor
// invoice, and link the two together (payment id stored on the invoice). The
// payment carries a back-reference to the invoice in its comment so the
// payments side can cascade the delete. Returns the new payment id.
export async function createPaymentForVendorInvoice(
  vendorInvoiceId: string,
  input: PaymentInput,
  pdfUrl?: string,
): Promise<string> {
  // typecast: true so the "Expense"/"Outflow"/"Paid" single-select values are
  // auto-added if those choices don't exist yet on the Payments table (the
  // plain createPayment omits typecast and would silently reject a new choice).
  const fields = paymentFields(input);
  // Copy the invoice PDF onto the payment (Airtable ingests the url into the
  // attachment field) so the payment carries the same document.
  if (pdfUrl) {
    await ensurePaymentInvoicePdfField();
    fields[FIELDS.payments.invoicePdf] = [{ url: pdfUrl }];
  }
  const [created] = await base(TABLES.payments).create(
    [{ fields: fields as FieldSet }],
    { typecast: true },
  );
  await updateVendorInvoice(vendorInvoiceId, { paymentId: created.id });
  return created.id;
}

// Find the vendor invoice (if any) paired with a given payment.
export async function vendorInvoiceForPayment(
  paymentId: string,
): Promise<VendorInvoiceRecord | null> {
  if (!paymentId) return null;
  try {
    const ok = await ensureVendorInvoicesSchema();
    if (!ok) return null;
    const records = await base(TABLES.vendorInvoices)
      .select({
        filterByFormula: `{${FIELDS.vendorInvoices.paymentId}} = "${escape(paymentId)}"`,
        maxRecords: 1,
      })
      .firstPage();
    return records[0] ? vendorInvoiceFromRecord(records[0]) : null;
  } catch {
    return null;
  }
}

// Attach a PDF to a Vendor Invoices row via Airtable's content endpoint.
export async function attachVendorInvoicePdf(
  recordId: string,
  filename: string,
  base64: string,
): Promise<void> {
  const url = `https://content.airtable.com/v0/${env.airtableBaseId}/${recordId}/${encodeURIComponent(FIELDS.vendorInvoices.pdf)}/uploadAttachment`;
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
