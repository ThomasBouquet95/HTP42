import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { apiError } from "@/lib/errors";
import { postToSlack } from "@/lib/slack";
import { env } from "@/lib/env";

// TEMPORARY (Slack test): posts a one-off test message to the channels the bot
// should be in, and reports per-channel success. Remove this route + the button
// once the integration is verified.
export async function POST() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!env.slackBotToken) {
    return NextResponse.json(
      { error: "SLACK_BOT_TOKEN is not set on this deployment. Add it in Vercel and redeploy." },
      { status: 400 },
    );
  }
  const who = session.fullName || session.email || "an admin";
  const channels = ["#finance", "#payments", "#timesheets"];
  const text = `:white_check_mark: *HTP42 bot test* — sent by ${who}. If you can read this here, Slack posting works for this channel.`;
  try {
    const results = [];
    for (const channel of channels) {
      const r = await postToSlack(channel, text);
      results.push({ channel, ok: r.ok, error: r.error });
    }
    return NextResponse.json({ ok: results.some((r) => r.ok), results });
  } catch (e) {
    return apiError(e, "send the Slack test message");
  }
}
