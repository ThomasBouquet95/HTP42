import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireAdminSession } from "@/lib/auth";
import { cronSecretMatches } from "@/lib/cron-auth";
import { apiError } from "@/lib/errors";
import { listAllMembers, listClients, listPayments } from "@/lib/airtable";
import { effectiveEur } from "@/lib/fx";
import {
  buildPaymentReminders,
  remindersHeadline,
  remindersPromptData,
  renderRemindersSections,
  type PaymentRemindersModel,
} from "@/lib/payment-reminders";
import { resolveEmail } from "@/lib/email-templates-server";
import { sendMailViaGraph } from "@/lib/email";
import { env } from "@/lib/env";

export const runtime = "nodejs";

// Weekly payments-due digest. Lists outstanding client payments (money in) and
// payments owed to network members (money out), colour-coded by how overdue each
// is, and emails the founders (recipients editable in Tech -> Emails). The
// per-payment lists are rendered in code; Claude writes only the summary.

const SYSTEM_PROMPT = [
  "You write ONLY the opening executive summary of a weekly payments-due digest for the HTP42",
  "consulting network's founders. The full per-payment lists are rendered separately by the system,",
  "so do NOT list or enumerate every payment.",
  "You receive JSON with two groups: incoming (client payments owed to HTP42) and toMembers (payments",
  "HTP42 owes network members). Each item has a label, reference, amount in EUR, due date, daysOverdue",
  "(>0 = overdue) and an urgency (red = overdue by more than a week, orange = overdue by up to a week,",
  "green = due today / upcoming / undated).",
  "",
  "Write a concise HTML fragment: 2-4 sentences, no headings, no lists, no markdown, no code fences,",
  "no <html>/<head>/<body>. Give the cash picture in one glance (total incoming vs owed to members),",
  "then call out the most urgent items (red first, then orange) by name with the amount and how",
  "overdue they are. Be sharp and factual, no filler. Amounts in EUR, whole euros. If nothing is",
  "overdue, say so in one clause.",
].join("\n");

async function summarize(model: PaymentRemindersModel): Promise<string | null> {
  if (!env.anthropicApiKey) return null;
  try {
    const client = new Anthropic({ apiKey: env.anthropicApiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1536,
      thinking: { type: "disabled" },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Today is ${model.date}. Write the summary for this data:\n\n${remindersPromptData(model)}`,
        },
      ],
    });
    const html = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim()
      .replace(/^```(?:html)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    return html || null;
  } catch (e) {
    console.error("[cron] payment-reminders: Claude summary failed", e);
    return null;
  }
}

async function run() {
  console.log("[cron] payment-reminders: start");
  // Resolve client / member NAMES from record ids: a payment's linked fields
  // read back as record ids, so a label must come from the entity, never from
  // the link field itself (which would print "rec…").
  const [payments, clients, members] = await Promise.all([
    listPayments(),
    listClients(),
    listAllMembers(),
  ]);
  const clientNameById = new Map(clients.map((c) => [c.id, c.clientName || c.clientCode]));
  const memberNameById = new Map(members.map((m) => [m.id, m.fullName || m.memberCode]));

  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const displayDate = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(now);

  const model = buildPaymentReminders(
    payments.map((p) => ({
      id: p.id,
      direction: p.direction,
      paymentStatus: p.paymentStatus || "",
      dueDate: p.dueDate,
      amountEur: effectiveEur(p),
      reference: p.invoiceReference || "",
      // Names resolved from the linked record; fall back to the free-text
      // beneficiary, then to nothing (the reference is shown separately). Never
      // the link field, which would surface a raw record id.
      clientLabel: clientNameById.get(p.clientRecordIds[0]) || p.beneficiary || "",
      memberLabel: memberNameById.get(p.memberRecordIds[0]) || p.beneficiary || "",
      // An outflow owed to a network member (not a vendor / expense).
      isMember: p.direction === "Outflow" && p.memberRecordIds.length > 0,
    })),
    todayIso,
    displayDate,
  );

  const headline = remindersHeadline(model);

  const exec = await summarize(model);
  const execHtml =
    exec ?? `<p style="margin:0 0 12px">Payments due, ${displayDate}. ${headline}.</p>`;
  const summaryHtml = `${execHtml}\n${renderRemindersSections(model)}`;
  const summaryText = summaryHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  const { name, subject, textBody, htmlBody, to, cc, from } = await resolveEmail("payment_reminders_weekly", {
    date: displayDate,
    headline,
    summary: { text: summaryText, html: summaryHtml },
    portalUrl: `${env.appUrl}/admin/payments`,
  });

  if (!to.length) {
    console.warn("[cron] payment-reminders: no recipients resolved, skipping send");
    return NextResponse.json({ ok: false, reason: "no recipients" });
  }

  const result = await sendMailViaGraph({ to, cc, from, subject, textBody, htmlBody, logLabel: name });
  console.log(
    `[cron] payment-reminders: ${result.ok ? "sent" : "failed"} to ${to.join(", ")} — ${headline}`,
  );
  return NextResponse.json({
    ok: result.ok,
    to,
    incoming: { count: model.client.items.length, overdue: model.client.counts.red + model.client.counts.orange },
    toMembers: { count: model.member.items.length, overdue: model.member.counts.red + model.member.counts.orange },
  });
}

// Weekly Vercel cron. Protected by CRON_SECRET; a signed-in admin can also
// trigger it manually.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const hasHeader = !!request.headers.get("authorization");
  const authorized = cronSecretMatches(request.headers.get("authorization"));
  if (!authorized) {
    const session = await requireAdminSession();
    if (!session) {
      console.warn(
        `[cron] payment-reminders: rejected 403 — ${
          !secret
            ? "CRON_SECRET is not set on this deployment"
            : hasHeader
              ? "Authorization header did not match CRON_SECRET"
              : "no Authorization header and no admin session"
        }`,
      );
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  try {
    return await run();
  } catch (e) {
    console.error("[cron] payment-reminders: failed", e);
    return apiError(e, "send payment reminders");
  }
}

// Manual admin trigger (send now / preview).
export async function POST() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return await run();
  } catch (e) {
    return apiError(e, "send payment reminders");
  }
}
