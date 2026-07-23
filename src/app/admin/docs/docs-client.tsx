"use client";

import { useState, type ReactNode } from "react";
import { SegmentedTabs } from "@/components/filters";

// ---------------------------------------------------------------------------
// Presentational helpers
// ---------------------------------------------------------------------------

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function Section({ id, title, intro, children }: { id?: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id ?? slugify(title)} className="scroll-mt-24">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {intro ? <p className="mt-1 text-xs text-slate-500">{intro}</p> : null}
      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
        {children}
      </div>
    </section>
  );
}

// Sticky chip row that jumps to each section on the current tab.
function QuickNav({ titles }: { titles: string[] }) {
  return (
    <nav className="sticky top-0 z-10 -mx-1 flex flex-wrap gap-1.5 rounded-lg bg-white/85 px-1 py-2 backdrop-blur">
      {titles.map((t) => (
        <a
          key={t}
          href={`#${slugify(t)}`}
          className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-brand-300 hover:text-brand-700"
        >
          {t}
        </a>
      ))}
    </nav>
  );
}

const BUSINESS_SECTIONS = [
  "Roles & access",
  "Members & staffing",
  "Timesheet lifecycle",
  "Timesheet review: admin vs client",
  "Invoicing: member submits an invoice",
  "Payments",
  "Automated invoicing (vendor / IT invoices)",
  "Projects, clients & opportunities",
  "Contracts & legal",
  "Automated emails",
];

const TECHNICAL_SECTIONS = [
  "Stack & hosting",
  "Authentication & authorization",
  "Data layer & schema",
  "Key derivations & rules in code",
  "Integrations",
  "Core data flow",
  "Auditability",
];

