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
  patchPaymentInvoiceMeta,
  saveMemberInvoiceExtraction,
  type Currency,
} from "@/lib/airtable";
import { extractInvoiceFromPdfBase64 } from "@/lib/invoice-extract";
import { env } from "@/lib/env";
import { postToSlack } from "@/lib/slack";
import { hasPdfSignature } from "@/lib/file-signatures";

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
  // Kept so we can backfill the payment's reference + due date from the PDF
  // once it's extracted below.
  let paymentId: string | null = null;
  try {
    paymentId = await createPayment({
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
      // Copy the two fields finance needs on the payment itself: the invoice
      // reference and the due date. Only write what was actually read (an
      // empty extraction leaves the payment's blanks as-is).
      if (paymentId) {
        const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(data.dueDate) ? data.dueDate : undefined;
        const invoiceReference = data.invoiceNumber?.trim() || undefined;
        await patchPaymentInvoiceMeta(paymentId, { dueDate, invoiceReference });
      }
    } catch (e) {
      console.error("invoice extraction on submit failed:", e);
    }

    // 3) Send notification email (best-effort). The user's invoice PDF
    // always goes as an attachment. When timesheets were selected we also
    // build a clean PDF summary of them (week-by-week breakdown) and ship
    // it alongside so finance has the supporting detail next to the bill.
    const member = session.fullName || session.email || session.memberCode;

    const totalCoveredHours = chosenTimesheets.reduce((s, t) => s + t.totalHours, 0);
    const amountStr2 = amount != null ? `${amount.toLocaleString("en-US")} ${currency || ""}`.trim() : "—";
    const tsNote =
      chosenTimesheets.length > 0
        ? ` · ${chosenTimesheets.length} week${chosenTimesheets.length === 1 ? "" : "s"}, ${totalCoveredHours.toFixed(1)}h`
        : "";
    // Notify finance on Slack (#payments) instead of email. The invoice PDF is
    // already stored on the record; the Slack note links to it in the portal.
    const slackText =
      `*🧾 Invoice submitted* — ${member} · *${amountStr2}*\n` +
      `${staffing.staffingCode || project.projectCode}${project.projectName ? ` (${project.projectName})` : ""}${tsNote}` +
      `${comment ? `\n_${comment}_` : ""}\n→ ${env.appUrl}/admin/payments`;
    const posted = await postToSlack(env.slackChannels.payments, slackText);
    await markInvoiceEmail(
      invoiceId,
      posted.ok
        ? { ok: true, sentAt: new Date().toISOString() }
        : { ok: false, error: posted.error ?? "slack post failed" },
    );
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
