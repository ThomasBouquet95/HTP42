import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  attachInvoicePdf,
  createMemberInvoice,
  createPayment,
  getInvoiceById,
  getStaffingsForMember,
  getTimesheetsForMember,
  listInvoicesForMember,
  listProjects,
  markInvoiceEmail,
  saveMemberInvoiceExtraction,
  type Currency,
} from "@/lib/airtable";
import { extractInvoiceFromPdfBase64 } from "@/lib/invoice-extract";
import { env } from "@/lib/env";
import { sendMailViaGraph } from "@/lib/email";
import { resolveEmail } from "@/lib/email-templates-server";
import { hasPdfSignature } from "@/lib/file-signatures";
import { generateTimesheetSummaryPdf } from "@/lib/timesheet-pdf";

export const runtime = "nodejs";
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const invoices = await listInvoicesForMember(session.sub);
  return NextResponse.json({ invoices });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

  const staffingId = String(form.get("staffingId") ?? "").trim();
  const amountStr = String(form.get("amount") ?? "").trim();
  const currency = String(form.get("currency") ?? "").trim();
  const comment = String(form.get("comment") ?? "").trim().slice(0, 5000);
  const file = form.get("pdf");
  // Member-selected timesheets covered by this invoice. Optional, but if
  // present they get flipped to Invoiced as soon as the record is created so
  // the admin doesn't have to chase the status update manually.
  const timesheetIds = form
    .getAll("timesheetIds")
    .map((v) => String(v).trim())
    .filter(Boolean);

  if (!staffingId) return NextResponse.json({ error: "Staffing is required." }, { status: 400 });
  if (!amountStr) return NextResponse.json({ error: "Amount is required." }, { status: 400 });
  if (!["EUR", "USD", "CHF"].includes(currency)) {
    return NextResponse.json({ error: "Currency is required." }, { status: 400 });
  }
  if (!comment) return NextResponse.json({ error: "Comment is required." }, { status: 400 });
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A PDF file is required." }, { status: 400 });
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Only PDF files are accepted." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `PDF is too large (${(file.size / 1024 / 1024).toFixed(2)} MB). Max 2 MB.` },
      { status: 400 },
    );
  }

  // Resolve and authorise: the staffing must belong to the submitting member.
  // We pull the member's own staffings rather than trusting a free-form id —
  // this enforces "users only see/invoice against their own staffing".
  const myStaffings = await getStaffingsForMember(session.memberCode);
  const staffing = myStaffings.find((s) => s.id === staffingId);
  if (!staffing) {
    return NextResponse.json(
      { error: "Unknown staffing. Pick one from your list." },
      { status: 400 },
    );
  }
  // Resolve the project record id from the staffing's project code so the
  // legacy Project link on the invoice stays populated for admin views.
  const projects = await listProjects();
  const project = projects.find((p) => p.projectCode === staffing.projectCode);
  if (!project) {
    return NextResponse.json(
      {
        error:
          `This staffing (${staffing.staffingCode}) points at project code "${staffing.projectCode}", ` +
          `but there is no project with that code in the system. Ask an admin to create that project or ` +
          `correct the staffing's project code, then try again.`,
      },
      { status: 400 },
    );
  }

  const amount = Number(amountStr);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Amount must be a positive number." }, { status: 400 });
  }

  // Validate the timesheet selection before any writes: each id must be one
  // of the member's own timesheets, be on the picked staffing, and be
  // invoiceable. A week can be invoiced while still Under review (Submitted)
  // or once Approved; Draft/Rejected can't (not yet cleared / sent back) and
  // Invoiced/Paid can't be re-invoiced.
  let timesheetsToInvoice: string[] = [];
  // We keep the resolved records so we can both bake them into a PDF
  // attachment and list them in the email body without re-fetching.
  type ChosenTs = Awaited<ReturnType<typeof getTimesheetsForMember>>[number];
  let chosenTimesheets: ChosenTs[] = [];
  if (timesheetIds.length > 0) {
    const myTimesheets = await getTimesheetsForMember(session.memberCode);
    const byId = new Map(myTimesheets.map((t) => [t.id, t]));
    for (const id of timesheetIds) {
      const t = byId.get(id);
      if (!t) {
        return NextResponse.json(
          { error: "One of the selected timesheets isn't yours." },
          { status: 400 },
        );
      }
      if (t.staffingRecordId !== staffing.id) {
        return NextResponse.json(
          { error: `Timesheet ${t.timesheetCode} isn't on the picked staffing.` },
          { status: 400 },
        );
      }
      if (t.status !== "Approved" && t.status !== "Submitted") {
        const shown = t.status;
        return NextResponse.json(
          {
            error: `Timesheet ${t.timesheetCode} is ${shown} and can't be invoiced. Only weeks that are under review or approved can be added.`,
          },
          { status: 400 },
        );
      }
      chosenTimesheets.push(t);
    }
    timesheetsToInvoice = timesheetIds;
    // Sort chronologically so the PDF + email body read top-to-bottom by week.
    chosenTimesheets.sort((a, b) =>
      (a.startDate ?? "").localeCompare(b.startDate ?? ""),
    );
  }

  // 1) Create the invoice record (no PDF yet). The covered timesheet weeks are
  // recorded on the invoice itself — the timesheets keep their own status
  // (Under review / Approved); billing lives on the invoice + payment.
  const invoiceId = await createMemberInvoice({
    memberRecordId: session.sub,
    staffingRecordId: staffing.id,
    projectRecordId: project.id,
    amount,
    currency: (["EUR", "USD", "CHF"].includes(currency) ? (currency as Currency) : "") as Currency | "",
    comment,
    timesheetRecordIds: timesheetsToInvoice,
    pdfAttachment: null,
  });

  // 1a) Auto-create a matching Outflow payment so finance picks the
  // invoice up in /admin/payments as soon as it lands. The payment starts
  // in "Under Review" so an admin still has to triage it (verify amount,
  // PDF, etc.) before promoting to To be paid or Paid. Best-effort: an
  // Airtable hiccup here mustn't lose the user's invoice submission, so
  // we log and continue.
  const paymentCurrency: Currency | "" = (["EUR", "USD", "CHF"].includes(currency)
    ? (currency as Currency)
    : "") as Currency | "";
  try {
    await createPayment({
      direction: "Outflow",
      type: "Subcontractor",
      projectRecordIds: [project.id],
      clientRecordIds: [],
      memberRecordIds: [session.sub],
      memberInvoiceRecordIds: [invoiceId],
      // Link the exact staffing the member selected — the source of truth for
      // this payment's project (createPayment derives the project from it).
      staffingRecordIds: [staffing.id],
      invoiceDate: new Date().toISOString().slice(0, 10),
      invoiceReference: "",
      invoiceCurrency: paymentCurrency,
      invoiceValue: amount,
      fxRateToEur: null,
      invoiceValueEur: null,
      paymentTerms: "",
      paymentStatus: "Under Review",
      paymentDate: null,
      dueDate: null,
      beneficiary: session.fullName || session.email || session.memberCode,
      comment: comment ? `From invoice submission: ${comment}` : "",
      invoiceUrl: "",
    });
  } catch (e) {
    console.error("Auto-create payment for invoice failed:", e);
  }

  // Note: the covered timesheets are NOT changed here. Their lifecycle stops at
  // Approved; the fact that they were billed is recorded on the invoice
  // (Covered Timesheets) and on the linked payment. They stay Under review /
  // Approved and are approved at the payment stage if still under review.

  // 2) Upload the PDF directly to the new record's PDF field.
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    if (!hasPdfSignature(buf)) {
      return NextResponse.json({ error: "That file isn't a valid PDF." }, { status: 400 });
    }
    const base64 = buf.toString("base64");
    const filename = file.name || `invoice-${invoiceId}.pdf`;
    await attachInvoicePdf(invoiceId, filename, base64);

    // Smart-extract the invoice's key fields so admins can see what's inside
    // without opening the PDF. Best-effort: a failure (no API key, slow model,
    // odd PDF) must never block the member's submission — the admin backfill
    // button can fill any gaps later.
    try {
      const data = await extractInvoiceFromPdfBase64(base64);
      await saveMemberInvoiceExtraction(invoiceId, data);
    } catch (e) {
      console.error("invoice extraction on submit failed:", e);
    }

    // 3) Send notification email (best-effort). The user's invoice PDF
    // always goes as an attachment. When timesheets were selected we also
    // build a clean PDF summary of them (week-by-week breakdown) and ship
    // it alongside so finance has the supporting detail next to the bill.
    const member = session.fullName || session.email || session.memberCode;

    const totalCoveredHours = chosenTimesheets.reduce((s, t) => s + t.totalHours, 0);
    // Plain-text + HTML listings of the covered timesheets, used in both
    // the body and the supporting PDF.
    const tsTextLines = chosenTimesheets.map((t) => {
      const range = t.endDate
        ? `Week of ${t.startDate} → ${t.endDate}`
        : `Week of ${t.startDate ?? "—"}`;
      return `- ${range} · ${t.timesheetCode} · ${t.totalHours.toFixed(2)} h`;
    });
    const tsHtmlList = chosenTimesheets
      .map((t) => {
        const range = t.endDate
          ? `Week of ${t.startDate} → ${t.endDate}`
          : `Week of ${t.startDate ?? "—"}`;
        return `<li><strong>${range}</strong> · ${t.timesheetCode} · <code>${t.totalHours.toFixed(
          2,
        )} h</code></li>`;
      })
      .join("");

    const coveredTimesheets =
      chosenTimesheets.length > 0
        ? {
            text: `Covered timesheets (${chosenTimesheets.length}, total ${totalCoveredHours.toFixed(
              2,
            )} h):\n${tsTextLines.join("\n")}`,
            html: `<p><strong>Covered timesheets</strong> (${chosenTimesheets.length}, total <code>${totalCoveredHours.toFixed(
              2,
            )} h</code>):</p><ul>${tsHtmlList}</ul><p>A detailed week-by-week breakdown is attached as a separate PDF.</p>`,
          }
        : { text: "", html: "" };

    const {
      name,
      subject,
      textBody: text,
      htmlBody: html,
      to,
      cc,
      from,
    } = await resolveEmail("invoice_submitted", {
      member,
      memberEmail: session.email || "",
      staffingOrProject: staffing.staffingCode || project.projectCode,
      staffingCode: staffing.staffingCode,
      projectCode: project.projectCode,
      projectName: project.projectName,
      amount: amount != null ? `${amount.toLocaleString("en-US")} ${currency || ""}`.trim() : "—",
      comment: comment || "—",
      coveredTimesheets,
      portalUrl: `${env.appUrl}/admin/payments`,
    });
    // Always copy the submitting member on their own invoice (their @htp42.com
    // login address), in addition to any configured CC.
    const ccList = [session.email, ...cc].filter((v): v is string => !!v);

    // Build the attachments array. The user's own invoice PDF always
    // ships; the generated timesheet summary only when timesheets were
    // selected.
    const attachments: { filename: string; contentType: string; base64: string }[] = [
      { filename, contentType: "application/pdf", base64 },
    ];
    if (chosenTimesheets.length > 0) {
      try {
        const tsPdf = await generateTimesheetSummaryPdf(
          {
            memberName: session.fullName || session.email || session.memberCode,
            memberCode: session.memberCode,
            amount,
            currency,
            comment,
            staffingCode: staffing.staffingCode,
            projectCode: project.projectCode,
            projectName: project.projectName,
            subtitle: `Attached to the invoice submission from ${
              session.fullName || session.email || session.memberCode
            } (${session.memberCode}).`,
          },
          chosenTimesheets.map((t) => ({
            timesheetCode: t.timesheetCode,
            staffingCode: t.staffingCode,
            projectCode: t.projectCode,
            projectName: t.projectName,
            startDate: t.startDate,
            endDate: t.endDate,
            submissionDate: t.submissionDate,
            totalHours: t.totalHours,
            monday: t.monday,
            tuesday: t.tuesday,
            wednesday: t.wednesday,
            thursday: t.thursday,
            friday: t.friday,
          })),
        );
        attachments.push({
          filename: `timesheets-${staffing.staffingCode || project.projectCode}.pdf`,
          contentType: "application/pdf",
          base64: tsPdf.toString("base64"),
        });
      } catch (e) {
        // Don't block the invoice email if the PDF generator throws —
        // surface it in the server log; the email still goes out with the
        // member's own PDF and the inline timesheet listing.
        console.error("Timesheet summary PDF generation failed:", e);
      }
    }

    const sendResult = await sendMailViaGraph({
      to,
      cc: ccList,
      from,
      subject,
      textBody: text,
      htmlBody: html,
      attachments,
      logLabel: name,
    });
    if (sendResult.ok) {
      await markInvoiceEmail(invoiceId, { ok: true, sentAt: new Date().toISOString() });
    } else {
      await markInvoiceEmail(invoiceId, { ok: false, error: sendResult.error });
    }
  } catch (e) {
    // The PDF couldn't be attached or the email send threw. The record
    // exists so the user's submission isn't lost; surface the error.
    return NextResponse.json(
      { id: invoiceId, error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 },
    );
  }

  const invoice = await getInvoiceById(invoiceId);
  return NextResponse.json({ id: invoiceId, invoice });
}
