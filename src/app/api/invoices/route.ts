import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  attachInvoicePdf,
  createMemberInvoice,
  getInvoiceById,
  getStaffingsForMember,
  listInvoicesForMember,
  listProjects,
  markInvoiceEmail,
  type Currency,
} from "@/lib/airtable";
import { env } from "@/lib/env";
import { sendMailViaGraph } from "@/lib/email";

export const runtime = "nodejs";
const MAX_BYTES = 1 * 1024 * 1024; // 1 MB

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
      { error: `PDF is too large (${(file.size / 1024 / 1024).toFixed(2)} MB). Max 1 MB.` },
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
      { error: "Unknown staffing — pick one from your list." },
      { status: 400 },
    );
  }
  // Resolve the project record id from the staffing's project code so the
  // legacy Project link on the invoice stays populated for admin views.
  const projects = await listProjects();
  const project = projects.find((p) => p.projectCode === staffing.projectCode);
  if (!project) {
    return NextResponse.json(
      { error: "Staffing is not linked to a known project." },
      { status: 400 },
    );
  }

  const amount = Number(amountStr);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Amount must be a positive number." }, { status: 400 });
  }

  // 1) Create the invoice record (no PDF yet).
  const invoiceId = await createMemberInvoice({
    memberRecordId: session.sub,
    staffingRecordId: staffing.id,
    projectRecordId: project.id,
    amount,
    currency: (["EUR", "USD", "CHF"].includes(currency) ? (currency as Currency) : "") as Currency | "",
    comment,
    pdfAttachment: null,
  });

  // 2) Upload the PDF directly to the new record's PDF field.
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const base64 = buf.toString("base64");
    const filename = file.name || `invoice-${invoiceId}.pdf`;
    await attachInvoicePdf(invoiceId, filename, base64);

    // 3) Send notification email (best-effort). The PDF goes along as an
    // attachment so the recipient gets it without clicking back into the
    // portal. Records the outcome on the invoice.
    const member = session.fullName || session.email || session.memberCode;
    const subject = `Invoice from ${member} — ${staffing.staffingCode || project.projectCode}`;
    const text = [
      `New invoice submitted by ${member} (${session.email}).`,
      `Staffing: ${staffing.staffingCode}`,
      `Project: ${project.projectCode} — ${project.projectName}`,
      amount != null ? `Amount: ${amount.toLocaleString("en-US")} ${currency || ""}`.trim() : null,
      comment ? `Comment: ${comment}` : null,
      `Open in portal: ${env.appUrl}/admin/payments`,
    ]
      .filter(Boolean)
      .join("\n");
    const html = `
      <p>New invoice submitted by <strong>${member}</strong> (${session.email}).</p>
      <ul>
        <li><strong>Staffing:</strong> ${staffing.staffingCode}</li>
        <li><strong>Project:</strong> ${project.projectCode} — ${project.projectName}</li>
        ${amount != null ? `<li><strong>Amount:</strong> ${amount.toLocaleString("en-US")} ${currency || ""}</li>` : ""}
        ${comment ? `<li><strong>Comment:</strong> ${comment.replace(/</g, "&lt;").replace(/\n/g, "<br/>")}</li>` : ""}
      </ul>
      <p>The PDF is attached. <a href="${env.appUrl}/admin/payments">Open in portal</a>.</p>
    `;
    const sendResult = await sendMailViaGraph({
      to: env.invoiceRecipient,
      subject,
      textBody: text,
      htmlBody: html,
      attachments: [{ filename, contentType: "application/pdf", base64 }],
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
