import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { diagnoseSlackChannel } from "@/lib/slack";
import { env } from "@/lib/env";

export const runtime = "nodejs";

// Fast, non-destructive health check for the life-science-signals bot. Unlike the
// full "run now" (which does a slow web search and can make the browser time out
// with "Load failed"), this returns in ~1s and pinpoints what's broken: the
// Anthropic key, the Slack token, or the channel membership / read scope.
export async function POST() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const slack = await diagnoseSlackChannel(env.slackChannels.lifeScienceSignals);
  return NextResponse.json({
    ok: true,
    anthropicKey: !!env.anthropicApiKey,
    channel: env.slackChannels.lifeScienceSignals,
    slack,
  });
}
