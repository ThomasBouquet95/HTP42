import { sendMailViaGraph } from "./email";
import { resolveEmail } from "./email-templates-server";
import { env } from "./env";
import { listClients, listProjects, type PaymentRecord } from "./airtable";
import { assertSafeFetchUrl } from "./net-guard";

// The recipients (finance inbox + the Fulll/Qonto bookkeeping CCs) and sender
// are resolved from the editable "payment_paid" email template, so an admin can
// change them in Admin → Emails.

// Graph caps inline attachments at ~3 MB; larger PDFs are skipped (email still
// goes out with a note + the invoice URL).
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

// Recap email sent to the invoices inbox (with the accounting inboxes CC'd)
// whenever ANY payment — inflow or outflow — is marked Paid: from the payments
// list/modal/review page, AND when an automated vendor invoice auto-creates
// its Paid payment on import or on manual review.
export async function notifyPaymentPaid(
  p: PaymentRecord,
): Promise<{ ok: boolean; error?: string }> {
  try {
    return await sendPaymentPaidEmail(p);
  } catch (e) {
    const error = e instanceof Error ? e.message : "Failed to send payment email";
    console.error("Payment-paid email failed:", error);
    return { ok: false, error };
  }
}

async function sendPaymentPaidEmail(p: PaymentRecord): Promise<{ ok: boolean; error?: string }> {
  const label =
    p.invoiceReference ||
    p.beneficiary ||
    p.paymentCode ||
    p.projectCodes.join(", ") ||
    p.id;
  const heading =
    p.direction === "Inflow"
      ? "Inflow received"
      : p.direction === "Outflow"
      ? "Outflow paid"
      : "Payment recorded";
  const introText =
    p.direction === "Inflow"
      ? "An inflow (client payment) has just been marked received in the HTP42 portal."
      : p.direction === "Outflow"
      ? "An outflow payment has just been marked paid in the HTP42 portal."
      : "A payment has just been marked paid in the HTP42 portal.";

  // Attach the invoice PDF — prefer the uploaded Airtable attachment (trusted
  // host, may redirect to signed storage), else the free-text invoice URL. The
  // latter is user-controlled, so it goes through an SSRF guard and does not
  // follow redirects. Failures here shouldn't block the email.
  const uploadedUrl = p.invoicePdf?.url || "";
  const userUrl = p.invoiceUrl || "";
  const pdfSource = uploadedUrl || userUrl;
  const sourceIsUserProvided = !uploadedUrl && !!userUrl;
  let attachment:
    | { filename: string; contentType: string; base64: string }
    | null = null;
  let pdfFailure: string | null = null;
  if (pdfSource) {
    const fetched = await fetchInvoicePdf(pdfSource, label, sourceIsUserProvided);
    if (fetched.ok) attachment = fetched.attachment;
    else pdfFailure = fetched.error;
  } else {
    pdfFailure = "No invoice PDF or URL on the payment.";
  }

  const amountLine =
    p.invoiceValue != null
      ? `${p.invoiceValue.toLocaleString("en-US")} ${p.invoiceCurrency || ""}`.trim()
      : "—";

  // Resolve project/client to a readable "Code — Name" via record IDs.
  let projectLabel = p.projectCodes.join(", ");
  let clientLabel = p.clientCodes.join(", ");
  try {
    const [projects, clients] = await Promise.all([listProjects(), listClients()]);
    const projById = new Map(projects.map((pr) => [pr.id, pr]));
    const cliById = new Map(clients.map((c) => [c.id, c]));
    const fmtProject = (id: string) => {
      const pr = projById.get(id);
      if (!pr) return "";
      return pr.projectName ? `${pr.projectCode} · ${pr.projectName}` : pr.projectCode;
    };
    const fmtClient = (id: string) => {
      const c = cliById.get(id);
      if (!c) return "";
      return c.clientName ? `${c.clientCode} · ${c.clientName}` : c.clientCode;
    };
    const resolvedProjects = p.projectRecordIds.map(fmtProject).filter(Boolean);
    const resolvedClients = p.clientRecordIds.map(fmtClient).filter(Boolean);
    if (resolvedProjects.length > 0) projectLabel = resolvedProjects.join(", ");
    if (resolvedClients.length > 0) clientLabel = resolvedClients.join(", ");
  } catch (e) {
    console.error("Could not resolve project/client names for paid email:", e);
  }

  const safe = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const pdfNote = {
    text: pdfFailure ? `PDF not attached: ${pdfFailure}` : `PDF: attached`,
    html: pdfFailure ? `<p><em>PDF not attached: ${safe(pdfFailure)}</em></p>` : `<p>PDF attached.</p>`,
  };

  const { name, subject, textBody, htmlBody, to, cc, from } = await resolveEmail("payment_paid", {
    heading,
    label,
    intro: introText,
    reference: p.invoiceReference || "—",
    beneficiary: p.beneficiary || "—",
    amount: amountLine,
    paymentDate: p.paymentDate ?? "—",
    invoiceDate: p.invoiceDate ?? "—",
    project: projectLabel || "—",
    client: clientLabel || "—",
    comment: p.comment || "—",
    pdfNote,
    portalUrl: `${env.appUrl}/admin/payments`,
  });

  const result = await sendMailViaGraph({
    to,
    cc,
    from,
    subject,
    textBody,
    htmlBody,
    attachments: attachment ? [attachment] : [],
    logLabel: name,
  });
  if (!result.ok) {
    console.error("Payment-paid email failed:", result.error);
  }
  return result;
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
    // User-provided URLs don't follow redirects (a public URL could 302 into
    // the internal network); trusted Airtable URLs may.
    const res = await fetch(url, { redirect: guard ? "manual" : "follow" });
    if (guard && (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400))) {
      return { ok: false, error: "Invoice URL redirected; upload the PDF instead." };
    }
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} fetching invoice URL` };
    }
    const contentType = res.headers.get("content-type") ?? "";
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
      return {
        ok: false,
        error: `PDF is ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB (over the ${(
          MAX_ATTACHMENT_BYTES /
          1024 /
          1024
        ).toFixed(0)} MB inline cap)`,
      };
    }
    const head = buffer.slice(0, 5).toString("ascii");
    if (head !== "%PDF-") {
      return {
        ok: false,
        error: `URL did not return a PDF (got ${contentType || "unknown"})`,
      };
    }
    const safeLabel = label.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "invoice";
    return {
      ok: true,
      attachment: {
        filename: `${safeLabel}.pdf`,
        contentType: "application/pdf",
        base64: buffer.toString("base64"),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fetch failed" };
  }
}
