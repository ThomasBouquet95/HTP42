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
    return (
      process.env.INVOICE_SENDER_UPN ??
      process.env.INVOICE_RECIPIENT_EMAIL ??
      "invoices@htp42.com"
    );
  },
  // Anthropic API key, used by the chat message "Rewrite" button to
  // grammar-correct a message via Claude. Optional: if absent, the
  // /api/chat/rewrite endpoint returns 503 and the UI hides the action.
  get anthropicApiKey() {
    return process.env.ANTHROPIC_API_KEY ?? "";
  },
  // Shared mailbox that receives paid IT / vendor invoices. The nightly
  // importer reads PDF attachments from here via Microsoft Graph (the Azure
  // app needs Mail.Read application permission granted for this mailbox).
  get itInvoiceMailbox() {
    return process.env.IT_INVOICE_MAILBOX ?? "automatedbilling@htp42.com";
  },
  // Internal project code every imported IT invoice is filed under.
  get itInvoiceProjectCode() {
    return process.env.IT_INVOICE_PROJECT_CODE ?? "INT-IT";
  },
};
