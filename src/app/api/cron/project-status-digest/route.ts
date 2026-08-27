import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireAdminSession } from "@/lib/auth";
import { cronSecretMatches } from "@/lib/cron-auth";
import { apiError } from "@/lib/errors";
import { listPayments, listProjects } from "@/lib/airtable";
import { effectiveEur } from "@/lib/fx";
import { buildProjectProfitability } from "@/app/admin/cockpit/profitability";
import {
  buildDigestModel,
  digestHeadline,
  digestPromptData,
  renderDigestHtmlFallback,
  type DigestModel,
} from "@/lib/project-status-digest";
import { resolveEmail } from "@/lib/email-templates-server";
import { sendMailViaGraph } from "@/lib/email";
import { env } from "@/lib/env";

export const runtime = "nodejs";

// Daily project-status digest. Categorises every project as Running / Planned /
// Completed, enriches each with its actual profitability signal, and emails a
// sharp Claude-written summary to the founders (recipients editable in
// /admin/emails). Sends every day; the send is logged like any other email.

const SYSTEM_PROMPT = [
  "You write a daily project-status digest for the HTP42 consulting network's founders.",
  "You receive JSON: projects grouped into running / planned / completed / other, each with",
  "contract value, revenue to date (incl. expected), cost to date, margin left, a health flag",
  "(red = costs over contract, amber = approaching it or no contract, green = healthy) and a concern.",
  "",
  "Write a concise HTML fragment (no <html>/<head>/<body>, no markdown, no code fences). Structure:",
  "1. A 2-3 sentence executive summary: portfolio health in one glance, then the projects that need",
  "   attention (red first, then amber) named explicitly with the specific number that matters.",
  "2. Three sections in this order with an <h3> each: Running, Planned, Completed. One line per",
  "   project: name, then the essential figures only where they add signal. Omit a section if empty.",
  "Be sharp and factual. No filler, no pleasantries, no restating the instructions. Amounts in EUR,",
  "rounded to whole euros. Lead with what is wrong or at risk; do not bury it. If nothing is at risk,",
  "say so in one clause. Keep the whole thing skimmable in under a minute.",
].join("\n");

// Ask Claude for the prose summary. Returns null on any failure so the caller
// falls back to a deterministic data-only render (a digest always ships).
async function summarize(model: DigestModel): Promise<string | null> {
  if (!env.anthropicApiKey) return null;
  try {
    const client = new Anthropic({ apiKey: env.anthropicApiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      thinking: { type: "disabled" },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Today is ${model.date}. Write the digest for this data:\n\n${digestPromptData(model)}`,
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
    console.error("[cron] project-status-digest: Claude summary failed", e);
    return null;
  }
}

async function run() {
  console.log("[cron] project-status-digest: start");
  const [projects, payments] = await Promise.all([listProjects(), listPayments()]);

  const profit = buildProjectProfitability(
    projects.map((p) => ({
      id: p.id,
      projectCode: p.projectCode,
      projectName: p.projectName,
      status: p.status || "",
      totalAmountEur: p.totalAmountEur,
    })),
    payments.map((p) => ({
      projectRecordIds: p.projectRecordIds,
      direction: p.direction,
      invoiceValueEur: effectiveEur(p),
      paymentStatus: p.paymentStatus || "",
    })),
  );

  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(new Date());

  const model = buildDigestModel(
    projects.map((p) => ({ projectCode: p.projectCode, projectName: p.projectName, status: p.status || "" })),
    profit,
    date,
  );
  const headline = digestHeadline(model);

  const summaryHtml = (await summarize(model)) ?? renderDigestHtmlFallback(model);
  // Plain-text version for the summary block, derived from the fallback markup.
  const summaryText = renderDigestHtmlFallback(model).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  const { name, subject, textBody, htmlBody, to, cc, from } = await resolveEmail("project_status_digest", {
    date,
    headline,
    summary: { text: summaryText, html: summaryHtml },
    portalUrl: `${env.appUrl}/admin/cockpit`,
  });

  if (!to.length) {
    console.warn("[cron] project-status-digest: no recipients resolved, skipping send");
    return NextResponse.json({ ok: false, reason: "no recipients", counts: model.counts });
  }

  const result = await sendMailViaGraph({ to, cc, from, subject, textBody, htmlBody, logLabel: name });
  console.log(
    `[cron] project-status-digest: ${result.ok ? "sent" : "failed"} to ${to.join(", ")} — ${headline}`,
  );
  return NextResponse.json({ ok: result.ok, counts: model.counts, atRisk: model.atRisk.length, to });
}

// Daily Vercel cron. Protected by CRON_SECRET (Vercel injects
// `Authorization: Bearer <CRON_SECRET>`); a signed-in admin can also trigger it.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const hasHeader = !!request.headers.get("authorization");
  const authorized = cronSecretMatches(request.headers.get("authorization"));
  if (!authorized) {
    const session = await requireAdminSession();
    if (!session) {
      console.warn(
        `[cron] project-status-digest: rejected 403 — ${
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
    console.error("[cron] project-status-digest: failed", e);
    return apiError(e, "send project-status digest");
  }
}

// Manual admin trigger (e.g. a "send now" ops action / preview).
export async function POST() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return await run();
  } catch (e) {
    return apiError(e, "send project-status digest");
  }
}
