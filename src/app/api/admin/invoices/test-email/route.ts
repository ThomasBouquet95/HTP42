import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import { env } from "@/lib/env";
import { sendMailViaGraph } from "@/lib/email";
import { resolveEmail } from "@/lib/email-templates-server";

export const runtime = "nodejs";

// Admin-only dry run for the invoice email pipeline. Sends a minimal test
// message via Microsoft Graph using the same code path as a real invoice
// submission, so a green response here means real invoices will deliver too.
export async function POST(request: Request) {
  const session = await requireAdminAction("invoices", "edit");
  if (!session) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { to?: string };
  const to = (body.to?.trim() || env.invoiceRecipient).toLowerCase();
  const sender = env.invoiceSender;
  const started = Date.now();

  const { subject, textBody, htmlBody } = await resolveEmail("invoice_email_test", {
    triggeredBy: `${session.memberCode} (${session.sub})`,
    sender: sender || "not set",
    recipient: env.invoiceRecipient,
  });
  const result = await sendMailViaGraph({ to, subject, textBody, htmlBody });
  const tookMs = Date.now() - started;

  if (result.ok) {
    return NextResponse.json({ ok: true, sender, to, tookMs });
  }
  return NextResponse.json(
    { ok: false, sender, to, tookMs, error: result.error },
    { status: 502 },
  );
}
