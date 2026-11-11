import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAction } from "@/lib/auth";
import { apiError, zodMessage } from "@/lib/errors";
import { listAllInvoices, listVendorInvoices } from "@/lib/airtable";
import { sendMailViaGraph } from "@/lib/email";
import { env } from "@/lib/env";
import { getReconRow, updateReconRow } from "@/lib/reconciliation-store";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ force: z.boolean().optional() }).default({});

// Send a matched invoice PDF to the Fulll intake. Guards:
//  - requires a confirmed match with a PDF;
//  - blocks a re-send unless { force: true } (duplicate-send prevention);
//  - LIVE send only when FULLL_SEND_ENABLED=true and an intake address is set —
//    otherwise it's a DRY RUN (records intent, sends no email) so development
//    never reaches the real accountant intake.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminAction("reconciliation", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  const force = parsed.data.force ?? false;

  const row = await getReconRow(id);
  if (!row) return NextResponse.json({ error: "Row not found." }, { status: 404 });
  if (!row.matchedInvoiceId || !row.matchedKind) {
    return NextResponse.json({ error: "Confirm an invoice match before sending." }, { status: 400 });
  }
  if (row.sentToFulllAt && !force) {
    return NextResponse.json(
      { error: `Already sent on ${row.sentToFulllAt.slice(0, 10)}. Re-send only with confirmation.`, alreadySent: true },
      { status: 409 },
    );
  }

  try {
    // Resolve the invoice PDF fresh (attachment URLs expire).
    let pdfUrl = "";
    let pdfName = "";
    let label = row.matchedLabel;
    if (row.matchedKind === "member") {
      const inv = (await listAllInvoices()).find((i) => i.id === row.matchedInvoiceId);
      if (inv?.pdf) { pdfUrl = inv.pdf.url; pdfName = inv.pdf.filename || "invoice.pdf"; label = inv.memberName || label; }
    } else {
      const inv = (await listVendorInvoices()).find((i) => i.id === row.matchedInvoiceId);
      if (inv?.pdf) { pdfUrl = inv.pdf.url; pdfName = inv.pdf.filename || "invoice.pdf"; label = inv.vendor || label; }
    }
    if (!pdfUrl) {
      return NextResponse.json({ error: "The matched invoice has no PDF to send." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const live = env.fulll.sendEnabled && !!env.fulll.intakeEmail;

    if (!live) {
      // DRY RUN: no email leaves the system.
      await updateReconRow(id, { sentToFulllAt: now, sendMode: "dryrun" });
      return NextResponse.json({ ok: true, sendMode: "dryrun" });
    }

    const fileRes = await fetch(pdfUrl);
    if (!fileRes.ok) throw new Error(`Could not download the invoice PDF (HTTP ${fileRes.status}).`);
    const base64 = Buffer.from(await fileRes.arrayBuffer()).toString("base64");

    const subject = `Facture — ${label} — ${row.debit.toFixed(2)} EUR — ${row.date}`;
    const textBody =
      `Pièce justificative pour l'opération bancaire du ${row.date} : ${row.libelle} (${row.debit.toFixed(2)} EUR).`;
    const result = await sendMailViaGraph({
      to: [env.fulll.intakeEmail],
      subject,
      textBody,
      attachments: [{ filename: pdfName, contentType: "application/pdf", base64 }],
      logLabel: "fulll_reconciliation",
    });
    if (!result.ok) throw new Error(result.error);

    await updateReconRow(id, { sentToFulllAt: now, sendMode: "live" });
    return NextResponse.json({ ok: true, sendMode: "live" });
  } catch (e) {
    return apiError(e, "send the invoice to Fulll");
  }
}
