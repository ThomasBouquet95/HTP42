"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  ChatConversation,
  ChatKind,
  ChatMessage,
  MemberStatus,
} from "@/lib/airtable";

type MemberOpt = {
  id: string;
  code: string;
  name: string;
  photoUrl: string | null;
  lastActivity: string | null;
  status: MemberStatus;
};

type ProjectOpt = {
  code: string;
  name: string;
  status: string;
  memberIds: string[];
  memberNames: string[];
};

// The "kind" surfaced in the New Chat modal. Behind the scenes a Project
// chat is just a Group conversation pre-populated with the project's team
// and a default title — no new server type needed.
type ModalKind = "Direct" | "Group" | "Project";

// Presence thresholds. Same logic as the admin sign-in dashboard so the
// "online" badge is consistent everywhere.
const MIN = 60 * 1000;
const ONLINE_MS = 2 * MIN;
const RECENT_MS = 15 * MIN;

// Cadence of background polling. Chosen so a small network (50ish) sits
// comfortably under Airtable's 5 req/s/base limit even with multiple users
// connected.
const MESSAGES_POLL_MS = 3_000;
const CONVERSATIONS_POLL_MS = 10_000;

export function ChatClient({
  currentMemberId,
  initialConversations,
  members,
  projects,
}: {
  currentMemberId: string;
  initialConversations: ChatConversation[];
  members: MemberOpt[];
  projects: ProjectOpt[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("c") ?? null;

  const [conversations, setConversations] =
    useState<ChatConversation[]>(initialConversations);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Per-conversation "last seen" timestamps, kept client-side in
  // localStorage. We compare these against each conversation's
  // lastMessageAt to drive the unread badge on the sidebar and on the
  // browser tab title.
  const [lastSeen, setLastSeen] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem("htp42-chat-lastSeen");
      return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch {
      return {};
    }
  });
  const persistLastSeen = useCallback((next: Record<string, string>) => {
    setLastSeen(next);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("htp42-chat-lastSeen", JSON.stringify(next));
    } catch {
      // ignore — unread state is non-critical, falls back to "all read"
    }
  }, []);

  // Mark the active conversation as seen on every messages refresh and on
  // every conversation switch.
  useEffect(() => {
    if (!activeId) return;
    const stamp = new Date().toISOString();
    persistLastSeen({ ...lastSeen, [activeId]: stamp });
    // We intentionally omit `lastSeen` from the deps array — including it
    // would loop every time we updated it. The active conversation's
    // last-seen is updated whenever activeId or messages change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, messages.length]);

  // Tally per-conversation unread counts: a row is unread if its
  // lastMessageAt is more recent than our stored lastSeen for it, and the
  // most recent message isn't ours. Cheap, runs each render from the
  // already-loaded conversation list.
  const unreadByConv = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const c of conversations) {
      if (!c.lastMessageAt) {
        map.set(c.id, false);
        continue;
      }
      // If we're currently looking at this conversation, treat as read.
      if (c.id === activeId) {
        map.set(c.id, false);
        continue;
      }
      const seen = lastSeen[c.id];
      map.set(c.id, !seen || Date.parse(c.lastMessageAt) > Date.parse(seen));
    }
    return map;
  }, [conversations, activeId, lastSeen]);

  const totalUnread = useMemo(() => {
    let n = 0;
    for (const v of unreadByConv.values()) if (v) n += 1;
    return n;
  }, [unreadByConv]);

  // Surface unread total in the browser tab title when the user is on
  // another tab so they notice new messages without polling the chat.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const base = "Chat — HTP42";
    document.title = totalUnread > 0 ? `(${totalUnread}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [totalUnread]);

  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  // Resolve a display name + avatar for any conversation. DMs show the
  // *other* participant; groups show their title (fallback: comma-joined names).
  const describe = useCallback(
    (c: ChatConversation): { label: string; avatar: MemberOpt | null; subtitle: string } => {
      if (c.kind === "Direct") {
        const otherId = c.memberRecordIds.find((id) => id !== currentMemberId);
        const other = otherId ? membersById.get(otherId) ?? null : null;
        return {
          label: other?.name ?? "Direct message",
          avatar: other,
          subtitle: other?.code ?? "",
        };
      }
      const others = c.memberRecordIds
        .filter((id) => id !== currentMemberId)
        .map((id) => membersById.get(id)?.name)
        .filter(Boolean) as string[];
      return {
        label: c.title || others.slice(0, 3).join(", ") || "Group",
        avatar: null,
        subtitle: `${c.memberRecordIds.length} members`,
      };
    },
    [currentMemberId, membersById],
  );

  // Background refresh: conversations list (new DMs from others, new
  // messages bumping the order). Uses the same monotonic-id guard the
  // messages poll has so a slow response can't clobber a fresher one.
  const convReqIdRef = useRef(0);
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      // Pause polling when the tab is hidden — the user can't see the
      // result, and a backgrounded tab still consumes Airtable rate-limit
      // budget on every tick.
      if (typeof document !== "undefined" && document.hidden) return;
      const reqId = ++convReqIdRef.current;
      try {
        const res = await fetch("/api/chat/conversations", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { conversations: ChatConversation[] };
        if (cancelled) return;
        if (reqId !== convReqIdRef.current) return;
        setConversations(data.conversations);
      } catch {
        // swallow — next poll will retry
      }
    }
    const id = setInterval(refresh, CONVERSATIONS_POLL_MS);
    // Re-fetch on tab focus so the list catches up the moment the user
    // comes back.
    const onVis = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Active conversation messages: load on switch + poll while open. A
  // monotonic request id guards against the older-response-clobbers-newer
  // race when the network reorders parallel polls.
  const reqIdRef = useRef(0);
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    async function load() {
      if (typeof document !== "undefined" && document.hidden) return;
      const reqId = ++reqIdRef.current;
      try {
        const res = await fetch(
          `/api/chat/conversations/${encodeURIComponent(activeId!)}/messages`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { messages: ChatMessage[] };
        if (cancelled) return;
        // Only the latest in-flight request gets to write state.
        if (reqId !== reqIdRef.current) return;
        // Merge the canonical list with two kinds of local state Airtable
        // may not yet reflect:
        //   1. Optimistic bubbles still waiting for the POST response.
        //   2. Recently-confirmed canonical messages (sent within ~15s)
        //      that Airtable's index might not have surfaced yet — without
        //      this they briefly disappear from the UI between the POST
        //      return and the index catching up.
        // We track claimed canonical rows so two back-to-back identical
        // messages don't both match the same row and collapse into one.
        setMessages((prev) => {
          const RECENT_WINDOW_MS = 15_000;
          const now = Date.now();
          const keep = prev.filter((m) => {
            if (m.id.startsWith("optim-")) return true;
            if (!m.sentAt) return false;
            return now - Date.parse(m.sentAt) < RECENT_WINDOW_MS;
          });
          const merged = [...data.messages];
          const presentIds = new Set(merged.map((m) => m.id));
          const claimed = new Set<string>();
          for (const k of keep) {
            // Same id is already in the canonical list — nothing to do.
            if (presentIds.has(k.id)) continue;
            // Otherwise look for the same content+sender+timestamp window
            // (covers both optimistic→canonical match and a duplicate of
            // a row we already received from a previous poll).
            const match = merged.find(
              (m) =>
                !claimed.has(m.id) &&
                m.senderRecordId === k.senderRecordId &&
                m.body === k.body &&
                Math.abs(Date.parse(m.sentAt ?? "0") - Date.parse(k.sentAt ?? "0")) < 30_000,
            );
            if (match) claimed.add(match.id);
            else merged.push(k);
          }
          // Keep messages in chronological order so a late-arriving local
          // entry doesn't land at the end visually when its timestamp is
          // older than the last canonical row.
          merged.sort(
            (a, b) => Date.parse(a.sentAt ?? "0") - Date.parse(b.sentAt ?? "0"),
          );
          return merged;
        });
      } catch {
        // swallow — next poll will retry
      }
    }
    load();
    const id = setInterval(load, MESSAGES_POLL_MS);
    const onVis = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [activeId]);

  // Smart auto-scroll: only follow the bottom when the user is already
  // pinned there. If they've scrolled up to read history, we leave the
  // viewport alone (otherwise every poll yanks them back).
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (pinnedRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);
  // Always jump to the bottom on conversation switch — there's no
  // "previous scroll position" to preserve.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    pinnedRef.current = true;
  }, [activeId]);
  function onScrollerScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    // ~40px of slack so the smallest scroll up doesn't unpin.
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  function openConversation(id: string) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("c", id);
    // First time we open a conversation (no `c` in URL yet), push so the
    // browser back-button takes the user back to the empty list state.
    // Subsequent conversation switches just replace, so the back button
    // skips past the chain of hops and returns cleanly.
    if (activeId == null) router.push(`/chat?${sp.toString()}`);
    else router.replace(`/chat?${sp.toString()}`);
  }

  async function send() {
    if (!activeConversation) return;
    const body = composer.trim();
    if (!body || sending) return;
    setSending(true);
    pinnedRef.current = true; // sending always pins to the bottom
    // Optimistic insert. The POST response (or the next poll) replaces it
    // with the canonical record so the bubble doesn't flash twice.
    const optimisticId = `optim-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: optimisticId,
      body,
      conversationId: activeConversation.id,
      senderRecordId: currentMemberId,
      senderName: membersById.get(currentMemberId)?.name ?? "You",
      senderPhotoUrl: membersById.get(currentMemberId)?.photoUrl ?? null,
      sentAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setComposer("");
    try {
      const res = await fetch(
        `/api/chat/conversations/${encodeURIComponent(activeConversation.id)}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
      if (!res.ok) throw new Error("Send failed");
      const data = (await res.json().catch(() => ({}))) as { message?: ChatMessage };
      if (data.message) {
        const canonical = data.message;
        // Replace the optimistic placeholder with the canonical message AND
        // drop any pre-existing canonical row with the same id (the poll
        // may have merged it in already if the POST race-lost). Belt-and-
        // braces against rendering two React keys with the same value.
        setMessages((prev) => {
          const withoutDupes = prev.filter(
            (m) => m.id !== optimisticId && m.id !== canonical.id,
          );
          return [...withoutDupes, canonical];
        });
      }
    } catch {
      // Roll back the optimistic message and restore the input so the user
      // can retry without retyping.
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setComposer(body);
    } finally {
      setSending(false);
    }
  }

  async function createConversation(payload:
    | { kind: "Direct"; memberRecordId: string }
    | { kind: "Group"; title: string; memberRecordIds: string[] },
  ): Promise<ChatConversation | null> {
    const res = await fetch("/api/chat/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { conversation: ChatConversation };
    // Add or replace in our local list, then jump into it.
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === data.conversation.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = data.conversation;
        return copy;
      }
      return [data.conversation, ...prev];
    });
    return data.conversation;
  }

  return (
    // Use 100dvh so the layout adapts to the mobile address-bar collapse
    // instead of being permanently cut off. On phones we show one pane at
    // a time: list when no conversation is selected, conversation otherwise.
    <div
      className="grid gap-3 grid-cols-1 sm:grid-cols-[260px_1fr]"
      style={{ height: "calc(100dvh - 9rem)" }}
    >
      {/* Conversations list */}
      <aside
        className={`flex-col rounded-lg border border-slate-200 bg-white overflow-hidden ${
          activeId ? "hidden sm:flex" : "flex"
        }`}
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Conversations
          </h2>
          <button
            type="button"
            onClick={() => setNewChatOpen(true)}
            className="rounded-full bg-brand-600 text-white px-2.5 py-1 text-[10px] font-medium hover:bg-brand-700"
          >
            + New
          </button>
        </header>
        <ul className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {conversations.length === 0 ? (
            <li className="p-6 text-center text-[11px] text-slate-400">
              No conversations yet. Click "New" to start one.
            </li>
          ) : (
            conversations.map((c) => {
              const d = describe(c);
              const active = c.id === activeId;
              const unread = unreadByConv.get(c.id) ?? false;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => openConversation(c.id)}
                    className={`flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-slate-50 ${
                      active ? "bg-brand-50/60" : ""
                    }`}
                  >
                    <ConversationAvatar
                      conversation={c}
                      describe={d}
                      now={nowTick}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={`truncate text-sm ${
                            active
                              ? "font-semibold text-brand-700"
                              : unread
                                ? "font-semibold text-slate-900"
                                : "font-medium text-slate-900"
                          }`}
                        >
                          {d.label}
                        </span>
                        <span className="flex items-center gap-1 shrink-0">
                          {unread ? (
                            <span className="inline-block h-2 w-2 rounded-full bg-brand-600" />
                          ) : null}
                          <span className="text-[10px] text-slate-400 tabular-nums">
                            {c.lastMessageAt ? formatAgo(nowTick - Date.parse(c.lastMessageAt)) : ""}
                          </span>
                        </span>
                      </div>
                      <div
                        className={`mt-0.5 truncate text-[11px] ${
                          unread ? "text-slate-700 font-medium" : "text-slate-500"
                        }`}
                      >
                        {c.lastMessagePreview || (
                          <span className="italic text-slate-400">No messages yet</span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </aside>

      {/* Active conversation */}
      <section
        className={`flex-col rounded-lg border border-slate-200 bg-white overflow-hidden min-h-0 ${
          activeId ? "flex" : "hidden sm:flex"
        }`}
      >
        {activeConversation ? (
          <>
            <ActiveConversationHeader
              conversation={activeConversation}
              describe={describe(activeConversation)}
              membersById={membersById}
              currentMemberId={currentMemberId}
              now={nowTick}
              onBack={() => {
                const sp = new URLSearchParams(searchParams.toString());
                sp.delete("c");
                router.replace(`/chat${sp.toString() ? `?${sp.toString()}` : ""}`);
              }}
            />
            <div
              ref={scrollerRef}
              onScroll={onScrollerScroll}
              className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-slate-50/40"
            >
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-xs text-slate-400">
                  No messages yet. Say hello.
                </div>
              ) : (
                messages.map((m, i) => {
                  const own = m.senderRecordId === currentMemberId;
                  const prev = i > 0 ? messages[i - 1] : null;
                  const grouped =
                    !!prev &&
                    prev.senderRecordId === m.senderRecordId &&
                    !!prev.sentAt &&
                    !!m.sentAt &&
                    Date.parse(m.sentAt) - Date.parse(prev.sentAt) < 5 * MIN;
                  // Render a "Today" / "Yesterday" / explicit date separator
                  // whenever the calendar day rolls over between two
                  // adjacent messages, so long histories are scannable.
                  const showDayDivider =
                    !!m.sentAt &&
                    (!prev || (!!prev.sentAt && !sameDay(m.sentAt, prev.sentAt)));
                  return (
                    <div key={m.id}>
                      {showDayDivider ? (
                        <DayDivider iso={m.sentAt!} />
                      ) : null}
                      <MessageBubble
                        message={m}
                        own={own}
                        groupedWithPrev={!showDayDivider && grouped}
                      />
                    </div>
                  );
                })
              )}
            </div>
            <Composer
              value={composer}
              onChange={setComposer}
              onSend={send}
              disabled={sending}
            />
          </>
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-xs text-slate-400">
            Pick a conversation on the left, or click "New" to start one.
          </div>
        )}
      </section>

      <NewChatModal
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        members={members.filter((m) => m.id !== currentMemberId && m.status !== "Inactive")}
        projects={projects.filter((p) => p.memberIds.length > 0)}
        currentMemberId={currentMemberId}
        now={nowTick}
        onCreate={async (payload) => {
          const c = await createConversation(payload);
          if (c) {
            setNewChatOpen(false);
            openConversation(c.id);
          }
        }}
      />
    </div>
  );
}

// ----- Subcomponents ---------------------------------------------------------

function ActiveConversationHeader({
  conversation,
  describe,
  membersById,
  currentMemberId,
  now,
  onBack,
}: {
  conversation: ChatConversation;
  describe: { label: string; subtitle: string; avatar: MemberOpt | null };
  membersById: Map<string, MemberOpt>;
  currentMemberId: string;
  now: number;
  onBack: () => void;
}) {
  const others = conversation.memberRecordIds.filter((id) => id !== currentMemberId);
  return (
    <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5 sm:px-4">
      <div className="min-w-0 flex items-center gap-2">
        {/* Back chevron is only visible on mobile, where the panes don't
            sit side-by-side. */}
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className="sm:hidden rounded-md p-1 text-slate-500 hover:bg-slate-100"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <ConversationAvatar
          conversation={conversation}
          describe={describe}
          now={now}
        />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">
            {describe.label}
          </div>
          <div className="text-[10px] text-slate-500">
            {conversation.kind === "Direct"
              ? describe.subtitle
              : `${conversation.memberRecordIds.length} members`}
          </div>
        </div>
      </div>
      {conversation.kind === "Group" ? (
        <div className="flex -space-x-2">
          {others.slice(0, 6).map((id) => {
            const m = membersById.get(id);
            return (
              <Avatar
                key={id}
                size={22}
                photoUrl={m?.photoUrl ?? null}
                name={m?.name ?? "?"}
                ring="ring-white"
              />
            );
          })}
          {others.length > 6 ? (
            <span className="inline-flex h-[22px] items-center justify-center rounded-full bg-slate-200 px-1.5 text-[10px] font-medium text-slate-600 ring-2 ring-white">
              +{others.length - 6}
            </span>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}

function DayDivider({ iso }: { iso: string }) {
  const d = new Date(iso);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const dayMs = 24 * 60 * 60 * 1000;
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = midnight - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  let label: string;
  if (diff === 0) label = "Today";
  else if (diff === dayMs) label = "Yesterday";
  else
    label = d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      ...(sameYear ? {} : { year: "numeric" }),
    });
  return (
    <div className="my-3 flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-400">
      <span className="h-px flex-1 bg-slate-200" />
      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium">{label}</span>
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

function sameDay(aIso: string, bIso: string): boolean {
  const a = new Date(aIso);
  const b = new Date(bIso);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Splits a body into text + autolinked URL segments. We don't render any
// markdown beyond this — plain text is plenty for an internal chat MVP.
function linkify(body: string): React.ReactNode[] {
  const rx = /\bhttps?:\/\/[^\s<>"']+/gi;
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = rx.exec(body)) !== null) {
    if (m.index > last) out.push(body.slice(last, m.index));
    // Strip trailing punctuation that probably isn't part of the URL.
    let url = m[0];
    let trail = "";
    while (/[.,!?)\]]$/.test(url)) {
      trail = url.slice(-1) + trail;
      url = url.slice(0, -1);
    }
    out.push(
      <a
        key={`u${i++}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-current/40 underline-offset-2 hover:decoration-current"
      >
        {url}
      </a>,
    );
    if (trail) out.push(trail);
    last = m.index + m[0].length;
  }
  if (last < body.length) out.push(body.slice(last));
  return out;
}

