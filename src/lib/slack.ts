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

type SlackListResponse = {
  ok?: boolean;
  error?: string;
  channels?: { id?: string; name?: string }[];
  response_metadata?: { next_cursor?: string };
};

type SlackHistoryResponse = {
  ok?: boolean;
  error?: string;
  messages?: { text?: string }[];
};

// Fast health check for the bot: is the token valid, can it see + read the target
// channel? Used by the setup-check button so a broken bot is diagnosed in ~1s
// without running the slow web-search pipeline.
export async function diagnoseSlackChannel(channel: string): Promise<{
  tokenPresent: boolean;
  authOk: boolean;
  authError?: string;
  botUser?: string;
  channelId: string | null;
  canReadChannel: boolean;
  channelError?: string;
}> {
  const token = env.slackBotToken;
  if (!token) {
    return { tokenPresent: false, authOk: false, channelId: null, canReadChannel: false };
  }
  // 1) Is the token itself valid? (catches a rotated / revoked token.)
  let authOk = false;
  let authError: string | undefined;
  let botUser: string | undefined;
  try {
    const res = await fetch("https://slack.com/api/auth.test", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; user?: string };
    authOk = !!data.ok;
    authError = data.error;
    botUser = data.user;
  } catch (e) {
    authError = e instanceof Error ? e.message : "fetch_error";
  }
  if (!authOk) {
    return { tokenPresent: true, authOk, authError, channelId: null, canReadChannel: false };
  }
  // 2) Can it see + read the target channel? (catches not-in-channel / missing scope.)
  const channelId = await resolveChannelId(channel);
  if (!channelId) {
    return { tokenPresent: true, authOk, botUser, channelId: null, canReadChannel: false, channelError: "channel_not_found_or_no_read_scope" };
  }
  let canReadChannel = false;
  let channelError: string | undefined;
  try {
    const url = new URL("https://slack.com/api/conversations.history");
    url.searchParams.set("channel", channelId);
    url.searchParams.set("limit", "1");
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    canReadChannel = !!data.ok;
    channelError = data.error;
  } catch (e) {
    channelError = e instanceof Error ? e.message : "fetch_error";
  }
  return { tokenPresent: true, authOk, botUser, channelId, canReadChannel, channelError };
}

// Resolve a channel reference (name like "#finance" or a raw ID like "C0123ABCD")
// to its channel ID, which conversations.history requires. Returns the input
// unchanged if it already looks like an ID, or null if it can't be resolved.
// Best-effort: needs the channels:read / groups:read scope; returns null without
// it rather than throwing (so callers degrade gracefully).
export async function resolveChannelId(channel: string): Promise<string | null> {
  const token = env.slackBotToken;
  if (!token || !channel) return null;
  // Already an ID (Slack channel IDs start with C/G/D).
  if (/^[CGD][A-Z0-9]{6,}$/.test(channel)) return channel;
  const wanted = channel.replace(/^#/, "").trim().toLowerCase();
  if (!wanted) return null;
  try {
    let cursor = "";
    for (let page = 0; page < 10; page++) {
      const url = new URL("https://slack.com/api/conversations.list");
      url.searchParams.set("types", "public_channel,private_channel");
      url.searchParams.set("limit", "1000");
      url.searchParams.set("exclude_archived", "true");
      if (cursor) url.searchParams.set("cursor", cursor);
      const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      const data = (await res.json().catch(() => ({}))) as SlackListResponse;
      if (!data.ok) {
        console.error(`[slack] conversations.list failed: ${data.error ?? "unknown"}`);
        return null;
      }
      const hit = (data.channels ?? []).find((c) => c.name?.toLowerCase() === wanted);
      if (hit?.id) return hit.id;
      cursor = data.response_metadata?.next_cursor ?? "";
      if (!cursor) break;
    }
  } catch (e) {
    console.error("[slack] resolveChannelId error:", e);
  }
  return null;
}

// Read the recent message texts from a channel (newest first), limited to the
// last `days` and at most `limit` messages. Used to avoid re-posting the same
// story. Best-effort: needs the channels:history / groups:history scope; returns
// [] without it (so dedup is simply skipped, posting still works).
export async function fetchRecentChannelTexts(
  channel: string,
  days = 7,
  limit = 100,
): Promise<string[]> {
  const token = env.slackBotToken;
  if (!token || !channel) return [];
  try {
    const id = await resolveChannelId(channel);
    if (!id) return [];
    const oldest = ((Date.now() - days * 86_400_000) / 1000).toFixed(6);
    const url = new URL("https://slack.com/api/conversations.history");
    url.searchParams.set("channel", id);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("oldest", oldest);
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    const data = (await res.json().catch(() => ({}))) as SlackHistoryResponse;
    if (!data.ok) {
      console.error(`[slack] conversations.history failed: ${data.error ?? "unknown"}`);
      return [];
    }
    return (data.messages ?? [])
      .map((m) => (typeof m.text === "string" ? m.text : ""))
      .filter((t) => t.length > 0);
  } catch (e) {
    console.error("[slack] fetchRecentChannelTexts error:", e);
    return [];
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