// Horizontal flow of pill "nodes" separated by arrows; wraps on small screens.
function Flow({ nodes }: { nodes: { label: string; tone?: "neutral" | "brand" | "success" | "warning" | "danger" }[] }) {
  const tones: Record<string, string> = {
    neutral: "border-slate-300 bg-slate-50 text-slate-700",
    brand: "border-brand-300 bg-brand-50 text-brand-800",
    success: "border-emerald-300 bg-emerald-50 text-emerald-800",
    warning: "border-amber-300 bg-amber-50 text-amber-800",
    danger: "border-rose-300 bg-rose-50 text-rose-800",
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {nodes.map((n, i) => (
        <span key={n.label} className="flex items-center gap-1.5">
          <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${tones[n.tone ?? "neutral"]}`}>
            {n.label}
          </span>
          {i < nodes.length - 1 ? (
            <span aria-hidden className="text-slate-300">
              →
            </span>
          ) : null}
        </span>
      ))}
    </div>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-700">
            {i + 1}
          </span>
          <span className="text-sm text-slate-700">{it}</span>
        </li>
      ))}
    </ol>
  );
}

function Rule({ children, tone = "brand" }: { children: ReactNode; tone?: "brand" | "warning" }) {
  const cls =
    tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-brand-200 bg-brand-50 text-brand-900";
  return (
    <div className={`mt-3 rounded-md border px-3 py-2 text-xs ${cls}`}>
      <span className="font-semibold uppercase tracking-wide">Key rule</span>
      <span className="ml-2">{children}</span>
    </div>
  );
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="ml-4 list-disc space-y-1 text-sm text-slate-700 marker:text-slate-300">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

function Term({ children }: { children: ReactNode }) {
  return <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-700">{children}</code>;
}

// A compact table with a header row. Scrolls horizontally on small screens.
function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-left">
            {head.map((h) => (
              <th key={h} className="py-1.5 pr-4 font-semibold uppercase tracking-wide text-slate-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-100 align-top">
              {r.map((c, j) => (
                <td key={j} className="py-1.5 pr-4 text-slate-700">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// A labelled block used to spell out roles / decisions / exceptions inline.
function DefList({ items }: { items: { term: ReactNode; def: ReactNode }[] }) {
  return (
    <dl className="mt-2 space-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-1 gap-0.5 sm:grid-cols-[10rem_1fr] sm:gap-3">
          <dt className="text-xs font-semibold text-slate-800">{it.term}</dt>
          <dd className="text-xs text-slate-600">{it.def}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Business processes
// ---------------------------------------------------------------------------

function BusinessProcesses() {
  return (
    <div className="space-y-6">
      <Section title="Roles & access" intro="Who can see and do what in the admin panel.">
        <p>
          Every member has a <strong>role</strong>. Only these roles reach the admin panel; everyone
          else is member-only (they can log their own time and submit their own invoices).
        </p>
        <DefList
          items={[
            {
              term: "Managing Partner",
              def: "Full, locked access to every page. Primary super-admin. Cannot be restricted.",
            },
            {
              term: "Operating Partner",
              def: "Full, locked access to every page. Cannot be restricted (prevents self-lockout).",
            },
            {
              term: "Associate Partner / Network Operations",
              def: "Configurable admin roles: default to full access except the Admin group (Roles & access, Emails), which must be granted explicitly.",
            },
            {
              term: "Project Manager",
              def: "Defaults to Timesheets → Review only, and only for the projects they are staffed on. Everything else is hidden until granted.",
            },
            {
              term: "Network Expert / Support / unassigned",
              def: "Member-only. No admin panel.",
            },
          ]}
        />
        <Rule>
          Access is enforced twice: the edge middleware checks the signed-in role, and every admin
          page/API re-checks the <em>live</em> role + permission before returning data, so revoking
          a role takes effect immediately. A page you cannot view is not shown in the navigation.
        </Rule>
        <p className="mt-3 text-xs text-slate-500">
          Configure roles in <Term>Admin → Roles &amp; access</Term>: a matrix of role × page with
          View / Edit ticks (Edit implies View).
        </p>
      </Section>

      <Section title="Members & staffing" intro="The network of people and their project assignments.">
        <p className="mb-2">
          A <strong>member</strong> is a person in the network. A <strong>staffing</strong> assigns
          one member to one project at an agreed day-rate and number of days. A staffing is the unit
          everything else hangs off: timesheets are logged against it, and invoices/payments settle
          it.
        </p>
        <Steps
          items={[
            <>
              <strong>Create the member.</strong> The member code is generated from the name (e.g.
              &ldquo;Thomas Bouquet&rdquo; → <Term>BOUTH1</Term>), with a digit to break ties.
            </>,
            <>
              <strong>Create a staffing:</strong> pick the project and the member. The day-rate and
              currency <strong>default from the member</strong> and stay editable.
            </>,
            <>
              <strong>Choose who reviews timesheets</strong> for this staffing. This is a required
              decision (see the callout below).
            </>,
            <>
              As timesheets are logged, the staffing shows{" "}
              <strong>days used vs days allocated</strong> (counting submitted-and-onward weeks) so
              over-runs are visible at a glance.
            </>,
          ]}
        />
        <Rule>
          The <strong>staffing code</strong> is generated by the application by joining the project
          code and the member code, e.g. <Term>ECS-2026-05_BOUTH1</Term> (mirroring the existing
          examples in the database). If the same member is re-staffed on the same project a numeric
          suffix keeps it unique. Member, client and project codes are likewise auto-generated and
          shown on an amber field; on edit, changing a code asks for confirmation because other
          records reference it.
        </Rule>
        <Rule tone="warning">
          <strong>Reviewer is mandatory.</strong> When setting up a staffing you must choose the
          timesheet reviewer: <strong>Admin</strong> (approved in-app on the Timesheets tab) or{" "}
          <strong>Client</strong> (the named client contact approves by secure email link). For
          client review you must also give the reviewer&apos;s name and email. This choice drives the
          whole review workflow below.
        </Rule>
      </Section>

      <Section title="Timesheet lifecycle" intro="Every status a week of time can be in, and how it moves between them.">
        <Flow
          nodes={[
            { label: "Draft" },
            { label: "Under review", tone: "warning" },
            { label: "Approved", tone: "success" },
            { label: "Rejected", tone: "danger" },
          ]}
        />
        <p className="mt-3">
          A member fills a week (Monday–Friday hours + a task note per day) and saves it as a{" "}
          <strong>Draft</strong>. Submitting moves it to review; a reviewer then approves or rejects
          it. The statuses and who can cause each move:
        </p>
        <Table
          head={["Status", "Meaning", "Who sets it", "What can happen next"]}
          rows={[
            ["Draft", "Being filled in; not yet sent.", "Member", "Submit → Under review; or Cancel."],
            [
              "Under review",
              "Submitted for approval; awaiting a decision.",
              "Member (by submitting)",
              "Approve → Approved; Reject → Rejected; member may Cancel or resubmit.",
            ],
            [
              "Approved",
              "Accepted. Now billable and counts toward days used.",
              "Admin or Client reviewer",
              "Included on an invoice; admin can still Edit.",
            ],
            [
              "Rejected",
              "Sent back with an optional reason.",
              "Admin or Client reviewer",
              "Member revises and resubmits → Under review.",
            ],
            [
              "Cancelled",
              "Withdrawn from the flow; ignored in totals.",
              "Member",
              "Terminal (a fresh week can be logged).",
            ],
          ]}
        />
        <Rule tone="warning">
          A timesheet stops at <strong>Approved</strong>. &ldquo;Invoiced&rdquo; and
          &ldquo;Paid&rdquo; are <strong>not</strong> timesheet statuses. Whether the work has been
          billed or paid is tracked on the payment, never on the timesheet. Nothing in the app moves
          a timesheet to Paid.
        </Rule>
        <p className="mt-3 text-xs text-slate-500">
          <strong>Exceptions:</strong> a Rejected week loops back through review as many times as
          needed; a Cancelled week never counts toward days-used or projected billing; only Under
          review and Approved weeks count toward a staffing&apos;s days used.
        </p>
      </Section>

      <Section title="Timesheet review: admin vs client" intro="The two review paths and how they differ.">
        <p>
          The staffing&apos;s <strong>review method</strong> (chosen at setup) decides which path a
          submitted week takes.
        </p>
        <Table
          head={["", "Admin review", "Client review"]}
          rows={[
            ["Who decides", "An HTP42 admin", "The client contact named on the staffing"],
            ["Where", "In-app: Timesheets → Review", "A secure one-click email link (no account)"],
            [
              "On submit",
              "Week appears in the Review queue",
              "A review-request email is sent to the reviewer with Approve / Reject buttons",
            ],
            [
              "Link security",
              "n/a",
              "Single-use token, expires after 14 days; cleared once a decision lands",
            ],
            [
              "Override",
              "n/a",
              "An admin can still approve/reject in-app if the client doesn't act",
            ],
          ]}
        />
        <Steps
          items={[
            <>
              Open <Term>Timesheets → Review</Term>. The left rail lists members with a count of
              weeks awaiting a decision (a Project Manager sees only their projects). The queue
              splits into <strong>Review · Admin</strong> and <strong>Review · Client</strong>{" "}
              sub-tabs by the staffing&apos;s review method, then <strong>Approved</strong> and{" "}
              <strong>Rejected</strong>.
            </>,
            <>
              For each week, <strong>Approve</strong> or <strong>Reject</strong> with an optional
              comment. Weeks set to client review show &ldquo;Awaiting client&rdquo; until the client
              acts; any admin decision on a client-reviewed week first asks you to confirm the
              override (in Review and in the Overview table).
            </>,
            <>
              Every decision (submitted, approved, rejected, edited) is written to an immutable
              audit trail (who, method: Admin/Client/System, when, comment). Hover a status badge to
              see the outcome.
            </>,
            <>
              Admins can <strong>Edit</strong> a timesheet from any view (Overview, Review, By
              project, By member): fix the hours/tasks and, if needed, move it to a different project
              (staffing) or week. An edit is itself recorded in the audit trail.
            </>,
          ]}
        />
        <Rule>
          <strong>Automated action:</strong> submitting (or resubmitting) a week on a Client-review
          staffing automatically mints the token and sends the review-request email. It is
          best-effort: a mail failure never blocks the submit and is logged to the audit trail.
        </Rule>
      </Section>

      <Section title="Invoicing: member submits an invoice" intro="Turning logged work into a bill and a payment to process.">
        <Flow
          nodes={[
            { label: "Logged timesheets", tone: "success" },
            { label: "Member submits invoice" },
            { label: "Outflow payment · Under review", tone: "warning" },
          ]}
        />
        <Steps
          items={[
            <>The member picks the <strong>staffing</strong> the invoice is for.</>,
            <>
              They select the weeks it covers. Both <strong>Under review</strong> and{" "}
              <strong>Approved</strong> weeks can be selected; Rejected weeks (need resubmission) and
              already-invoiced or paid weeks are shown but locked.
            </>,
            <>They attach the invoice PDF, enter the amount + currency and a comment.</>,
            <>
              On submit the app <strong>creates an Outflow payment in Under review</strong> (linked
              to the staffing, so the project is derived from it), records the covered weeks on the
              invoice (so they can&apos;t be billed twice), attaches the PDF, optionally builds a
              week-by-week summary PDF, and emails Finance. The timesheets keep their own status.
            </>,
          ]}
        />
        <Rule>
          A member can invoice work that is still under review; final approval is handled on the
          payment side. Marking that payment To be paid or Paid auto-approves any linked weeks that
          are still under review (see Payments).
        </Rule>
      </Section>

      <Section title="Payments" intro="Money in (clients) and money out (subcontractors, expenses, vendors).">
        <p>
          A payment is either an <strong>Inflow</strong> (a client pays HTP42) or an{" "}
          <strong>Outflow</strong> (HTP42 pays a member or vendor). The lifecycle runs{" "}
          <strong>Under review → To be paid → Paid</strong>, with two negative ends:{" "}
          <strong>Rejected</strong> and <strong>Cancelled</strong>.
        </p>
        <Table
          head={["Status", "Meaning", "Who sets it"]}
          rows={[
            ["Under review", "Awaiting finance triage / approval.", "Set automatically when a member invoice is submitted."],
            ["To be paid", "Approved for payment.", "Admin, in the Review dashboard."],
            ["Paid", "Money has moved.", "Admin (with a payment date)."],
            [
              "Rejected",
              "Refused by finance for approval reasons.",
              "Admin only, via Reject in the Review dashboard.",
            ],
            [
              "Cancelled",
              "Withdrawn; kept as history, out of the active flow.",
              "The member (while still under review, by cancelling their invoice), or an admin via Cancel payment on the Overview edit modal.",
            ],
          ]}
        />
        <Bullets
          items={[
            <>
              Payments are reviewed by an <strong>admin only</strong> (client review is a timesheet
              concern, never a payment one, and no client is ever emailed about a payment). The{" "}
              <strong>Review</strong> dashboard has sub-tabs <strong>Review</strong>,{" "}
              <strong>To be paid</strong>, <strong>Paid</strong>, <strong>Rejected</strong> and{" "}
              <strong>Cancelled</strong>. A Rejected payment can be revived: open it and use{" "}
              <strong>Move to To be paid</strong>.
            </>,
            <>
              For a <strong>Subcontractor</strong> outflow, the payment is linked to the{" "}
              <strong>staffing</strong> it settles; the project is derived from it and can never
              drift. By project / By member show a <strong>projected net</strong> (all inflows,
              including still-to-receive, minus all outflows still-to-be-paid). Rejected and
              Cancelled payments are excluded from totals.
            </>,
          ]}
        />
        <Rule>
          <strong>Cancel vs reject.</strong> A member can <strong>Cancel</strong> their invoice only
          while it is still Under review; doing so automatically cancels the linked payment. An admin{" "}
          <strong>Rejects</strong> a payment in the Review dashboard (approval refusal), or Cancels it
          from the Overview edit modal.
        </Rule>
        <Rule tone="warning">
          <strong>Automated status updates.</strong> Marking a payment To be paid / Paid while its
          linked timesheets are still under review (or rejected) auto-approves them on confirm
          (paying implies acceptance). This is also how you revive a Rejected payment. Rejecting a
          timesheet cascades to reject any unpaid payment already raised for that week; the rejected
          week itself cannot be invoiced again until the member revises and resubmits it. Marking
          Paid also marks the related member invoice Paid.
        </Rule>
      </Section>

      <Section title="Automated invoicing (vendor / IT invoices)" intro="How paid supplier invoices flow into the portal from a mailbox, hands-off.">
        <p>
          Besides member-submitted invoices, the portal can ingest already-paid{" "}
          <strong>vendor / IT invoices</strong> automatically from a dedicated billing mailbox, no
          manual entry.
        </p>
        <Flow
          nodes={[
            { label: "Invoice PDF lands in the billing mailbox" },
            { label: "Import reads it (Graph)", tone: "brand" },
            { label: "AI extracts vendor / amount / date" },
            { label: "Paid outflow payment created", tone: "success" },
          ]}
        />
        <Steps
          items={[
            <>
              The importer scans the configured mailbox (newest first) via Microsoft Graph and pulls
              the PDF attachments. It <strong>de-duplicates</strong> on the message id, so re-running
              never creates a payment twice.
            </>,
            <>
              For each new invoice, Claude extracts the header fields (vendor, invoice number, date,
              amount, currency) from the PDF for record-keeping.
            </>,
            <>
              These invoices are <strong>already paid</strong>, so when an amount was extracted the
              app creates the matching <strong>Paid outflow payment</strong> (payment date = invoice
              date if known, else the received date) under the internal IT project, attaches the PDF,
              and sends the payment recap email.
            </>,
            <>
              If the amount could not be read, the invoice is flagged for a quick human review
              instead. The Paid payment is created later, when an admin fills the amount in and
              saves.
            </>,
          ]}
        />
        <Rule tone="warning">
          <strong>Exceptions &amp; safeguards:</strong> the import needs the Azure app&apos;s
          Mail.Read permission and an Anthropic API key. Without either it imports nothing and
          records why, leaving the rest of the portal unaffected. Extraction is best-effort and
          always meant to be sanity-checked by a human before the numbers are trusted.
        </Rule>
      </Section>

      <Section title="Projects, clients & opportunities" intro="The commercial pipeline.">
        <Bullets
          items={[
            <>
              <strong>Opportunities</strong> track potential work by stage. Winning one{" "}
              <strong>converts it to a project</strong>, prefilling the name, value and objective and
              generating the project code (optionally attaching a SOW to Legal).
            </>,
            <>
              <strong>Projects</strong> belong to a client and carry the staffings, timesheets,
              invoices and contracts for the engagement. The By client view drills client → project →
              staffing. The project code is <Term>CLIENT-YEAR-NN</Term> where the year comes from the
              start date, so it rolls over automatically each year.
            </>,
            <>
              <strong>Clients &amp; Partners</strong> hold the counterparties; <strong>Client
              feedback</strong> surveys and <strong>client reviews</strong> capture satisfaction and
              per-member ratings.
            </>,
          ]}
        />
      </Section>

      <Section title="Contracts & legal" intro="Agreements underpinning the work.">
        <Bullets
          items={[
            <>
              Contracts are tracked by side (Client / Network / Other) and type (MSA, SOW, …), with a
              validity computed from status + expiry date.
            </>,
            <>
              A new contract can be created by <strong>dropping its PDF</strong>: the document is read
              (via Claude) and used to pre-fill the side, type, signatories, dates and key terms.
              Uploading a contract PDF emails a paper-trail note to Finance.
            </>,
            <>A project&apos;s SOW appears as a download chip across Projects, Staffing and Timesheets.</>,
          ]}
        />
      </Section>

      <Section title="Automated emails" intro="Every email the portal sends: who gets it, when, under what conditions, and what it says.">
        <p>
          All the emails below are sent via Microsoft Graph. In <Term>Admin → Emails</Term> an admin
          can edit each email&apos;s <strong>sender (From), recipients (To / CC), subject and
          body</strong>. Every change is saved to the database and applies to the next send, not
          just the preview. Each email lists its placeholders and shows a live preview. Some
          recipients are inherently per-record (a timesheet&apos;s client reviewer, a survey
          contact, the submitting member) and are set automatically; triggers and attachments are
          fixed by the workflow.
        </p>
        <Table
          head={["Email", "Recipient", "When / condition", "Contains"]}
          rows={[
            [
              "Invoice submitted",
              "Finance inbox; CC the submitting member",
              "A member submits an invoice",
              "Member, staffing, project, amount, comment, covered weeks; invoice PDF (+ timesheet summary PDF) attached",
            ],
            [
              "Timesheet review request",
              "The staffing's client reviewer",
              "A week is submitted on a Client-review staffing (only if a reviewer email is set)",
              "Member, project, week, per-day hours, one-click Approve / Reject links (single-use, 14-day expiry)",
            ],
            [
              "Payment recap (paid)",
              "Finance inbox; CC bookkeeping + receipts inboxes",
              "Any payment transitions into Paid (fires once)",
              "Direction, reference, beneficiary, amount, dates, project/client; invoice PDF attached when available",
            ],
            [
              "Client survey invitation",
              "Each client contact entered by the admin",
              "An admin sends surveys for a project",
              "Greeting, intro, the recipient's unique survey link",
            ],
            [
              "Contract uploaded",
              "Finance inbox",
              "An admin uploads a contract PDF (best-effort)",
              "Type, counterparty, project, signatories, dates, status, uploader; PDF attached",
            ],
            [
              "Payment invoice uploaded",
              "Finance inbox",
              "An admin uploads an invoice PDF against a payment (best-effort)",
              "Direction, type, counterparty, reference, amount, status, uploader; PDF attached",
            ],
            [
              "Email pipeline test",
              "Address the admin enters, else Finance inbox",
              "An admin runs the test button in Finance → Invoices",
              "A short diagnostic confirming Graph / Mail.Send works",
            ],
          ]}
        />
        <Rule>
          Emails that support a create/upload action are <strong>best-effort</strong>: a send failure
          is logged but never rolls back the underlying record or PDF. Where a send result matters
          (member invoices, client review) the outcome is recorded on the record or in the audit
          trail.
        </Rule>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Technical implementation
// ---------------------------------------------------------------------------

function TechnicalImplementation() {
  return (
    <div className="space-y-6">
      <Section title="Stack & hosting" intro="What the portal runs on.">
        <Bullets
          items={[
            <>
              <strong>Next.js 15</strong> (App Router, React server + client components), deployed on{" "}
              <strong>Vercel</strong>.
            </>,
            <>
              <strong>Airtable</strong> is the database, accessed server-side through the{" "}
              <Term>airtable</Term> SDK in <Term>src/lib/airtable.ts</Term>. The browser never talks
              to Airtable directly.
            </>,
            <>
              Styling is Tailwind with a shared component kit (Buttons, Modal, filters, StatusPill,
              DownloadChip, SearchSelect) so pages look and behave consistently.
            </>,
          ]}
        />
      </Section>

      <Section title="Authentication & authorization" intro="How sign-in and permissions work.">
        <Steps
          items={[
            <>
              A member signs in with their organisation email; a signed <strong>JWT</strong> is stored
              in an httpOnly cookie (<Term>htp42_session</Term>).
            </>,
            <>
              The edge <Term>middleware.ts</Term> gates <Term>/admin</Term> routes by the role in the
              token.
            </>,
            <>
              Each admin page/API additionally calls <Term>requireAdminSession</Term>, which re-reads
              the member&apos;s <em>live</em> Airtable role (so a revoked role takes effect
              immediately), then checks the permission via <Term>can(role, page, action)</Term>.
            </>,
          ]}
        />
        <Rule>
          The permission model (<Term>src/lib/permissions.ts</Term>) is fail-closed: locked-full
          roles short-circuit to allowed; non-admin roles to denied; otherwise the stored matrix
          decides, and a page missing from a saved row is treated as no access.
        </Rule>
      </Section>

      <Section title="Data layer & schema" intro="How records are read and written.">
        <Bullets
          items={[
            <>
              Tables and fields are centralised in <Term>FIELDS</Term>/<Term>TABLES</Term> maps. New
              fields/tables are created <strong>lazily via the Airtable meta API</strong> the first
              time they are needed (guarded by module flags), so the schema self-heals.
            </>,
            <>
              Writes use <Term>{"{ typecast: true }"}</Term> so new single-select choices are created
              automatically.
            </>,
            <>
              Per-request caching (<Term>cache()</Term>) dedupes lookups like the project, member and
              staffing indexes within a single render.
            </>,
          ]}
        />
      </Section>

      <Section title="Key derivations & rules in code" intro="Logic that keeps data consistent.">
        <Bullets
          items={[
            <>
              <strong>Payment project</strong> is inherited from the linked invoice&apos;s staffing on
              both read and write, so it can never drift from the staffing.
            </>,
            <>
              <strong>Days used</strong> per staffing = sum of hours on Under review and Approved
              timesheets ÷ 8. Draft/Rejected/Cancelled never count.
            </>,
            <>
              <strong>FX &amp; EUR</strong>: amounts normalise to EUR at write time; the FX rate is
              fetched when the currency changes (EUR pins to 1).
            </>,
            <>
              <strong>Codes</strong> are generated in the application (no longer by Airtable
              formulas): project = <Term>CLIENT-YEAR-NN</Term> (year from the start date, so it rolls
              over automatically); staffing = <Term>{"{ProjectCode}_{MemberCode}"}</Term>;
              member/client codes derive from the name. All are uniqueness-checked. The staffing
              write is tolerant of the Airtable field still being a formula during migration. It
              retries without the code if the field rejects a written value.
            </>,
            <>
              <strong>Timesheet statuses</strong> stop at Approved. Nothing in code flips a timesheet
              to Paid; the invoice-paid cascade only marks the member invoice Paid.
            </>,
          ]}
        />
      </Section>

      <Section title="Integrations" intro="External services the portal calls.">
        <Bullets
          items={[
            <>
              <strong>Microsoft Graph</strong> sends all email (invoice submissions, client-review
              links, payment receipts, surveys, upload notices) from the configured mailbox through a
              single dispatcher. Each email&apos;s subject + body come from a central catalog whose
              defaults can be overridden per email in <Term>Admin → Emails</Term> (stored in Airtable,
              interpolated with runtime placeholders at send time).
            </>,
            <>
              <strong>Anthropic (Claude)</strong> powers the contract-PDF extraction, document search,
              and the message &ldquo;rewrite&rdquo; helper. Absent an API key, those features degrade
              gracefully.
            </>,
            <>
              An <strong>FX rate</strong> endpoint provides currency-to-EUR conversions used on
              projects, staffings and payments.
            </>,
          ]}
        />
      </Section>

      <Section title="Core data flow" intro="How a week of work becomes a paid invoice.">
        <Flow
          nodes={[
            { label: "Timesheet approved", tone: "success" },
            { label: "Member invoice", tone: "brand" },
            { label: "Outflow payment", tone: "warning" },
            { label: "Payment marked Paid", tone: "success" },
            { label: "Invoice marked Paid", tone: "success" },
          ]}
        />
        <p className="mt-3 text-xs text-slate-500">
          Approving is audited in the Timesheet Reviews table. Submitting an invoice auto-creates the
          payment (Under review). Marking the payment Paid cascades to mark the member invoice Paid.
          Timesheet status is not changed by this cascade.
        </p>
      </Section>

      <Section title="Auditability" intro="What is recorded.">
        <Bullets
          items={[
            <>
              Timesheet decisions (submitted, approved, rejected, edited, status changed) are written
              to a dedicated <strong>Timesheet Reviews</strong> table with actor, method, timestamp
              and comment.
            </>,
            <>
              Every automated email is logged (sender, recipients, subject, attachments and the
              send outcome) and shown under <Term>Admin → Emails → Sent log</Term>.
            </>,
            <>
              App sign-ins are logged so the Network / HR → App activity view shows who used the
              portal and when.
            </>,
            <>
              The payment ↔ staffing audit endpoint can be run to confirm every invoice-settling
              payment is filed under the correct project.
            </>,
          ]}
        />
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function DocsClient() {
  const [tab, setTab] = useState<"business" | "technical">("business");
  return (
    <div className="space-y-4">
      <SegmentedTabs
        ariaLabel="Documentation section"
        value={tab}
        onChange={setTab}
        options={[
          { value: "business", label: "Business processes" },
          { value: "technical", label: "Technical implementation" },
        ]}
      />
      <QuickNav titles={tab === "business" ? BUSINESS_SECTIONS : TECHNICAL_SECTIONS} />
      {tab === "business" ? <BusinessProcesses /> : <TechnicalImplementation />}
    </div>
  );
}
