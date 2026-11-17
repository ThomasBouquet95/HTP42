import { env } from "./env";
import { listClients, listProjects, type PaymentRecord } from "./airtable";
import { postToSlack } from "./slack";

// Payment recap posted to Slack (#payments) whenever ANY payment — inflow or
// outflow — is marked Paid: from the payments list / modal / review page, and
// when an automated vendor invoice auto-creates its Paid payment on import or on
// manual review. (Previously an email to the finance/bookkeeping inbox with the
// invoice PDF; moved to Slack.) The invoice PDF itself stays on the record in
// the portal — the Slack note links to it.
export async function notifyPaymentPaid(
  p: PaymentRecord,
): Promise<{ ok: boolean; error?: string }> {
  try {
    return await postPaymentPaid(p);
  } catch (e) {
    const error = e instanceof Error ? e.message : "Failed to post payment recap";
    console.error("Payment-paid Slack post failed:", error);
    return { ok: false, error };
  }
}

async function postPaymentPaid(p: PaymentRecord): Promise<{ ok: boolean; error?: string }> {
  const label = p.invoiceReference || p.beneficiary || p.paymentCode || p.id;
  const isPaid = p.paymentStatus === "Paid";
  // Wording follows the actual status: only a truly Paid payment says "paid";
  // otherwise it reads as an invoice copy and names the current status.
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

  // Resolve project/client to readable names via record IDs (never the linked
  // *Codes, which are record ids).
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
    `→ ${env.appUrl}/admin/payments`,
  ].filter(Boolean);

  const posted = await postToSlack(env.slackChannels.payments, parts.join("\n"));
  if (!posted.ok) console.error("Payment-paid Slack post failed:", posted.error);
  return posted;
}