function MessageBubble({
  message,
  own,
  groupedWithPrev,
}: {
  message: ChatMessage;
  own: boolean;
  groupedWithPrev: boolean;
}) {
  // Optimistic bubbles use a synthetic id prefix until the server confirms.
  // Dim them slightly + label the timestamp "Sending…" so the user can see
  // their message is in flight, not just posted.
  const pending = message.id.startsWith("optim-");
  return (
    <div className={`flex items-end gap-2 ${own ? "justify-end" : ""}`}>
      {!own ? (
        <div className="w-6 shrink-0">
          {!groupedWithPrev ? (
            <Avatar
              size={24}
              photoUrl={message.senderPhotoUrl}
              name={message.senderName}
              ring="ring-white"
            />
          ) : null}
        </div>
      ) : null}
      <div className={`max-w-[78%] ${own ? "items-end" : ""}`}>
        {!groupedWithPrev && !own ? (
          <div className="mb-0.5 text-[10px] font-medium text-slate-500">
            {message.senderName}
          </div>
        ) : null}
        <div
          className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-xs leading-relaxed transition-opacity ${
            own
              ? "bg-brand-600 text-white rounded-br-md"
              : "bg-white text-slate-800 ring-1 ring-slate-200 rounded-bl-md"
          } ${pending ? "opacity-70" : ""}`}
        >
          {linkify(message.body)}
        </div>
        {message.sentAt ? (
          <div
            className={`mt-0.5 text-[9px] tabular-nums ${
              own ? "text-right text-slate-400" : "text-slate-400"
            }`}
            title={new Date(message.sentAt).toLocaleString()}
          >
            {pending
              ? "Sending…"
              : new Date(message.sentAt).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Composer({
  value,
  onChange,
  onSend,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
}) {
  // Auto-grow as the user types, capped so a runaway paragraph doesn't
  // push the messages pane offscreen. The cap is enforced via maxHeight +
  // overflow-y so additional lines just scroll inside the textarea.
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);
  return (
    <div className="border-t border-slate-100 px-3 py-2">
      <div className="flex items-end gap-2">
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          rows={1}
          placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"
          className="flex-1 resize-none overflow-y-auto rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          style={{ maxHeight: 160 }}
        />
        <button
          type="button"
          onClick={onSend}
          disabled={disabled || value.trim().length === 0}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}

function ConversationAvatar({
  conversation,
  describe,
  now,
}: {
  conversation: ChatConversation;
  describe: { avatar: MemberOpt | null };
  now: number;
}) {
  if (conversation.kind === "Group") {
    return (
      <div className="relative h-9 w-9 shrink-0 rounded-full bg-violet-50 text-violet-700 flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="9" cy="10" r="3" />
          <circle cx="17" cy="11" r="2.5" />
          <path d="M3 19c.7-2.5 3-4 6-4s5.3 1.5 6 4M13 18c.5-1.5 2-2.5 4-2.5s3.5 1 4 2.5" />
        </svg>
      </div>
    );
  }
  return (
    <div className="relative shrink-0">
      <Avatar
        size={36}
        photoUrl={describe.avatar?.photoUrl ?? null}
        name={describe.avatar?.name ?? "?"}
        ring="ring-white"
      />
      <PresenceDot lastActivity={describe.avatar?.lastActivity ?? null} now={now} />
    </div>
  );
}

function PresenceDot({
  lastActivity,
  now,
}: {
  lastActivity: string | null;
  now: number;
}) {
  if (!lastActivity) return null;
  const diff = now - Date.parse(lastActivity);
  if (!Number.isFinite(diff)) return null;
  if (diff < ONLINE_MS) {
    return (
      <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
    );
  }
  if (diff < RECENT_MS) {
    return (
      <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-white" />
    );
  }
  return null;
}

function Avatar({
  size,
  name,
  photoUrl,
  ring,
}: {
  size: number;
  name: string;
  photoUrl: string | null;
  ring: string;
}) {
  const initials = (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  const hue = Array.from(name).reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) % 360, 0);
  return (
    <span
      className={`relative inline-flex items-center justify-center overflow-hidden rounded-full font-semibold ring-2 ${ring}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, size * 0.4),
        backgroundColor: `hsl(${hue}, 60%, 88%)`,
        color: `hsl(${hue}, 40%, 28%)`,
      }}
      title={name}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        initials || "?"
      )}
    </span>
  );
}

