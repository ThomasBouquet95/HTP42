import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { cronSecretMatches } from "@/lib/cron-auth";
import { apiError } from "@/lib/errors";
import { extractPostedContext, fetchSignals, normalizeUrl, renderSignalSlack } from "@/lib/signals";
import { fetchRecentChannelTexts, postToSlack } from "@/lib/slack";
import { env } from "@/lib/env";

export const runtime = "nodejs";
// Web search + curation can take a while; give it headroom.
export const maxDuration = 300;

const MAX_PER_DAY = 6; // sanity cap; the model self-limits to the genuinely relevant
const RECENT_DAYS = 5; // how far back to read the channel to avoid repeats
const RECENT_LIMIT = 80; // cap on messages read back (newest first)

// Curated daily pharma/clinical/data/AI intelligence feed → #life-science-signals.
// Claude searches the web and selects only high-value items; we post one Slack
// message per item. No daily quota — posting nothing is fine.
async function run() {
  console.log("[cron] life-science-signals: start");
  if (!env.anthropicApiKey) {
    console.warn("[cron] life-science-signals: ANTHROPIC_API_KEY not set, skipping");
    return NextResponse.json({ ok: false, reason: "no anthropic key" });
  }
  if (!env.slackBotToken) {
    console.warn("[cron] life-science-signals: SLACK_BOT_TOKEN not set, skipping");
    return NextResponse.json({ ok: false, reason: "slack not configured" });
  }

  const today = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(new Date());

  // Read the channel's recent history so we don't cover the same story twice.
  // Best-effort: needs the channels:history scope on the bot; if absent this is
  // just [] and we fall back to in-batch dedup only (nothing breaks).
  const recentTexts = await fetchRecentChannelTexts(
    env.slackChannels.lifeScienceSignals,
    RECENT_DAYS,
    RECENT_LIMIT,
  );
  const { headlines: recentHeadlines, urlKeys: recentUrlKeys } = extractPostedContext(recentTexts);
  console.log(
    `[cron] life-science-signals: ${recentTexts.length} recent messages read, ` +
      `${recentUrlKeys.size} known URLs, ${recentHeadlines.length} known headlines`,
  );

  // Pass the known headlines to the model so it avoids the same stories upfront.
  const items = await fetchSignals(today, recentHeadlines);

  // De-duplicate: skip anything already posted recently, dedup within the batch
  // by source URL, and cap for safety.
  const seen = new Set<string>();
  const toPost = [];
  let skippedKnown = 0;
  for (const it of items) {
    const key = normalizeUrl(it.sourceUrl);
    if (recentUrlKeys.has(key)) {
      skippedKnown += 1;
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    toPost.push(it);
    if (toPost.length >= MAX_PER_DAY) break;
  }
  if (skippedKnown > 0) {
    console.log(`[cron] life-science-signals: skipped ${skippedKnown} already-posted item(s)`);
  }

  let posted = 0;
  for (const it of toPost) {
    const r = await postToSlack(env.slackChannels.lifeScienceSignals, renderSignalSlack(it));
    if (r.ok) posted += 1;
  }

  console.log(`[cron] life-science-signals: done — found ${items.length}, posted ${posted}`);
  return NextResponse.json({
    ok: true,
    found: items.length,
    posted,
    skippedAlreadyPosted: skippedKnown,
    recentMessagesRead: recentTexts.length,
  });
}

// Daily Vercel cron. Protected by CRON_SECRET; an admin can also trigger it.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const hasHeader = !!request.headers.get("authorization");
  const authorized = cronSecretMatches(request.headers.get("authorization"));
  if (!authorized) {
    const session = await requireAdminSession();
    if (!session) {
      console.warn(
        `[cron] life-science-signals: rejected 403 — ${
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
    console.error("[cron] life-science-signals: failed", e);
    return apiError(e, "post life-science signals");
  }
}

// Manual admin trigger (run now).
export async function POST() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return await run();
  } catch (e) {
    return apiError(e, "post life-science signals");
  }
}
