import nodemailer from "nodemailer";
import { env } from "./env";

export async function sendMagicLinkEmail(to: string, url: string): Promise<void> {
  const subject = "Your HTP42 Timesheets sign-in link";
  const text = `Hi,

Click the link below to sign in to the HTP42 Timesheets portal. This link expires in 15 minutes and can only be used once.

${url}

If you didn't request this, you can safely ignore this email.`;
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a">
  <p>Hi,</p>
  <p>Click the button below to sign in to the HTP42 Timesheets portal. This link expires in 15 minutes and can only be used once.</p>
  <p><a href="${url}" style="display:inline-block;padding:10px 16px;border-radius:6px;background:#2563eb;color:#fff;text-decoration:none">Sign in</a></p>
  <p style="color:#475569;font-size:12px">If the button doesn't work, paste this URL into your browser:<br>${url}</p>
  <p style="color:#475569;font-size:12px">If you didn't request this, you can safely ignore this email.</p>
  </body></html>`;

  if (!env.smtp.host) {
    console.log(`\n[magic-link] (no SMTP configured) To: ${to}\n${url}\n`);
    return;
  }
  const transport = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
  });
  await transport.sendMail({ from: env.smtp.from, to, subject, text, html });
}
