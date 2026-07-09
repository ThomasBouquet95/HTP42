import { env } from "./env";
import { getGraphAppToken } from "./email";

// Read paid IT / vendor invoices from a shared mailbox via Microsoft Graph.
// The Azure app the portal already uses for Mail.Send needs the additional
// application permission "Mail.Read" (admin consent in Entra) for this to
// work. Without it, Graph returns 403 and the importer records the error and
// imports nothing — the rest of the portal is unaffected.

export type MailPdf = { filename: string; base64: string };

export type MailInvoice = {
  // internetMessageId is the stable, cross-folder identifier we dedupe on.
  messageId: string;
  subject: string;
  from: string;
  receivedDateTime: string;
  pdfs: MailPdf[];
};

type GraphMessage = {
  id: string;
  subject?: string;
  internetMessageId?: string;
  receivedDateTime?: string;
  hasAttachments?: boolean;
  from?: { emailAddress?: { address?: string; name?: string } };
};

type GraphAttachment = {
  "@odata.type"?: string;
  name?: string;
  contentType?: string;
  contentBytes?: string;
  isInline?: boolean;
};

function isPdf(a: GraphAttachment): boolean {
  if (a["@odata.type"] !== "#microsoft.graph.fileAttachment") return false;
  if (!a.contentBytes) return false;
  const ct = (a.contentType ?? "").toLowerCase();
  const name = (a.name ?? "").toLowerCase();
  return ct === "application/pdf" || name.endsWith(".pdf");
}

// Fetch the most recent messages that carry attachments from the billing
// mailbox, then pull their PDF attachments. `limit` caps how many messages we
// scan per run (newest first) so a huge mailbox never blocks the cron.
export async function fetchInvoiceMails(limit = 50): Promise<
  { ok: true; invoices: MailInvoice[] } | { ok: false; error: string }
> {
  const mailbox = env.automatedInvoiceMailbox;
  if (!mailbox) return { ok: false, error: "AUTOMATED_INVOICE_MAILBOX is not configured" };

  let token: string;
  try {
    token = await getGraphAppToken();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Graph token error" };
  }

  const base = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}`;
  const listUrl =
    // Graph rejects a `hasAttachments` $filter combined with an $orderby
    // ("InefficientFilter"). So we sort by newest and skip attachment-less
    // messages client-side using the hasAttachments flag in $select.
    `${base}/messages?$top=${Math.min(Math.max(limit, 1), 100)}` +
    `&$orderby=${encodeURIComponent("receivedDateTime desc")}` +
    `&$select=${encodeURIComponent("id,subject,internetMessageId,receivedDateTime,hasAttachments,from")}`;

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!listRes.ok) {
    const text = await listRes.text().catch(() => "");
    return { ok: false, error: `Graph list failed (${listRes.status}): ${text.slice(0, 300)}` };
  }
  const listData = (await listRes.json()) as { value?: GraphMessage[] };
  const messages = listData.value ?? [];

  const invoices: MailInvoice[] = [];
  for (const m of messages) {
    if (m.hasAttachments === false) continue;
    const attRes = await fetch(
      `${base}/messages/${m.id}/attachments?$select=${encodeURIComponent("name,contentType,contentBytes")}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    );
    if (!attRes.ok) continue;
    const attData = (await attRes.json()) as { value?: GraphAttachment[] };
    const pdfs = (attData.value ?? [])
      .filter(isPdf)
      .map((a) => ({ filename: a.name || "invoice.pdf", base64: a.contentBytes as string }));
    if (pdfs.length === 0) continue;
    invoices.push({
      messageId: m.internetMessageId || m.id,
      subject: m.subject ?? "",
      from: m.from?.emailAddress?.address ?? m.from?.emailAddress?.name ?? "",
      receivedDateTime: m.receivedDateTime ?? "",
      pdfs,
    });
  }
  return { ok: true, invoices };
}
