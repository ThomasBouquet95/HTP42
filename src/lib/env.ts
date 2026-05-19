function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// Accessed lazily so Next.js can build without all secrets being set (e.g. on
// the first CI build, before env vars are attached). Each property is only
// evaluated when a request handler actually reads it.
export const env = {
  get airtablePat() {
    return required("AIRTABLE_PAT");
  },
  get airtableBaseId() {
    return required("AIRTABLE_BASE_ID");
  },
  get authSecret() {
    return required("AUTH_SECRET");
  },
  get appUrl() {
    return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get azure() {
    return {
      tenantId: required("AZURE_TENANT_ID"),
      clientId: required("AZURE_CLIENT_ID"),
      clientSecret: required("AZURE_CLIENT_SECRET"),
    };
  },
  // Inbox that receives invoice submissions.
  get invoiceRecipient() {
    return process.env.INVOICE_RECIPIENT_EMAIL ?? "invoices@htp42.com";
  },
  // Mailbox that sends those emails (Azure app needs Mail.Send application
  // permission granted to send as this user). Defaults to the recipient so
  // submissions self-archive when not explicitly configured.
  get invoiceSender() {
    return process.env.INVOICE_SENDER_UPN ?? process.env.INVOICE_RECIPIENT_EMAIL ?? "";
  },
};
