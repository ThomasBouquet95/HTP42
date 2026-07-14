import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import {
  attachContractPdf,
  getContractById,
} from "@/lib/airtable";
import { env } from "@/lib/env";
import { sendMailViaGraph } from "@/lib/email";
import { resolveEmail } from "@/lib/email-templates-server";
import { apiError } from "@/lib/errors";

export const runtime = "nodejs";

// PDFs are stored as multipleAttachments on the Contracts table. Cap the
// upload at 5 MB — bigger than invoices (1 MB) because contracts can be
// long scanned PDFs, smaller than the Graph inline-attachment ceiling so
// the notification email always carries the file.
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminAction("contracts", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await getContractById(id);
  if (!existing) {
    return NextResponse.json({ error: "Contract not found." }, { status: 404 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  const file = form.get("pdf");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A PDF file is required." }, { status: 400 });
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Only PDF files are accepted." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `PDF is too large (${(file.size / 1024 / 1024).toFixed(2)} MB). Max ${MAX_BYTES / 1024 / 1024} MB.`,
      },
      { status: 400 },
    );
  }

  // 1) Attach the PDF to the Airtable row. If this fails the contract
  // record itself is untouched, so the admin can retry safely.
  const buf = Buffer.from(await file.arrayBuffer());
  const base64 = buf.toString("base64");
  const filename = file.name || `contract-${id}.pdf`;
  try {
    await attachContractPdf(id, filename, base64);
  } catch (e) {
    return apiError(e, "upload the contract PDF");
  }

  // 2) Notify HTP42's inbox so a paper trail exists outside Airtable.
  // Same destination as invoice notifications by design — finance keeps
  // one inbox for "documents that just landed in the portal". Best-
  // effort: an email failure mustn't unwind the successful upload.
  const counterparty =
    existing.clientNames.filter(Boolean).join(", ") ||
    existing.memberCodes.join(", ") ||
    existing.signatory1.company ||
    existing.signatory1.name ||
    "";
  const label =
    [existing.contractType, counterparty, existing.projectCode]
      .filter(Boolean)
      .join(" · ") || existing.id;
  const signatoryLine = [existing.signatory1, existing.signatory2]
    .filter((s) => s.name)
    .map((s) => `${s.name}${s.role ? ` (${s.role})` : ""}${s.date ? ` on ${s.date}` : ""}`)
    .join("; ");
  const { subject, textBody, htmlBody } = await resolveEmail("contract_uploaded", {
    label,
    contractType: existing.contractType || "n/a",
    counterparty: counterparty || "n/a",
    projectCode: existing.projectCode || "n/a",
    memberCodes: existing.memberCodes.length > 0 ? existing.memberCodes.join(", ") : "n/a",
    signatories: signatoryLine || "n/a",
    signatureDate: existing.signatureDate || "n/a",
    expiryDate: existing.expiryDate || "n/a",
    stage: existing.stage || "n/a",
    uploadedBy: session.fullName || session.email || session.memberCode,
    portalUrl: `${env.appUrl}/admin/contracts`,
  });

  void sendMailViaGraph({
    to: env.invoiceRecipient,
    subject,
    textBody,
    htmlBody,
    attachments: [{ filename, contentType: "application/pdf", base64 }],
  }).then((result) => {
    if (!result.ok) {
      console.error("Contract upload notification email failed:", result.error);
    }
  });

  const after = (await getContractById(id)) ?? existing;
  return NextResponse.json({ ok: true, contract: after });
}
