import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { cronSecretMatches } from "@/lib/cron-auth";
import { apiError } from "@/lib/errors";
import { fetchSignals, normalizeUrl, renderSignalSlack } from "@/lib/signals";
import { postToSlack } from "@/lib/slack";
import { env } from "@/lib/env";

export const runtime = "nodejs";
// Web search + curation can take a while; give it headroom.
export const maxDuration = 300;

const MAX_PER_DAY = 6; // sanity cap; the model self-limits to the genuinely relevant

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

  const items = await fetchSignals(today);

  // De-duplicate within the batch by source URL and cap for safety.
  const seen = new Set<string>();
  const toPost = [];
  for (const it of items) {
    const key = normalizeUrl(it.sourceUrl);
    if (seen.has(key)) continue;
    seen.add(key);
    toPost.push(it);
    if (toPost.length >= MAX_PER_DAY) break;
  }

  let posted = 0;
  for (const it of toPost) {
    const r = await postToSlack(env.slackChannels.lifeScienceSignals, renderSignalSlack(it));
    if (r.ok) posted += 1;
  }

  console.log(`[cron] life-science-signals: done — found ${items.length}, posted ${posted}`);
  return NextResponse.json({ ok: true, found: items.length, posted });
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
