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
  get smtp() {
    return {
      host: process.env.SMTP_HOST ?? "",
      port: Number(process.env.SMTP_PORT ?? 587),
      user: process.env.SMTP_USER ?? "",
      pass: process.env.SMTP_PASS ?? "",
      from: process.env.SMTP_FROM ?? "no-reply@localhost",
    };
  },
};
