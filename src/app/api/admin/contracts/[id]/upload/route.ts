import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import {
  attachContractPdf,
  getContractById,
} from "@/lib/airtable";
import { env } from "@/lib/env";
import { postToSlack } from "@/lib/slack";
import { hasPdfSignature } from "@/lib/file-signatures";
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
  if (!hasPdfSignature(buf)) {
    return NextResponse.json({ error: "That file isn't a valid PDF." }, { status: 400 });
  }
  const base64 = buf.toString("base64");
  const filename = file.name || `contract-${id}.pdf`;
  try {
    await attachContractPdf(id, filename, base64);
  } catch (e) {
    return apiError(e, "upload the contract PDF");
  }

  // 2) Post to Slack (#finance) so a paper trail exists outside Airtable.
  // Best-effort: a Slack failure mustn't unwind the successful upload.
  const counterparty =
    existing.clientNames.filter(Boolean).join(", ") ||
    existing.signatory1.company ||
    existing.signatory1.name ||
    "";
  const label =
    [existing.contractType, counterparty, existing.projectCode].filter(Boolean).join(" · ") || existing.id;
  void postToSlack(
    env.slackChannels.finance,
    `*📄 Contract uploaded* — ${label}\nby ${session.fullName || session.email || session.memberCode} · → ${env.appUrl}/admin/contracts`,
  ).then((r) => {
    if (!r.ok) console.error("Contract upload Slack post failed:", r.error);
  });

  const after = (await getContractById(id)) ?? existing;
  return NextResponse.json({ ok: true, contract: after });
}
