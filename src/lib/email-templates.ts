// Central catalog of every automated email the portal can send. This module is
// the single source of truth for email copy: the default subject + body live
// here, and the admin Emails page reads the same catalog to render its editor
// and documentation. It is client-safe (no server-only imports) so the admin UI
// can import the metadata directly.
//
// A body is a plain-text template with {{placeholder}} tokens and blank lines
// separating paragraphs. The renderer produces both a text and an HTML version.
// Rich, structured fragments (approve/reject buttons, per-day tables, covered-
// timesheet lists) are passed in as "block" placeholders — an object carrying a
// text and an html rendering — so an admin can edit the surrounding prose
// without hand-writing HTML.

export type EmailVar = string | { text: string; html: string };
export type EmailVars = Record<string, EmailVar>;

export type PlaceholderDoc = {
  token: string;
  description: string;
  // A "block" placeholder is a pre-rendered fragment (table/buttons/list); a
  // scalar placeholder is a plain string. Blocks can't be hand-typed by an
  // admin, but the prose around them is fully editable.
  block?: boolean;
};

export type EmailTemplateDef = {
  key: string;
  name: string;
  purpose: string;
  recipient: string;
  trigger: string;
  conditions: string;
  // How the "To" address is determined:
  //  - "fixed": a configurable address, defaulting to the finance inbox.
  //  - "dynamic": derived per record (a reviewer, a survey contact, a member)
  //    and therefore not a single editable address.
  toMode: "fixed" | "dynamic";
  // Human description of the dynamic recipient (shown when toMode is dynamic).
  dynamicRecipient?: string;
  // Built-in CC list (editable). Empty for most; the paid recap CCs bookkeeping.
  defaultCc: string[];
  // Placeholders available to subject + body.
  placeholders: PlaceholderDoc[];
  defaultSubject: string;
  defaultBody: string;
};

// The editable override an admin saves for a template. Any blank field falls
// back to the coded default. `to`/`cc` are comma/newline separated address
// lists; `from` overrides the sender mailbox.
export type EmailTemplateOverride = {
  key: string;
  subject: string;
  body: string;
  to: string;
  cc: string;
  from: string;
  updatedAt: string | null;
};

