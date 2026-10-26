import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { cronSecretMatches } from "@/lib/cron-auth";
import { apiError } from "@/lib/errors";
import { listAllTimesheets, listPayments, listProjects } from "@/lib/airtable";
import { effectiveEur, effectiveProjectEur } from "@/lib/fx";
import { isOwnWorkPayment, listFounderEarnings, ownWorkProjectSets } from "@/lib/founder-earnings";
import { buildProjectProfitability } from "@/app/admin/cockpit/profitability";
import {
  buildPaymentsSlack,
  buildProfitabilitySlack,
  buildTimesheetsSlack,
} from "@/lib/slack-digests";
import { postToSlack } from "@/lib/slack";
import { CLIENT_REVIEW_AUTO_APPROVE_DAYS } from "@/lib/timesheet-review";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 120;

// Daily Slack ops summaries (every morning), one post per channel:
//   #finance    — project profitability (flagged projects + totals)
//   #payments   — outstanding in/out, overdue, status counts, un-sent invoices
//   #timesheets — review backlog, stuck/never-sent client reviews, today's decisions
// Best-effort and independent per channel; a Slack hiccup never fails the job.
async function run() {
  console.log("[cron] daily-slack-digest: start");
  if (!env.slackBotToken) {
    console.warn("[cron] daily-slack-digest: SLACK_BOT_TOKEN not set, skipping");
    return NextResponse.json({ ok: false, reason: "slack not configured" });
  }

  const [projects, payments, timesheets, founderEarnings] = await Promise.all([
    listProjects(),
    listPayments(),
    listAllTimesheets(),
    listFounderEarnings(),
  ]);

  // #finance profitability is network only: the founder's own engagements
  // (client revenue + his cost) are stripped out. The #payments and #timesheets
  // recaps below stay full-scope — his client invoices still need chasing, and
  // his auto-paid earnings never show as an outstanding payment anyway.
  const own = ownWorkProjectSets(founderEarnings, projects);
  const networkProjects = projects.filter((p) => !own.codes.has(p.projectCode));
  const networkPayments = payments.filter((p) => !isOwnWorkPayment(p, own.recordIds));

  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(now);

  // #finance — profitability (network only)
  const profit = buildProjectProfitability(
    networkProjects.map((p) => ({
      id: p.id,
      projectCode: p.projectCode,
      projectName: p.projectName,
      status: p.status || "",
      totalAmountEur: effectiveProjectEur(p),
    })),
    networkPayments.map((p) => ({
      projectRecordIds: p.projectRecordIds,
      direction: p.direction,
      invoiceValueEur: effectiveEur(p),
      paymentStatus: p.paymentStatus || "",
    })),
  );
  const ownNote =
    own.codes.size > 0
      ? `\n_Network only — Pascal Bouquet's own engagements (${own.codes.size} project${own.codes.size === 1 ? "" : "s"}) excluded._`
      : "";
  const financeText = buildProfitabilitySlack(profit, date, `${env.appUrl}/admin/cockpit`) + ownNote;

  // #payments
  const paymentsText = buildPaymentsSlack(
    payments.map((p) => ({
      direction: p.direction,
      paymentStatus: p.paymentStatus || "",
      dueDate: p.dueDate,
      paymentDate: p.paymentDate,
      invoiceDate: p.invoiceDate,
      sentToClientDate: p.sentToClientDate,
      amountEur: effectiveEur(p),
      isMember: p.direction === "Outflow" && p.memberRecordIds.length > 0,
    })),
    todayIso,
    date,
    `${env.appUrl}/admin/payments`,
  );

  // #timesheets
  const timesheetsText = buildTimesheetsSlack(
    timesheets.map((t) => ({
      status: t.status || "",
      reviewMethod: t.reviewMethod || "",
      reviewRequestedAt: t.reviewRequestedAt,
      reviewedAt: t.reviewedAt,
    })),
    todayIso,
    CLIENT_REVIEW_AUTO_APPROVE_DAYS,
    date,
    `${env.appUrl}/admin/timesheets`,
  );

  const posts = await Promise.all([
    postToSlack(env.slackChannels.finance, financeText),
    postToSlack(env.slackChannels.payments, paymentsText),
    postToSlack(env.slackChannels.timesheets, timesheetsText),
  ]);
  const result = {
    finance: posts[0].ok,
    payments: posts[1].ok,
    timesheets: posts[2].ok,
  };
  console.log(`[cron] daily-slack-digest: done — ${JSON.stringify(result)}`);
  return NextResponse.json({ ok: posts.some((p) => p.ok), result });
}

// Daily Vercel cron (07:00 UTC). Protected by CRON_SECRET; an admin can also
// trigger it manually.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const hasHeader = !!request.headers.get("authorization");
  const authorized = cronSecretMatches(request.headers.get("authorization"));
  if (!authorized) {
    const session = await requireAdminSession();
    if (!session) {
      console.warn(
        `[cron] daily-slack-digest: rejected 403 — ${
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
    console.error("[cron] daily-slack-digest: failed", e);
    return apiError(e, "send daily Slack digest");
  }
}

// Manual admin trigger (send now).
export async function POST() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return await run();
  } catch (e) {
    return apiError(e, "send daily Slack digest");
  }
}
