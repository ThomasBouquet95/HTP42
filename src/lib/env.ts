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
};