function NewChatModal({
  open,
  onClose,
  members,
  projects,
  currentMemberId,
  now,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  members: MemberOpt[];
  projects: ProjectOpt[];
  currentMemberId: string;
  now: number;
  onCreate: (
    payload:
      | { kind: "Direct"; memberRecordId: string }
      | { kind: "Group"; title: string; memberRecordIds: string[] },
  ) => Promise<void>;
}) {
  const [kind, setKind] = useState<ModalKind>("Direct");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupTitle, setGroupTitle] = useState("");
  // Project picker: which project did the user pick to spin up a chat with.
  // We keep the title editable in case they want to rename "Project XYZ".
  const [projectCode, setProjectCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind("Direct");
    setSearch("");
    setSelected(new Set());
    setGroupTitle("");
    setProjectCode("");
    setBusy(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const filtered = members.filter((m) => {
    if (m.id === currentMemberId) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${m.name} ${m.code}`.toLowerCase().includes(q);
  });

  const pickedProject = projects.find((p) => p.code === projectCode) ?? null;
  // Project chats are Group conversations under the hood, pre-populated
  // with the project's team minus the caller (who is added by the server).
  const projectTeammateIds = pickedProject
    ? pickedProject.memberIds.filter((id) => id !== currentMemberId)
    : [];

  async function go() {
    setBusy(true);
    try {
      if (kind === "Direct") {
        const id = [...selected][0];
        if (!id) return;
        await onCreate({ kind: "Direct", memberRecordId: id });
      } else if (kind === "Group") {
        const ids = [...selected];
        if (ids.length < 2 || !groupTitle.trim()) return;
        await onCreate({ kind: "Group", title: groupTitle.trim(), memberRecordIds: ids });
      } else {
        // Project
        if (!pickedProject || projectTeammateIds.length < 1) return;
        const title = groupTitle.trim() || `Project · ${pickedProject.name || pickedProject.code}`;
        await onCreate({
          kind: "Group",
          title,
          memberRecordIds: projectTeammateIds,
        });
      }
    } finally {
      setBusy(false);
    }
  }

  const canCreate =
    kind === "Direct"
      ? selected.size === 1
      : kind === "Group"
        ? selected.size >= 2 && groupTitle.trim().length > 0
        : !!pickedProject && projectTeammateIds.length >= 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-[2px] px-3 py-6 sm:items-center sm:py-10"
      role="dialog"
      aria-modal="true"
      onClick={() => !busy && onClose()}
    >
      <div
        className="relative w-full max-w-md rounded-xl bg-white shadow-xl ring-1 ring-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">New conversation</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="px-4 py-3 space-y-3">
          <div className="inline-flex flex-wrap items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5">
            {(
              [
                { v: "Direct" as const, label: "Direct" },
                { v: "Group" as const, label: "Group" },
                { v: "Project" as const, label: "Project" },
              ]
            ).map((opt) => {
              const active = kind === opt.v;
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => {
                    setKind(opt.v);
                    setSelected(new Set());
                    setProjectCode("");
                  }}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    active ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {kind === "Group" ? (
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
                Group name
              </span>
              <input
                type="text"
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                placeholder="e.g. Pricing Working Group"
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                autoFocus
              />
            </label>
          ) : null}

          {kind === "Project" ? (
            <div className="space-y-2">
              <label className="block">
                <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
                  Project
                </span>
                <select
                  value={projectCode}
                  onChange={(e) => {
                    setProjectCode(e.target.value);
                    // Reset the editable title whenever the project flips so
                    // the auto-default ("Project · …") follows the picker.
                    setGroupTitle("");
                  }}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  autoFocus
                >
                  <option value="">Pick a project you're staffed on…</option>
                  {projects.length === 0 ? (
                    <option value="" disabled>
                      You're not on any projects yet.
                    </option>
                  ) : (
                    projects.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.code} · {p.name || p.code} ({p.memberIds.length} member
                        {p.memberIds.length === 1 ? "" : "s"})
                      </option>
                    ))
                  )}
                </select>
              </label>
              {pickedProject ? (
                <>
                  <label className="block">
                    <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
                      Chat title
                      <span className="ml-1 normal-case font-normal text-slate-400">
                        (optional)
                      </span>
                    </span>
                    <input
                      type="text"
                      value={groupTitle}
                      onChange={(e) => setGroupTitle(e.target.value)}
                      placeholder={`Project · ${pickedProject.name || pickedProject.code}`}
                      className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                  </label>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">
                      Members ({projectTeammateIds.length + 1} including you)
                    </div>
                    <p className="mt-0.5 line-clamp-3">
                      {pickedProject.memberNames.join(", ") || "—"}
                    </p>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {kind !== "Project" ? (
          <div>
            <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
              {kind === "Direct" ? "Pick a person" : "Pick members"}
            </span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or code…"
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
            />
            <ul className="mt-1.5 max-h-60 overflow-y-auto rounded-md border border-slate-200 bg-slate-50">
              {filtered.length === 0 ? (
                <li className="px-3 py-3 text-center text-[11px] text-slate-400">
                  No one matches.
                </li>
              ) : (
                filtered.map((m) => {
                  const checked = selected.has(m.id);
                  return (
                    <li key={m.id}>
                      <label className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-white cursor-pointer">
                        <input
                          type={kind === "Direct" ? "radio" : "checkbox"}
                          name="picker"
                          checked={checked}
                          onChange={(e) => {
                            setSelected((prev) => {
                              const next = new Set(kind === "Direct" ? [] : prev);
                              if (e.target.checked) next.add(m.id);
                              else next.delete(m.id);
                              return next;
                            });
                          }}
                          className="rounded"
                        />
                        <div className="relative">
                          <Avatar
                            size={24}
                            photoUrl={m.photoUrl}
                            name={m.name}
                            ring="ring-white"
                          />
                          <PresenceDot lastActivity={m.lastActivity} now={now} />
                        </div>
                        <span className="flex-1 truncate">{m.name}</span>
                        <span className="font-mono text-[10px] text-slate-400">{m.code}</span>
                      </label>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
          ) : null}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={go}
            disabled={busy || !canCreate}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
          >
            {busy
              ? kind === "Direct"
                ? "Opening…"
                : "Creating…"
              : kind === "Direct"
                ? "Open chat"
                : kind === "Project"
                  ? "Create project chat"
                  : "Create group"}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ----- utils ----------------------------------------------------------------

function formatAgo(diffMs: number): string {
  // Floor negative diffs to 0 so very recently-sent messages don't render an
  // empty timestamp when the client clock is slightly behind the server.
  const ms = Number.isFinite(diffMs) ? Math.max(0, diffMs) : 0;
  if (ms < MIN) return "now";
  const min = Math.floor(ms / MIN);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(mo / 12)}y`;
}
