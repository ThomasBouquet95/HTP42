import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import { env } from "@/lib/env";
import { sendMailViaGraph } from "@/lib/email";

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

  const result = await sendMailViaGraph({
    to,
    subject: "HTP42 portal — invoice email test",
    textBody: [
      "This is a test message from the HTP42 portal.",
      `Triggered by: ${session.memberCode} (${session.sub})`,
      `Sender mailbox (INVOICE_SENDER_UPN): ${sender}`,
      `Recipient (INVOICE_RECIPIENT_EMAIL default): ${env.invoiceRecipient}`,
      "",
      "If you got this, Microsoft Graph + Mail.Send are wired up correctly.",
    ].join("\n"),
    htmlBody: `<p>This is a test message from the HTP42 portal.</p>
<ul>
  <li>Triggered by: <code>${session.memberCode}</code> (<code>${session.sub}</code>)</li>
  <li>Sender mailbox (<code>INVOICE_SENDER_UPN</code>): <code>${sender}</code></li>
  <li>Default recipient (<code>INVOICE_RECIPIENT_EMAIL</code>): <code>${env.invoiceRecipient}</code></li>
</ul>
<p>If you got this, Microsoft Graph + <code>Mail.Send</code> are wired up correctly.</p>`,
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
