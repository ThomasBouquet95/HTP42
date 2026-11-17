import { sendMailViaGraph } from "./email";
import { env } from "./env";
import { getInvoiceById, listClients, listProjects, type PaymentRecord } from "./airtable";
import { assertSafeFetchUrl } from "./net-guard";
import { postToSlack } from "./slack";

// When a payment is marked Paid we do two independent things:
//   1) EMAIL the invoice PDF to the external bookkeeping intakes (Fulll + Qonto)
//      — important, they feed the accounting systems. NO humans are copied.
//   2) POST a recap to Slack (#payments) so the team has visibility without
//      being emailed.
// The recap also fires as a "resend invoice" for a payment that is not yet paid;
// the wording follows the actual status.

const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024; // Graph inline-attachment cap

export async function notifyPaymentPaid(
  p: PaymentRecord,
): Promise<{ ok: boolean; error?: string }> {
  try {
    return await handlePaymentPaid(p);
  } catch (e) {
    const error = e instanceof Error ? e.message : "Failed to notify payment";
    console.error("notifyPaymentPaid failed:", error);
    return { ok: false, error };
  }
}

async function handlePaymentPaid(p: PaymentRecord): Promise<{ ok: boolean; error?: string }> {
  const label = p.invoiceReference || p.beneficiary || p.paymentCode || p.id;
  const isPaid = p.paymentStatus === "Paid";
  const heading = isPaid
    ? p.direction === "Inflow"
      ? "Inflow received"
      : p.direction === "Outflow"
        ? "Outflow paid"
        : "Payment recorded"
    : p.direction === "Inflow"
      ? "Inflow invoice"
      : p.direction === "Outflow"
        ? "Outflow invoice"
        : "Invoice";
  const amountLine =
    p.invoiceValue != null
      ? `${p.invoiceValue.toLocaleString("en-US")} ${p.invoiceCurrency || ""}`.trim()
      : "—";

  // --- 1) Email the invoice PDF to the external bookkeeping intakes ---
  // Prefer the payment's own uploaded PDF, else its free-text URL (SSRF-guarded),
  // else the PDF on a linked member invoice.
  type PdfSource = { url: string; userProvided: boolean; label: string };
  const sources: PdfSource[] = [];
  if (p.invoicePdf?.url) sources.push({ url: p.invoicePdf.url, userProvided: false, label });
  else if (p.invoiceUrl) sources.push({ url: p.invoiceUrl, userProvided: true, label });
  if (sources.length === 0 && p.memberInvoiceRecordIds.length > 0) {
    try {
      const invoices = await Promise.all(
        p.memberInvoiceRecordIds.map((iid) => getInvoiceById(iid).catch(() => null)),
      );
      for (const inv of invoices) {
        if (inv?.pdf?.url) sources.push({ url: inv.pdf.url, userProvided: false, label: inv.invoiceCode || label });
      }
    } catch (e) {
      console.error("Could not load linked member invoice PDF for bookkeeping email:", e);
    }
  }
  const attachments: { filename: string; contentType: string; base64: string }[] = [];
  for (const s of sources) {
    const fetched = await fetchInvoicePdf(s.url, s.label, s.userProvided);
    if (fetched.ok) attachments.push(fetched.attachment);
    else console.error("Bookkeeping PDF fetch failed:", fetched.error);
  }

  let emailOk: boolean | null = null;
  const inboxes = env.bookkeepingInboxes;
  // Only email the intakes when there's a PDF to file — a PDF-less note would
  // just be noise in Fulll/Qonto.
  if (attachments.length > 0 && inboxes.length > 0) {
    const res = await sendMailViaGraph({
      to: inboxes,
      subject: `${heading}: ${label} — ${amountLine}`,
      textBody: `${heading} in the HTP42 portal: ${label} (${amountLine}). Invoice attached for your records.`,
      attachments,
      logLabel: "payment_bookkeeping",
    });
    emailOk = res.ok;
    if (!res.ok) console.error("Bookkeeping email failed:", res.error);
  }

  // --- 2) Slack recap for the team ---
  let projectLabel = "";
  let clientLabel = "";
  try {
    const [projects, clients] = await Promise.all([listProjects(), listClients()]);
    const projById = new Map(projects.map((pr) => [pr.id, pr]));
    const cliById = new Map(clients.map((c) => [c.id, c]));
    const resolvedProjects = p.projectRecordIds
      .map((id) => {
        const pr = projById.get(id);
        return pr ? (pr.projectName ? `${pr.projectCode} · ${pr.projectName}` : pr.projectCode) : "";
      })
      .filter(Boolean);
    const resolvedClients = p.clientRecordIds
      .map((id) => {
        const c = cliById.get(id);
        return c ? (c.clientName ? `${c.clientCode} · ${c.clientName}` : c.clientCode) : "";
      })
      .filter(Boolean);
    if (resolvedProjects.length > 0) projectLabel = resolvedProjects.join(", ");
    if (resolvedClients.length > 0) clientLabel = resolvedClients.join(", ");
  } catch (e) {
    console.error("Could not resolve project/client names for payment recap:", e);
  }
  const parts = [
    `*💸 ${heading}* — ${label}`,
    `Amount: *${amountLine}*${p.invoiceReference ? ` · ref ${p.invoiceReference}` : ""}` +
      `${p.paymentStatus ? ` · ${p.paymentStatus}` : ""}`,
    projectLabel ? `Project: ${projectLabel}` : "",
    clientLabel ? `Client: ${clientLabel}` : "",
    p.paymentDate ? `Date: ${p.paymentDate}` : "",
    attachments.length > 0 ? "Invoice sent to Fulll + Qonto." : "_No invoice PDF to file with Fulll/Qonto._",
    `→ ${env.appUrl}/admin/payments`,
  ].filter(Boolean);
  const posted = await postToSlack(env.slackChannels.payments, parts.join("\n"));
  if (!posted.ok) console.error("Payment recap Slack post failed:", posted.error);

  // The email to the external systems is the important half; report its result
  // when we tried to send it, else the Slack result.
  return emailOk == null ? posted : { ok: emailOk };
}

async function fetchInvoicePdf(
  url: string,
  label: string,
  guard: boolean,
): Promise<
  | { ok: true; attachment: { filename: string; contentType: string; base64: string } }
  | { ok: false; error: string }
> {
  try {
    if (guard) {
      const unsafe = await assertSafeFetchUrl(url);
      if (unsafe) return { ok: false, error: `Refused to fetch invoice URL (${unsafe})` };
    }
    const res = await fetch(url, { redirect: guard ? "manual" : "follow" });
    if (guard && (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400))) {
      return { ok: false, error: "Invoice URL redirected; upload the PDF instead." };
    }
    if (!res.ok) return { ok: false, error: `HTTP ${res.status} fetching invoice URL` };
    const contentType = res.headers.get("content-type") ?? "";
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
      return { ok: false, error: `PDF over the ${(MAX_ATTACHMENT_BYTES / 1024 / 1024).toFixed(0)} MB inline cap` };
    }
    if (buffer.slice(0, 5).toString("ascii") !== "%PDF-") {
      return { ok: false, error: `URL did not return a PDF (got ${contentType || "unknown"})` };
    }
    const safeLabel = label.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "invoice";
    return {
      ok: true,
      attachment: { filename: `${safeLabel}.pdf`, contentType: "application/pdf", base64: buffer.toString("base64") },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fetch failed" };
  }
}
