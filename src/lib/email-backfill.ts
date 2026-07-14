import { env } from "./env";
import { getGraphAppToken } from "./email";
import { emailTypeFromSubject } from "./email-templates";
import {
  createEmailLogRows,
  getLoggedSourceIndex,
  addEmailLogFiles,
  type EmailLogImportRow,
} from "./airtable";

// Backfill the email send log from the sender mailbox's Sent Items folder.
// Every automated email is sent with saveToSentItems=true, so the mailbox holds
// the real history. Requires the Azure app to have the Mail.Read application
// permission on the sender mailbox (admin consent in Entra) — the same kind of
// permission the vendor-invoice importer already relies on for its mailbox.

type GraphRecipient = { emailAddress?: { address?: string; name?: string } };
type GraphSentMessage = {
  id: string;
  internetMessageId?: string;
  subject?: string;
  sentDateTime?: string;
  hasAttachments?: boolean;
  from?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
};

const addr = (r: GraphRecipient | undefined): string => r?.emailAddress?.address ?? "";
const addrs = (list: GraphRecipient[] | undefined): string =>
  (list ?? []).map(addr).filter(Boolean).join(", ");

type FetchedAttachment = { filename: string; contentType: string; base64: string; size: number };

// Pull the real file bytes for a message's attachments so they can be stored on
// the log row (and thus opened later). Skips inline images and non-file parts.
async function fetchAttachments(
  token: string,
  mailbox: string,
  messageId: string,
): Promise<FetchedAttachment[]> {
  try {
    const url =
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}` +
      `/messages/${messageId}/attachments`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      value?: Array<{
        "@odata.type"?: string;
        name?: string;
        size?: number;
        contentType?: string;
        contentBytes?: string;
        isInline?: boolean;
      }>;
    };
    return (data.value ?? [])
      .filter((a) => !a.isInline && a.contentBytes && a.name)
      .map((a) => ({
        filename: a.name as string,
        contentType: a.contentType || "application/octet-stream",
        base64: a.contentBytes as string,
        size: a.size ?? 0,
      }));
  } catch {
    return [];
  }
}

export type BackfillResult =
  | { ok: true; imported: number; scanned: number; skipped: number; filled: number }
  | { ok: false; error: string };

export async function backfillEmailLogFromSentItems(limit = 200): Promise<BackfillResult> {
  const mailbox = env.invoiceSender || env.invoiceRecipient;
  if (!mailbox) return { ok: false, error: "No sender mailbox configured (INVOICE_SENDER_UPN)." };

  let token: string;
  try {
    token = await getGraphAppToken();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not get a Graph token." };
  }

  const seen = await getLoggedSourceIndex();
  const messages: GraphSentMessage[] = [];
  let url =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders/sentitems/messages` +
    `?$top=50&$select=id,internetMessageId,subject,sentDateTime,hasAttachments,from,toRecipients,ccRecipients` +
    `&$orderby=sentDateTime desc`;

  try {
    while (url && messages.length < limit) {
      const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        if (res.status === 403 || res.status === 401) {
          return {
            ok: false,
            error:
              "Graph denied access to the mailbox. The Azure app needs the Mail.Read application " +
              `permission (admin consent) on ${mailbox}. (${res.status})`,
          };
        }
        return { ok: false, error: `Graph read failed (${res.status}): ${text.slice(0, 200)}` };
      }
      const data = (await res.json()) as {
        value?: GraphSentMessage[];
        "@odata.nextLink"?: string;
      };
      messages.push(...(data.value ?? []));
      url = data["@odata.nextLink"] ?? "";
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Graph read error." };
  }

  const scanned = messages.length;
  const asFiles = (files: FetchedAttachment[]) =>
    files.map((f) => ({ filename: f.filename, contentType: f.contentType, base64: f.base64 }));

  const rows: EmailLogImportRow[] = [];
  let filled = 0;
  for (const m of messages) {
    const sourceId = m.internetMessageId || m.id;
    if (!sourceId) continue;
    const existing = seen.get(sourceId);

    // Already logged and already has its files → nothing to do.
    if (existing && (existing.hasFiles || !m.hasAttachments)) continue;

    const files = m.hasAttachments ? await fetchAttachments(token, mailbox, m.id) : [];

    // Already logged but missing its attachments → upfill them onto the row.
    if (existing) {
      if (files.length > 0) {
        await addEmailLogFiles(existing.recordId, asFiles(files));
        filled += 1;
      }
      continue;
    }

    // New message → create a row (with files).
    const attachments = files
      .map((f) => `${f.filename} (${(f.size / 1024 / 1024).toFixed(2)} MB)`)
      .join(", ");
    rows.push({
      sentAt: m.sentDateTime ?? "",
      label: emailTypeFromSubject(m.subject ?? ""),
      status: "Sent",
      from: addr(m.from) || mailbox,
      to: addrs(m.toRecipients),
      cc: addrs(m.ccRecipients),
      subject: m.subject ?? "",
      attachments,
      sourceId,
      files: asFiles(files),
    });
  }

  try {
    const imported = await createEmailLogRows(rows);
    return { ok: true, imported, scanned, skipped: scanned - rows.length - filled, filled };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not write log rows." };
  }
}
