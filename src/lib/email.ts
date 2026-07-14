import { env } from "./env";
import { logEmailSend } from "./airtable";

// Send transactional mail via Microsoft Graph using the same Azure app the
// portal already uses for SSO. Requires the app to have the application-
// level "Mail.Send" permission granted (admin consent in Entra) for the
// mailbox identified by INVOICE_SENDER_UPN. If the permission isn't there
// yet, the Graph call returns 403 and the caller records the error on the
// invoice — the rest of the flow continues so the record + PDF are still
// preserved.

type Attachment = {
  filename: string;
  contentType: string;
  base64: string;
};

type SendArgs = {
  // Either a single address or a list — single mail, multiple recipients all
  // visible to each other (use sparingly: this is To:, not Bcc:).
  to: string | string[];
  // Optional CC recipients, also visible to everyone on the mail.
  cc?: string | string[];
  // Optional sender mailbox override. Defaults to INVOICE_SENDER_UPN. The Azure
  // app must have Mail.Send on whatever mailbox is used.
  from?: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  attachments?: Attachment[];
  // Human label for the email log (the template name). Optional.
  logLabel?: string;
};

const joinAddr = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v : v ? [v] : []).map((a) => a.trim()).filter(Boolean).join(", ");

// Approximate byte size of a base64 string (4 chars ≈ 3 bytes).
function base64Bytes(b64: string): number {
  const len = b64.length;
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, (len * 3) / 4 - pad);
}

function attachmentSummary(attachments: Attachment[] | undefined): string {
  if (!attachments || attachments.length === 0) return "";
  return attachments
    .map((a) => `${a.filename} (${(base64Bytes(a.base64) / 1024 / 1024).toFixed(2)} MB)`)
    .join(", ");
}

export async function getGraphAppToken(): Promise<string> {
  return getAppToken();
}

async function getAppToken(): Promise<string> {
  const { tenantId, clientId, clientSecret } = env.azure;
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Azure token request failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Azure token response missing access_token");
  return data.access_token;
}

// Public entry: send, then record the attempt to the email log (best-effort).
export async function sendMailViaGraph(
  args: SendArgs,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await doSendMailViaGraph(args);
  // Await the log write (it swallows its own errors). Firing it un-awaited
  // would let Vercel's serverless runtime freeze the function after the
  // response returns, dropping the log row before it is written.
  await logEmailSend({
    label: args.logLabel ?? "",
    status: result.ok ? "Sent" : "Failed",
    from: (args.from?.trim() || env.invoiceSender) ?? "",
    to: joinAddr(args.to),
    cc: joinAddr(args.cc),
    subject: args.subject,
    attachments: attachmentSummary(args.attachments),
    error: result.ok ? "" : result.error,
    body: args.textBody,
  });
  return result;
}

async function doSendMailViaGraph({
  to,
  cc,
  from,
  subject,
  textBody,
  htmlBody,
  attachments,
}: SendArgs): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const sender = from?.trim() || env.invoiceSender;
    if (!sender) {
      return { ok: false, error: "INVOICE_SENDER_UPN is not configured" };
    }
    const token = await getAppToken();
    const clean = (v: string | string[] | undefined) =>
      (Array.isArray(v) ? v : v ? [v] : []).map((addr) => addr.trim()).filter(Boolean);
    const recipients = clean(to);
    if (recipients.length === 0) {
      return { ok: false, error: "No recipients" };
    }
    // Don't duplicate an address in CC if it's already a To recipient.
    const toLower = new Set(recipients.map((a) => a.toLowerCase()));
    const ccRecipients = clean(cc).filter((a) => !toLower.has(a.toLowerCase()));
    const body = {
      message: {
        subject,
        body: {
          contentType: htmlBody ? "HTML" : "Text",
          content: htmlBody ?? textBody,
        },
        toRecipients: recipients.map((address) => ({
          emailAddress: { address },
        })),
        ccRecipients: ccRecipients.map((address) => ({
          emailAddress: { address },
        })),
        attachments: (attachments ?? []).map((a) => ({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: a.filename,
          contentType: a.contentType,
          contentBytes: a.base64,
        })),
      },
      saveToSentItems: true,
    };
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const text = await res.text().catch(() => "");
    return { ok: false, error: `Graph sendMail failed (${res.status}): ${text.slice(0, 300)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown email error" };
  }
}
