function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  airtablePat: required("AIRTABLE_PAT"),
  airtableBaseId: required("AIRTABLE_BASE_ID"),
  authSecret: required("AUTH_SECRET"),
  appUrl: (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.SMTP_FROM ?? "no-reply@localhost",
  },
} as const;
