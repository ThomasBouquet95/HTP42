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
    const value = required("AUTH_SECRET");
    // The session JWT is HMAC-signed with this; a short/guessable secret would
    // let an attacker forge admin sessions. Enforce a floor at read time.
    if (value.length < 32) {
      throw new Error("AUTH_SECRET must be at least 32 characters (use a long random string).");
    }
    return value;
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
  // Shared mailbox that receives automated / paid vendor invoices. The nightly
  // importer reads PDF attachments from here via Microsoft Graph (the Azure
  // app needs Mail.Read application permission granted for this mailbox).
  // Named generically ("automated invoice") since the scope may broaden beyond
  // IT bills later. The legacy IT_INVOICE_* vars are still honoured as a
  // fallback so an already-set value keeps working.
  get automatedInvoiceMailbox() {
    return (
      process.env.AUTOMATED_INVOICE_MAILBOX ??
      process.env.IT_INVOICE_MAILBOX ??
      "automatedbilling@htp42.com"
    );
  },
  // Internal project code every imported invoice is filed under.
  get automatedInvoiceProjectCode() {
    return (
      process.env.AUTOMATED_INVOICE_PROJECT_CODE ??
      process.env.IT_INVOICE_PROJECT_CODE ??
      "INT-IT"
    );
  },
  // Qonto Business API credentials for reading bank transactions. `login` is
  // the organization slug, `secretKey` the API secret (Qonto → Settings →
  // API). A combined "login:secret" value in QONTO_API_KEY is also accepted.
  // All optional: when unset the Bank (Qonto) tab shows a "connect" state
  // instead of erroring.
  get qonto() {
    const combined = process.env.QONTO_API_KEY ?? "";
    const sep = combined.indexOf(":");
    const comboLogin = sep >= 0 ? combined.slice(0, sep) : "";
    const comboSecret = sep >= 0 ? combined.slice(sep + 1) : "";
    return {
      login: (process.env.QONTO_LOGIN ?? comboLogin ?? "").trim(),
      secretKey: (process.env.QONTO_SECRET_KEY ?? comboSecret ?? "").trim(),
    };
  },
};
