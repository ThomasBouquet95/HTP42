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
  const resolved = await resolveChannelIdDetailed(channel);
  const channelId = resolved.id;
  if (!channelId) {
    // Report the precise reason so the button can give the right fix: a scope
    // error (add scope + reinstall) vs. not_found (wrong name, or the bot isn't
    // a member of this private channel — invite it).
    const channelError =
      resolved.error === "missing_scope" || resolved.error === "not_allowed_token_type"
        ? "missing_read_scope"
        : resolved.error === "not_found"
          ? "channel_not_found_or_not_member"
          : "channel_not_found_or_no_read_scope";
    return { tokenPresent: true, authOk, botUser, channelId: null, canReadChannel: false, channelError };
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
  return (await resolveChannelIdDetailed(channel)).id;
}

// Like resolveChannelId but also reports WHY resolution failed, so the setup
// check can tell "missing scope" (fix: add scope + reinstall) apart from
// "listed fine but no such channel / bot not a member of this private channel"
// (fix: check the name / invite the bot). `error` is the raw Slack API error
// from conversations.list (e.g. "missing_scope"), or "not_found" when the list
// succeeded but no channel matched the name.
export async function resolveChannelIdDetailed(
  channel: string,
): Promise<{ id: string | null; error?: string }> {
  const token = env.slackBotToken;
  if (!token || !channel) return { id: null, error: "not_configured" };
  // Already an ID (Slack channel IDs start with C/G/D).
  if (/^[CGD][A-Z0-9]{6,}$/.test(channel)) return { id: channel };
  const wanted = channel.replace(/^#/, "").trim().toLowerCase();
  if (!wanted) return { id: null, error: "not_configured" };
  // Search public and private channels in SEPARATE calls. Slack rejects a single
  // conversations.list that asks for `private_channel` when the token lacks
  // groups:read — with `missing_scope` for the whole call, so a public channel
  // would never be found either. Querying each type on its own means a public
  // channel resolves with just channels:read; a missing groups:read only skips
  // the private pass instead of failing everything.
  let sawMissingScope = false;
  for (const type of ["public_channel", "private_channel"] as const) {
    const r = await listChannelsOfType(token, type, wanted);
    if (r.id) return { id: r.id };
    if (r.error === "missing_scope") sawMissingScope = true;
    else if (r.error && r.error !== "not_found") return { id: null, error: r.error };
  }
  // Nothing matched. If a pass was blocked by a missing scope, say so (the public
  // pass needs channels:read, the private pass groups:read); otherwise it's a
  // genuine not-found (wrong name, or a private channel the bot isn't in).
  return { id: null, error: sawMissingScope ? "missing_scope" : "not_found" };
}

// One conversations.list pass for a single channel type, paginated. Returns the
// matching id, or an error string ("missing_scope", "not_found", or the raw
// Slack error). Kept separate so a scope gap on one type can't fail the other.
async function listChannelsOfType(
  token: string,
  type: "public_channel" | "private_channel",
  wanted: string,
): Promise<{ id: string | null; error?: string }> {
  try {
    let cursor = "";
    for (let page = 0; page < 10; page++) {
      const url = new URL("https://slack.com/api/conversations.list");
      url.searchParams.set("types", type);
      url.searchParams.set("limit", "1000");
      url.searchParams.set("exclude_archived", "true");
      if (cursor) url.searchParams.set("cursor", cursor);
      const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      const data = (await res.json().catch(() => ({}))) as SlackListResponse;
      if (!data.ok) {
        console.error(`[slack] conversations.list (${type}) failed: ${data.error ?? "unknown"}`);
        return { id: null, error: data.error ?? "list_failed" };
      }
      const hit = (data.channels ?? []).find((c) => c.name?.toLowerCase() === wanted);
      if (hit?.id) return { id: hit.id };
      cursor = data.response_metadata?.next_cursor ?? "";
      if (!cursor) break;
    }
  } catch (e) {
    console.error(`[slack] conversations.list (${type}) error:`, e);
    return { id: null, error: e instanceof Error ? e.message : "fetch_error" };
  }
  return { id: null, error: "not_found" };
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