// Parse a comma / semicolon / newline separated address list.
export function parseAddressList(s: string | undefined | null): string[] {
  return (s || "")
    .split(/[,;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export const EMAIL_TEMPLATES: EmailTemplateDef[] = [
  {
    key: "invoice_submitted",
    name: "Invoice submitted",
    purpose: "Notifies the finance inbox that a member submitted an invoice, and copies the member.",
    recipient:
      "To: the finance inbox (INVOICE_RECIPIENT_EMAIL, default invoices@htp42.com). CC: the submitting member's @htp42.com login address.",
    trigger: "A signed-in member submits an invoice (PDF + staffing + amount + comment) from Timesheets → Submit an invoice.",
    conditions:
      "Sent after the invoice record is created and the member's PDF is attached. The uploaded invoice PDF is always attached; a generated week-by-week timesheet summary PDF is attached when the member selected covered timesheets.",
    toMode: "fixed",
    dynamicRecipient: "The submitting member is always CC'd (their @htp42.com address).",
    defaultCc: [],
    placeholders: [
      { token: "member", description: "Submitting member's name (falls back to email, then member code)." },
      { token: "memberEmail", description: "Member's @htp42.com login email." },
      { token: "staffingOrProject", description: "Staffing code, or project code if none; used in the subject." },
      { token: "staffingCode", description: "Staffing code the invoice is for." },
      { token: "projectCode", description: "Project code derived from the staffing." },
      { token: "projectName", description: "Project name." },
      { token: "amount", description: "Invoice amount + currency (e.g. 12,000 EUR)." },
      { token: "comment", description: "Member's comment on the invoice." },
      { token: "coveredTimesheets", description: "List of covered weeks with hours.", block: true },
      { token: "portalUrl", description: "Deep link to /admin/payments." },
    ],
    defaultSubject: "Invoice from {{member}} for {{staffingOrProject}}",
    defaultBody: [
      "New invoice submitted by {{member}} ({{memberEmail}}).",
      "",
      "Staffing: {{staffingCode}}",
      "Project: {{projectCode}} ({{projectName}})",
      "Amount: {{amount}}",
      "Comment: {{comment}}",
      "",
      "{{coveredTimesheets}}",
      "",
      "Open in portal: {{portalUrl}}",
    ].join("\n"),
  },
  {
    key: "timesheet_review_request",
    name: "Timesheet review request (client)",
    purpose:
      "Asks an external client reviewer to approve or reject a submitted timesheet via one-click links; no account needed.",
    recipient: "To: the reviewer email configured on the staffing (Client review method).",
    trigger: "A member submits (or resubmits) a timesheet on a staffing whose review method is Client.",
    conditions:
      "Only sent when the staffing's review method is Client and a reviewer email is set. A single-use token with a 14-day expiry is minted first. Best-effort: a send failure never blocks the submit and is logged to the review audit trail.",
    toMode: "dynamic",
    dynamicRecipient: "The reviewer email set on the staffing (per staffing, not editable here).",
    defaultCc: [],
    placeholders: [
      { token: "reviewerName", description: "Reviewer's name (falls back to 'there')." },
      { token: "memberName", description: "Member who submitted the timesheet." },
      { token: "projectLabel", description: "Project code · project name." },
      { token: "staffingCode", description: "Staffing code." },
      { token: "weekLabel", description: "The week the timesheet covers." },
      { token: "totalHours", description: "Total hours logged that week." },
      { token: "days", description: "Per-day hours + task breakdown.", block: true },
      { token: "actions", description: "Approve / Reject buttons (required, do not remove).", block: true },
      { token: "expiryNote", description: "Sentence stating the links expire and are single-use." },
    ],
    defaultSubject: "[HTP42] Timesheet approval: {{memberName}} · {{weekLabel}}",
    defaultBody: [
      "Hi {{reviewerName}},",
      "",
      "{{memberName}} submitted a timesheet for your approval.",
      "",
      "Project: {{projectLabel}}",
      "Staffing: {{staffingCode}}",
      "Week: {{weekLabel}}",
      "Total: {{totalHours}} h",
      "",
      "{{days}}",
      "",
      "{{actions}}",
      "",
      "{{expiryNote}}",
    ].join("\n"),
  },
  {
    key: "payment_paid",
    name: "Payment recap (paid / received)",
    purpose: "Recap sent whenever any payment becomes Paid, archived to finance and bookkeeping with the invoice PDF attached.",
    recipient:
      "To: the finance inbox (INVOICE_RECIPIENT_EMAIL). CC: the Fulll bookkeeping and Qonto receipts inboxes.",
    trigger:
      "A payment transitions into Paid, from the payments list/modal, the payment review page, or when an automated vendor-invoice import creates a Paid payment.",
    conditions:
      "Fires exactly once on the transition into Paid. The invoice PDF is attached when available and under the 3 MB inline cap; otherwise a note explains why it is missing. A send failure is only logged.",
    toMode: "fixed",
    defaultCc: ["factures+cHEA-072a8f@m.fulll.io", "receipts-ukcbzgcdo9a6@inbox.qonto.com"],
    placeholders: [
      { token: "heading", description: "Inflow received / Outflow paid / Payment recorded (by direction)." },
      { token: "label", description: "Best identifier: reference, beneficiary, payment code, or project codes." },
      { token: "intro", description: "One-sentence intro matching the direction." },
      { token: "reference", description: "Invoice reference." },
      { token: "beneficiary", description: "Beneficiary." },
      { token: "amount", description: "Amount + currency." },
      { token: "paymentDate", description: "Payment date." },
      { token: "invoiceDate", description: "Invoice date." },
      { token: "project", description: "Resolved project (code and name)." },
      { token: "client", description: "Resolved client (code and name)." },
      { token: "comment", description: "Payment comment." },
      { token: "pdfNote", description: "Whether the PDF was attached, or why not.", block: true },
      { token: "portalUrl", description: "Deep link to /admin/payments." },
    ],
    defaultSubject: "[HTP42] {{heading}}: {{label}}",
    defaultBody: [
      "{{intro}}",
      "",
      "Reference: {{reference}}",
      "Beneficiary: {{beneficiary}}",
      "Amount: {{amount}}",
      "Payment date: {{paymentDate}}",
      "Invoice date: {{invoiceDate}}",
      "Project: {{project}}",
      "Client: {{client}}",
      "Comment: {{comment}}",
      "",
      "{{pdfNote}}",
      "",
      "Portal: {{portalUrl}}",
    ].join("\n"),
  },
  {
    key: "survey_invite",
    name: "Client survey invitation",
    purpose: "Invites a client contact to complete a project-feedback survey via a tokenised public link.",
    recipient: "To: each client contact entered by the admin when sending the survey.",
    trigger: "An admin sends surveys for a project from Clients → Client feedback.",
    conditions: "One email per recipient. A survey-recipient record + token is created first; per-recipient send failures are reported but don't stop the batch.",
    toMode: "dynamic",
    dynamicRecipient: "Each client contact entered when sending the survey.",
    defaultCc: [],
    placeholders: [
      { token: "who", description: "Recipient's name (falls back to 'there')." },
      { token: "projectCode", description: "Project code (used in the subject)." },
      { token: "projectNameSuffix", description: "': Project name' appended to the subject when known." },
      { token: "projectNamePhrase", description: "' on Project name' woven into the intro when known." },
      { token: "link", description: "The recipient's unique survey link." },
    ],
    defaultSubject: "Your feedback on {{projectCode}}{{projectNameSuffix}}",
    defaultBody: [
      "Hi {{who}},",
      "",
      "We'd love your feedback on our work{{projectNamePhrase}}. It takes a couple of minutes and covers the overall engagement and each team member.",
      "",
      "Open your survey: {{link}}",
      "",
      "Thank you,",
      "HTP42",
    ].join("\n"),
  },
  {
    key: "contract_uploaded",
    name: "Contract uploaded",
    purpose: "Paper-trail email to finance when a signed contract PDF is uploaded.",
    recipient: "To: the finance inbox (INVOICE_RECIPIENT_EMAIL).",
    trigger: "An admin uploads a contract PDF on a contract record.",
    conditions: "Fire-and-forget after a successful attach; only logs on failure. The uploaded PDF is attached.",
    toMode: "fixed",
    defaultCc: [],
    placeholders: [
      { token: "label", description: "Contract type · counterparty · project (used in the subject)." },
      { token: "contractType", description: "Contract type (MSA, SOW, …)." },
      { token: "counterparty", description: "Counterparty (client, member, or signatory)." },
      { token: "projectCode", description: "Linked project code." },
      { token: "memberCodes", description: "Linked member codes." },
      { token: "signatories", description: "Signatory line(s)." },
      { token: "signatureDate", description: "Signature date." },
      { token: "expiryDate", description: "Expiry date." },
      { token: "stage", description: "Contract status." },
      { token: "uploadedBy", description: "Admin who uploaded it." },
      { token: "portalUrl", description: "Deep link to /admin/contracts." },
    ],
    defaultSubject: "Contract uploaded: {{label}}",
    defaultBody: [
      "A signed contract PDF has just been uploaded in the HTP42 portal.",
      "",
      "Contract type: {{contractType}}",
      "Counterparty: {{counterparty}}",
      "Project: {{projectCode}}",
      "Member: {{memberCodes}}",
      "Signatories: {{signatories}}",
      "Signature date: {{signatureDate}}",
      "Expiry: {{expiryDate}}",
      "Status: {{stage}}",
      "",
      "Uploaded by: {{uploadedBy}}",
      "Open in portal: {{portalUrl}}",
    ].join("\n"),
  },
  {
    key: "payment_invoice_uploaded",
    name: "Payment invoice uploaded",
    purpose: "Paper-trail email to finance when an invoice PDF is attached to a payment record.",
    recipient: "To: the finance inbox (INVOICE_RECIPIENT_EMAIL).",
    trigger: "An admin uploads an invoice PDF against a payment.",
    conditions: "Fire-and-forget after a successful attach; only logs on failure. The uploaded PDF is attached.",
    toMode: "fixed",
    defaultCc: [],
    placeholders: [
      { token: "label", description: "Payment code · reference · counterparty (used in the subject)." },
      { token: "direction", description: "Inflow or Outflow." },
      { token: "type", description: "Payment type." },
      { token: "counterparty", description: "Client (inflow) or member/beneficiary (outflow)." },
      { token: "invoiceReference", description: "Invoice reference." },
      { token: "amount", description: "Amount + currency." },
      { token: "paymentStatus", description: "Payment status." },
      { token: "uploadedBy", description: "Admin who uploaded it." },
      { token: "portalUrl", description: "Deep link to /admin/payments." },
    ],
    defaultSubject: "Payment invoice uploaded: {{label}}",
    defaultBody: [
      "An invoice PDF has just been uploaded against a payment in the HTP42 portal.",
      "",
      "Direction: {{direction}}",
      "Type: {{type}}",
      "Counterparty: {{counterparty}}",
      "Invoice ref: {{invoiceReference}}",
      "Amount: {{amount}}",
      "Status: {{paymentStatus}}",
      "",
      "Uploaded by: {{uploadedBy}}",
      "Open in portal: {{portalUrl}}",
    ].join("\n"),
  },
  {
    key: "invoice_email_test",
    name: "Email pipeline test (diagnostic)",
    purpose: "Admin-only dry run to confirm the Microsoft Graph / Mail.Send pipeline is wired up.",
    recipient: "To: an address entered by the admin, else the finance inbox.",
    trigger: "An admin clicks the test-email button in Finance → Invoices.",
    conditions: "Admin-only. Not a business event; used only to verify sending works.",
    toMode: "fixed",
    dynamicRecipient: "Defaults to the finance inbox unless the admin types a test address.",
    defaultCc: [],
    placeholders: [
      { token: "triggeredBy", description: "Admin member code + subject id." },
      { token: "sender", description: "Configured sender mailbox (INVOICE_SENDER_UPN)." },
      { token: "recipient", description: "Resolved recipient." },
    ],
    defaultSubject: "HTP42 portal: invoice email test",
    defaultBody: [
      "This is a test message from the HTP42 portal.",
      "Triggered by: {{triggeredBy}}",
      "Sender mailbox (INVOICE_SENDER_UPN): {{sender}}",
      "Recipient (INVOICE_RECIPIENT_EMAIL default): {{recipient}}",
      "",
      "If you got this, Microsoft Graph + Mail.Send are wired up correctly.",
    ].join("\n"),
  },
];

export function getEmailTemplateDef(key: string): EmailTemplateDef | undefined {
  return EMAIL_TEMPLATES.find((t) => t.key === key);
}

// Classify an email by its subject line into one of the catalog type names.
// Used to label historical (backfilled) emails, which carry no template key,
// so they can be filtered/grouped by type like live-sent ones. Returns "Other"
// when nothing matches (e.g. a hand-sent message in the mailbox).
export function emailTypeFromSubject(subject: string): string {
  const s = (subject || "").trim();
  const rules: Array<[RegExp, string]> = [
    [/^invoice from /i, "Invoice submitted"],
    [/timesheet approval/i, "Timesheet review request (client)"],
    [/inflow received|outflow paid|payment recorded/i, "Payment recap (paid / received)"],
    [/^your feedback on /i, "Client survey invitation"],
    [/^contract uploaded/i, "Contract uploaded"],
    [/^payment invoice uploaded/i, "Payment invoice uploaded"],
    [/invoice email test/i, "Email pipeline test (diagnostic)"],
  ];
  for (const [re, name] of rules) if (re.test(s)) return name;
  return "Other";
}

// The effective type of a log row: its saved label, else inferred from subject.
export function emailTypeOf(label: string, subject: string): string {
  return label?.trim() || emailTypeFromSubject(subject);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const TOKEN_RE = /\{\{\s*(\w+)\s*\}\}/g;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Wrap bare http(s) URLs (already HTML-escaped) in anchors.
function autolink(escaped: string): string {
  return escaped.replace(/(https?:\/\/[^\s<]+)/g, (url) => `<a href="${url}">${url}</a>`);
}

function scalar(v: EmailVar | undefined): string {
  if (v == null) return "";
  return typeof v === "string" ? v : v.text;
}

export function interpolateSubject(tpl: string, vars: EmailVars): string {
  return tpl.replace(TOKEN_RE, (_, k: string) => scalar(vars[k])).trim();
}

export function interpolateText(tpl: string, vars: EmailVars): string {
  return tpl
    .replace(TOKEN_RE, (_, k: string) => scalar(vars[k]))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Render a single inline segment: escape literal text, autolink URLs, turn
// newlines into <br>, and substitute placeholders (scalars escaped, blocks raw).
function inlineHtml(segment: string, vars: EmailVars): string {
  let out = "";
  let last = 0;
  segment.replace(TOKEN_RE, (match, k: string, offset: number) => {
    out += autolink(escapeHtml(segment.slice(last, offset))).replace(/\n/g, "<br/>");
    const v = vars[k];
    if (v != null) out += typeof v === "string" ? autolink(escapeHtml(v)) : v.html;
    last = offset + match.length;
    return match;
  });
  out += autolink(escapeHtml(segment.slice(last))).replace(/\n/g, "<br/>");
  return out;
}

export function interpolateHtml(tpl: string, vars: EmailVars): string {
  const paragraphs = tpl.split(/\n{2,}/);
  const rendered = paragraphs
    .map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return "";
      // A paragraph that is exactly one block placeholder emits its HTML raw
      // (no <p> wrap) so tables/buttons render correctly.
      const lone = trimmed.match(/^\{\{\s*(\w+)\s*\}\}$/);
      if (lone) {
        const v = vars[lone[1]];
        if (v == null) return "";
        if (typeof v !== "string") return v.html;
        return `<p style="margin:0 0 12px">${autolink(escapeHtml(v))}</p>`;
      }
      return `<p style="margin:0 0 12px">${inlineHtml(p, vars)}</p>`;
    })
    .filter(Boolean)
    .join("\n");
  return `<div style="font-family:system-ui,-apple-system,sans-serif;color:#0f172a;max-width:600px;font-size:14px;line-height:1.55">${rendered}</div>`;
}

// Given a template def + an optional saved override + the runtime vars, produce
// the ready-to-send subject and bodies. A blank override field falls back to the
// coded default so a partial edit still works.
export function renderEmail(
  def: EmailTemplateDef,
  override: { subject?: string; body?: string } | null | undefined,
  vars: EmailVars,
): { subject: string; textBody: string; htmlBody: string } {
  const subjectTpl = override?.subject?.trim() ? override.subject : def.defaultSubject;
  const bodyTpl = override?.body?.trim() ? override.body : def.defaultBody;
  return {
    subject: interpolateSubject(subjectTpl, vars),
    textBody: interpolateText(bodyTpl, vars),
    htmlBody: interpolateHtml(bodyTpl, vars),
  };
}
