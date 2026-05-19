import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  attachInvoicePdf,
  createMemberInvoice,
  getInvoiceById,
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

  const projectCode = String(form.get("projectCode") ?? "").trim();
  const amountStr = String(form.get("amount") ?? "").trim();
  const currency = String(form.get("currency") ?? "").trim();
  const comment = String(form.get("comment") ?? "").trim().slice(0, 5000);
  const file = form.get("pdf");

  if (!projectCode) return NextResponse.json({ error: "Project is required." }, { status: 400 });
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

  // Resolve project record id from the code (form sends the human-friendly
  // code; we need the record id for the linked-record field).
  const projects = await listProjects();
  const project = projects.find((p) => p.projectCode === projectCode);
  if (!project) {
    return NextResponse.json({ error: "Unknown project." }, { status: 400 });
  }

  const amount = amountStr === "" ? null : Number(amountStr);
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
    return NextResponse.json({ error: "Amount must be a positive number." }, { status: 400 });
  }

  // 1) Create the invoice record (no PDF yet).
  const invoiceId = await createMemberInvoice({
    memberRecordId: session.sub,
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
    const subject = `Invoice from ${member} — ${project.projectCode}`;
    const text = [
      `New invoice submitted by ${member} (${session.email}).`,
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
