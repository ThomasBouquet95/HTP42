import { env } from "./env";

// Post a message to Slack via the bot token (chat.postMessage). Best-effort:
// never throws, and silently no-ops when Slack isn't configured or no channel is
// given, so a Slack hiccup can never break the cron that calls it. The bot must
// be a member of the target channel (invite it, especially for private ones).
export async function postToSlack(
  channel: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = env.slackBotToken;
  if (!token) return { ok: false, error: "SLACK_BOT_TOKEN not set" };
  if (!channel) return { ok: false, error: "no channel" };
  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        channel,
        text,
        unfurl_links: false,
        unfurl_media: false,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!data.ok) {
      console.error(`[slack] post to ${channel} failed: ${data.error ?? "unknown"}`);
      return { ok: false, error: data.error };
    }
    return { ok: true };
  } catch (e) {
    console.error("[slack] post error:", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Strip the simple HTML our digests build into plain text suitable for a Slack
// message (Slack's mrkdwn doesn't render HTML). Collapses whitespace.
export function htmlToSlackText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}
