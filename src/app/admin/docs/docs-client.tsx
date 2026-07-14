"use client";

import { useState, type ReactNode } from "react";
import { SegmentedTabs } from "@/components/filters";

// ---------------------------------------------------------------------------
// Presentational helpers
// ---------------------------------------------------------------------------

function Section({ id, title, intro, children }: { id?: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {intro ? <p className="mt-1 text-xs text-slate-500">{intro}</p> : null}
      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
        {children}
      </div>
    </section>
  );
}

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

// ---------------------------------------------------------------------------
// Business processes
// ---------------------------------------------------------------------------

function BusinessProcesses() {
  return (
    <div className="space-y-6">
      <Section
        title="Roles & access"
        intro="Who can see and do what in the admin panel."
      >
        <p>
          Every member has a <strong>role</strong>. Only these roles reach the admin panel: Managing
          Partner, Operating Partner, Associate Partner, Project Manager and Network Operations.
          Network Expert, Support and unassigned members are member-only.
        </p>
        <Bullets
          items={[
            <>
              <strong>Managing Partner</strong> and <strong>Operating Partner</strong> have full,
              locked access to every page (they cannot be restricted, to avoid self-lockout).
            </>,
            <>
              Other admin roles are <strong>configurable</strong> in{" "}
              <Term>Settings → Roles &amp; access</Term>: a matrix of role × page with View / Edit
              ticks. Edit implies View.
            </>,
            <>
              A <strong>Project Manager</strong> defaults to Timesheets only, and only its Review
              sub-tab, and only for the projects they are staffed on.
            </>,
          ]}
        />
        <Rule>
          Access is enforced twice: the edge middleware checks the signed-in role, and every admin
          page/API re-checks the live role + permission before returning data. A page you cannot
          view is not shown in the navigation.
        </Rule>
      </Section>

      <Section
        title="Members & staffing"
        intro="The network of people and their project assignments."
      >
        <p className="mb-2">
          A <strong>member</strong> is a person in the network. A <strong>staffing</strong> assigns
          one member to one project at an agreed day-rate and number of days.
        </p>
        <Steps
          items={[
            <>Create the member. The member code is auto-generated from the name.</>,
            <>
              Create a staffing: pick the project and member. The staffing code is generated by
              Airtable, and the day-rate + currency default from the selected member (still
              editable).
            </>,
            <>
              As timesheets are logged, the staffing shows <strong>days used vs days allocated</strong>{" "}
              so you can see over-runs at a glance.
            </>,
          ]}
        />
        <Rule>
          Identifier codes (member, client, project) are auto-generated and shown on an amber field.
          On create they re-derive from their source; on edit, changing one asks for confirmation
          because other records reference it.
        </Rule>
      </Section>

      <Section
        title="Timesheet lifecycle"
        intro="How a week of logged time moves from draft to approved."
      >
        <Flow
          nodes={[
            { label: "Draft" },
            { label: "Submitted (Under review)", tone: "warning" },
            { label: "Approved", tone: "success" },
          ]}
        />
        <p className="mt-3">
          A member logs a week (Mon–Fri hours + tasks) as a <strong>Draft</strong>, then submits it.
          Submitting puts it <strong>Under review</strong>. A reviewer then approves or rejects it.
        </p>
        <Bullets
          items={[
            <>
              <strong>Rejected</strong> sends it back to the member, who can revise and resubmit.
            </>,
            <>
              <strong>Cancelled</strong> withdraws a week from the flow.
            </>,
            <>
              Review can be done two ways per staffing: <strong>Admin review</strong> (in the
              Timesheets → Review tab) or <strong>Client review</strong> (the client gets an emailed,
              single-use, expiring link and needs no account).
            </>,
          ]}
        />
        <Rule tone="warning">
          A timesheet stops at <strong>Approved</strong>. &ldquo;Invoiced&rdquo; and
          &ldquo;Paid&rdquo; are not timesheet statuses. Whether the work was billed or paid is
          tracked on the payment, not on the timesheet.
        </Rule>
      </Section>

      <Section title="Timesheet review" intro="Approving submitted time (admin or client).">
        <Steps
          items={[
            <>
              Open <Term>Timesheets → Review</Term>. The left rail lists members with a count of
              weeks awaiting a decision.
            </>,
            <>
              For each week you can <strong>Approve</strong> or <strong>Reject</strong> (with an
              optional comment). Weeks set for client review show &ldquo;Awaiting client&rdquo; and
              can still be overridden by an admin.
            </>,
            <>
              Every decision is written to an audit trail (who, method, when, comment). The badge on
              each timesheet shows the outcome on hover.
            </>,
            <>
              Admins can <strong>Edit</strong> a timesheet from any timesheets view (Overview,
              Review, By project, By member): correct the hours/tasks and, if needed, move it to a
              different project (staffing) or week.
            </>,
          ]}
        />
      </Section>

      <Section title="Invoicing (member submits an invoice)" intro="Turning approved work into a bill.">
        <Flow
          nodes={[
            { label: "Approved timesheets", tone: "success" },
            { label: "Member submits invoice" },
            { label: "Payment (Under review)", tone: "warning" },
          ]}
        />
        <Steps
          items={[
            <>The member picks the staffing the invoice is for.</>,
            <>
              They select the weeks it covers. The picker shows each week&apos;s status but{" "}
              <strong>only Approved weeks can be selected</strong>; the rest are disabled.
            </>,
            <>
              On submit, an <strong>Outflow payment</strong> is auto-created in{" "}
              <strong>Under review</strong> so Finance picks it up, and a notification email is sent.
            </>,
          ]}
        />
        <Rule tone="warning">
          An invoice cannot be submitted while any selected week is still under review. The message
          is explicit: timesheets must be approved by an admin or the client first.
        </Rule>
      </Section>

      <Section title="Payments" intro="Money in (clients) and money out (subcontractors, expenses, vendors).">
        <Bullets
          items={[
            <>
              Each payment is an <strong>Inflow</strong> (from a client) or an <strong>Outflow</strong>{" "}
              (to a member/vendor). Its status runs Under review → To be paid → Paid.
            </>,
            <>
              For a <strong>Subcontractor</strong> outflow, the payment is linked to the{" "}
              <strong>staffing</strong> it settles, and the project is derived from that staffing
              (not chosen separately).
            </>,
            <>
              The <strong>Review</strong> sub-tab groups payments by member for triage; By project /
              By member give totals with a projected net (all inflows minus all outflows, including
              amounts still to receive / to be paid).
            </>,
          ]}
        />
        <Rule>
          Marking a payment <strong>To be paid</strong> or <strong>Paid</strong> while its linked
          timesheets are still under review asks for confirmation, and on confirm those timesheets
          are automatically approved (paying implies the work is accepted).
        </Rule>
      </Section>

      <Section title="Projects, clients & opportunities" intro="The commercial pipeline.">
        <Bullets
          items={[
            <>
              <strong>Opportunities</strong> track potential work by stage. Winning one{" "}
              <strong>converts it to a project</strong> (prefilling name, value, objective, and an
              auto-generated project code, optionally attaching a SOW to Legal).
            </>,
            <>
              <strong>Projects</strong> belong to a client and carry the staffings, timesheets,
              invoices and contracts for the engagement. The By client view drills client → project →
              staffing.
            </>,
            <>
              <strong>Client feedback</strong> surveys and <strong>client reviews</strong> capture
              satisfaction and per-member ratings.
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
              and used to pre-fill the side, type, signatories, dates and key terms.
            </>,
            <>A project&apos;s SOW appears as a download chip across Projects, Staffing and Timesheets.</>,
          ]}
        />
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
              <strong>Days used</strong> per staffing = sum of hours on Submitted/Approved/Invoiced/Paid
              timesheets ÷ 8. Draft/Rejected/Cancelled never count.
            </>,
            <>
              <strong>FX &amp; EUR</strong>: amounts normalise to EUR at write time; the FX rate is
              fetched when the currency changes (EUR pins to 1).
            </>,
            <>
              <strong>Codes</strong>: project = <Term>CLIENT-YEAR-NN</Term> (year from the start
              date, so it rolls over automatically); member/client codes derive from the name; all
              are uniqueness-checked.
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
              <strong>Microsoft Graph</strong> sends email (invoice submissions, client-review links,
              payment receipts) from the configured mailbox.
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
      {tab === "business" ? <BusinessProcesses /> : <TechnicalImplementation />}
    </div>
  );
}
