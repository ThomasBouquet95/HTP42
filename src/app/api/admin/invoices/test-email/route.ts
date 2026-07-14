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
  const started = Date.now();

  const resolved = await resolveEmail("invoice_email_test", {
    triggeredBy: `${session.memberCode} (${session.sub})`,
    sender: env.invoiceSender || "not set",
    recipient: env.invoiceRecipient,
  });
  // An address typed into the test box wins; otherwise use the template's To.
  const to = (body.to?.trim() || resolved.to[0] || env.invoiceRecipient).toLowerCase();
  const sender = resolved.from;
  const result = await sendMailViaGraph({
    to,
    cc: resolved.cc,
    from: resolved.from,
    subject: resolved.subject,
    textBody: resolved.textBody,
    htmlBody: resolved.htmlBody,
    logLabel: resolved.name,
  });
  const tookMs = Date.now() - started;

  if (result.ok) {
    return NextResponse.json({ ok: true, sender, to, tookMs });
  }
  return NextResponse.json(
    { ok: false, sender, to, tookMs, error: result.error },
    { status: 502 },
  );
}
