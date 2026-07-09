"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type {
  ChatConversation,
  ChatKind,
  ChatMessage,
  MemberStatus,
} from "@/lib/airtable";
import { Button } from "@/components/form-controls";
import { SegmentedTabs } from "@/components/filters";
import { SearchInput } from "@/components/search-input";

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
// connected. The active-conversation poll is the snappier of the two
// because it drives perceived latency.
const MESSAGES_POLL_MS = 2_000;
const CONVERSATIONS_POLL_MS = 8_000;

export function ChatClient({
  currentMemberId,
  initialConversations,
  initialActiveId,
  initialMessages,
  members,
  projects,
}: {
  currentMemberId: string;
  initialConversations: ChatConversation[];
  initialActiveId: string | null;
  initialMessages: ChatMessage[];
  members: MemberOpt[];
  projects: ProjectOpt[];
}) {
  const searchParams = useSearchParams();
  // Active conversation lives in local state, not the URL. We sync the
  // URL via window.history.replaceState whenever it changes so deep links
  // still work, but we deliberately avoid router.push/replace because in
  // a force-dynamic page that triggers a full server re-render of every
  // initial fetch (conversations + members + projects + messages) just
  // to switch conversation. Local state lets the active conversation
  // change without leaving the React tree.
  const [activeId, setActiveId] = useState<string | null>(
    () => initialActiveId ?? searchParams.get("c") ?? null,
  );

  const [conversations, setConversations] =
    useState<ChatConversation[]>(initialConversations);
  // Seed with the server-rendered messages when the URL points at the same
  // conversation we preloaded. Lets the first paint already show the
  // thread instead of flashing the empty state for ~200ms while the
  // client poll resolves.
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    initialActiveId && initialActiveId === activeId ? initialMessages : [],
  );
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
      // localStorage's "storage" event only fires in OTHER tabs, so the
      // global header badge in the same tab would otherwise lag a poll
      // cycle (≤15s) behind reality. Dispatch a custom event so the badge
      // refreshes the moment we mark something as read locally — including
      // right after the user sent a message into the active conversation.
      window.dispatchEvent(new CustomEvent("htp42-chat-lastseen-changed"));
    } catch {
      // ignore — unread state is non-critical, falls back to "all read"
    }
  }, []);

  // Mark the active conversation as seen on every messages refresh and on
  // every conversation switch. We anchor lastSeen to the timestamp of the
  // newest message in view (not Date.now()) so that any clock skew between
  // the client and the Airtable server can't make the user's own freshly-
  // sent message look "newer than last seen" → unread.
  useEffect(() => {
    if (!activeId) return;
    let stamp = new Date().toISOString();
    if (messages.length > 0) {
      const newest = messages[messages.length - 1].sentAt;
      if (newest && newest > stamp) stamp = newest;
    }
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
    // Local state + URL sync only. Avoids the full server re-render that
    // router.push/replace would trigger on this force-dynamic page.
    setActiveId(id);
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    sp.set("c", id);
    // pushState the first time so browser back returns to the list view;
    // replaceState on subsequent switches so back doesn't walk through
    // every conversation we ever opened.
    const url = `/chat?${sp.toString()}`;
    if (activeId == null) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }

  function closeConversation() {
    setActiveId(null);
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    sp.delete("c");
    const tail = sp.toString();
    window.history.replaceState(null, "", `/chat${tail ? `?${tail}` : ""}`);
  }

  // Browser back / forward integration: when the user navigates with the
  // back arrow, sync activeId back from the URL so the panes follow.
  useEffect(() => {
    const onPop = () => {
      const sp = new URLSearchParams(window.location.search);
      setActiveId(sp.get("c"));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

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
        // Bump lastSeen with the server-issued timestamp so our own
        // message can't show up as "unread" anywhere (in-app sidebar or
        // global header badge). The useEffect above only fires when
        // messages.length changes — swapping optimistic→canonical keeps
        // the length the same, so we mirror the update here too.
        if (canonical.sentAt) {
          persistLastSeen({
            ...lastSeen,
            [activeConversation.id]: canonical.sentAt,
          });
        }
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

  // Edit / delete handlers. Both are optimistic: the bubble updates or
  // disappears immediately, with a rollback path if the server rejects.
  async function editMessage(msg: ChatMessage, nextBody: string): Promise<boolean> {
    const trimmed = nextBody.trim();
    if (!trimmed || trimmed === msg.body) return false;
    const previous = msg.body;
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, body: trimmed } : m)),
    );
    try {
      const res = await fetch(
        `/api/chat/conversations/${encodeURIComponent(msg.conversationId)}/messages/${encodeURIComponent(msg.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body: trimmed }),
        },
      );
      if (!res.ok) throw new Error("Edit failed");
      return true;
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, body: previous } : m)),
      );
      return false;
    }
  }

  async function deleteMessage(msg: ChatMessage): Promise<boolean> {
    // Confirmation is handled by the bubble UI (a "Delete?" / "Yes / No"
    // inline strip) rather than the browser's confirm() dialog, which is
    // jarring inside an otherwise calm chat surface.
    const snapshot = messages;
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    try {
      const res = await fetch(
        `/api/chat/conversations/${encodeURIComponent(msg.conversationId)}/messages/${encodeURIComponent(msg.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Delete failed");
      return true;
    } catch {
      setMessages(snapshot);
      return false;
    }
  }

  // Grammar / spelling rewrite via Claude. Fetches the corrected text from
  // /api/chat/rewrite, then reuses editMessage so the optimistic update +
  // PATCH path is identical to a manual edit. Returns false (and surfaces
  // the toast) on any failure so the popover can show the error inline.
  async function rewriteMessage(msg: ChatMessage): Promise<boolean> {
    try {
      const res = await fetch("/api/chat/rewrite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: msg.body }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        rewritten?: string;
        error?: string;
      };
      if (!res.ok || !data.rewritten) {
        throw new Error(data.error ?? "Rewrite failed");
      }
      // Identical body → nothing to do; the popover treats this as success.
      if (data.rewritten.trim() === msg.body.trim()) return true;
      return await editMessage(msg, data.rewritten);
    } catch {
      return false;
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
          <Button tone="primary" size="sm" onClick={() => setNewChatOpen(true)}>
            + New
          </Button>
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
              onBack={closeConversation}
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
                        onEdit={editMessage}
                        onDelete={deleteMessage}
                        onRewrite={rewriteMessage}
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

function SparkleIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3 w-3"
      fill="currentColor"
      aria-hidden
    >
      <path d="M8 1l1.3 3.7L13 6l-3.7 1.3L8 11 6.7 7.3 3 6l3.7-1.3L8 1zm5 8l.7 2L16 12l-2.3.7L13 15l-.7-2.3L10 12l2.3-.7L13 9z" />
    </svg>
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
  onEdit,
  onDelete,
  onRewrite,
}: {
  message: ChatMessage;
  own: boolean;
  groupedWithPrev: boolean;
  onEdit: (m: ChatMessage, body: string) => Promise<boolean>;
  onDelete: (m: ChatMessage) => Promise<boolean>;
  onRewrite: (m: ChatMessage) => Promise<boolean>;
}) {
  // Optimistic bubbles use a synthetic id prefix until the server confirms.
  // Dim them slightly + label the timestamp "Sending…" so the user can see
  // their message is in flight, not just posted. Edit/delete are disabled
  // while pending — the canonical id doesn't exist yet.
  const pending = message.id.startsWith("optim-");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [saving, setSaving] = useState(false);
  // Sync the draft if the message body changes outside of edit mode (e.g.
  // the poll merged a fresher canonical row).
  useEffect(() => {
    if (!editing) setDraft(message.body);
  }, [message.body, editing]);

  async function saveEdit() {
    if (saving) return;
    setSaving(true);
    const ok = await onEdit(message, draft);
    setSaving(false);
    if (ok) setEditing(false);
  }

  return (
    <div className={`group flex items-end gap-2 ${own ? "justify-end" : ""}`}>
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
      <div className={`relative max-w-[78%] ${own ? "items-end" : ""}`}>
        {!groupedWithPrev && !own ? (
          <div className="mb-0.5 text-[10px] font-medium text-slate-500">
            {message.senderName}
          </div>
        ) : null}
        {editing ? (
          <div
            className={`rounded-2xl px-2 py-1.5 text-xs ${
              own ? "bg-brand-50 ring-1 ring-brand-200" : "bg-white ring-1 ring-slate-200"
            }`}
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void saveEdit();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setEditing(false);
                  setDraft(message.body);
                }
              }}
              rows={Math.max(1, Math.min(5, draft.split("\n").length))}
              className="block w-full resize-none rounded-md border border-slate-300 bg-white px-2 py-1 text-xs leading-relaxed text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-500"
              autoFocus
            />
            <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[10px]">
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraft(message.body);
                }}
                disabled={saving}
                className="rounded-md px-2 py-0.5 font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={saving || draft.trim().length === 0 || draft.trim() === message.body}
                className="rounded-md bg-brand-600 px-2 py-0.5 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-xs leading-relaxed transition-opacity ${
              own
                ? "bg-brand-600 text-white rounded-br-md"
                : "bg-white text-slate-800 ring-1 ring-slate-200 rounded-bl-md"
            } ${pending ? "opacity-70" : ""}`}
          >
            {linkify(message.body)}
          </div>
        )}
        {/* Edit / delete affordance for own messages. The "⋯" trigger
            overlays the bubble (top-right for own, justify-end rows), so
            hover-to-reveal doesn't reflow anything and the menu can't
            disappear when the cursor moves toward it. The popover stays
            open until the user picks an action or clicks elsewhere. */}
        {own && !pending && !editing ? (
          <MessageActions
            onEdit={() => setEditing(true)}
            onDelete={async () => {
              await onDelete(message);
            }}
            onRewrite={() => onRewrite(message)}
          />
        ) : null}
        {message.sentAt && !editing ? (
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

// Edit / delete affordance for own messages.
// - The trigger ("⋯") is always rendered but at low opacity; it bumps to
//   full opacity on hover/focus of the parent bubble group OR when the
//   popover is open. This is robust on touch devices (always tappable)
//   without being noisy on desktop.
// - Clicking opens a small popover anchored to the bubble's top-right.
//   Delete asks for inline confirmation ("Delete?" with Yes/No), so we
//   never trigger the browser's confirm() dialog.
// - The popover closes when the user picks an action, clicks outside, or
//   presses Escape.
function MessageActions({
  onEdit,
  onDelete,
  onRewrite,
}: {
  onEdit: () => void;
  onDelete: () => Promise<void> | void;
  // Triggers a grammar / spelling rewrite of the message body via Claude
  // and replaces the bubble in place. Returns true on success so the
  // popover can close cleanly.
  onRewrite: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  // Separate "rewriting" state so the Edit/Delete buttons stay enabled
  // and the row shows a clear in-flight indicator on Rewrite only.
  const [rewriting, setRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirming(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setConfirming(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={wrapRef}
      className="pointer-events-none absolute -top-1 -right-1 flex"
    >
      <button
        type="button"
        aria-label="Message actions"
        onClick={() => {
          setOpen((p) => !p);
          setConfirming(false);
        }}
        className={`pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition-opacity hover:text-slate-800 ${
          open ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        }`}
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
          <circle cx="3" cy="8" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="13" cy="8" r="1.4" />
        </svg>
      </button>
      {open ? (
        <div className="pointer-events-auto absolute right-0 top-full z-10 mt-1 min-w-[9rem] overflow-hidden rounded-md border border-slate-200 bg-white text-xs shadow-lg">
          {!confirming ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onEdit();
                }}
                disabled={rewriting}
                className="block w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (rewriting) return;
                  setRewriting(true);
                  setRewriteError(null);
                  try {
                    const ok = await onRewrite();
                    if (ok) {
                      setOpen(false);
                    } else {
                      setRewriteError("Rewrite failed.");
                    }
                  } finally {
                    setRewriting(false);
                  }
                }}
                disabled={rewriting}
                className="flex w-full items-center justify-between gap-2 border-t border-slate-100 px-3 py-1.5 text-left text-violet-700 hover:bg-violet-50 disabled:opacity-60"
                title="Fix grammar and spelling with AI, changing as few words as possible"
              >
                <span className="inline-flex items-center gap-1.5">
                  <SparkleIcon />
                  {rewriting ? "Rewriting…" : "Fix grammar (AI)"}
                </span>
                {rewriting ? (
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-violet-300 border-t-violet-700" />
                ) : null}
              </button>
              {rewriteError ? (
                <div className="border-t border-slate-100 px-3 py-1.5 text-[10px] text-red-700">
                  {rewriteError}
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={rewriting}
                className="block w-full border-t border-slate-100 px-3 py-1.5 text-left text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Delete…
              </button>
            </>
          ) : (
            <div className="px-3 py-2 text-slate-700">
              <div className="text-[11px]">Delete this message?</div>
              <div className="mt-1.5 flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={working}
                  className="rounded px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <Button
                  tone="danger"
                  size="sm"
                  onClick={async () => {
                    setWorking(true);
                    try {
                      await onDelete();
                    } finally {
                      setWorking(false);
                      setOpen(false);
                      setConfirming(false);
                    }
                  }}
                  disabled={working}
                >
                  {working ? "Deleting…" : "Delete"}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : null}
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
        <Button
          tone="primary"
          size="sm"
          onClick={onSend}
          disabled={disabled || value.trim().length === 0}
        >
          Send
        </Button>
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
      <div className="relative h-9 w-9 shrink-0 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center">
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
        className="relative w-full max-w-md rounded-lg bg-white shadow-xl ring-1 ring-slate-200"
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
          <SegmentedTabs
            value={kind}
            onChange={(v) => {
              setKind(v);
              setSelected(new Set());
              setProjectCode("");
            }}
            options={[
              { value: "Direct", label: "Direct" },
              { value: "Group", label: "Group" },
              { value: "Project", label: "Project" },
            ]}
            ariaLabel="Conversation type"
          />

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
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
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
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
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
                      className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
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
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search by name or code…"
              className="mt-1 w-full"
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
          <Button tone="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button tone="primary" size="sm" onClick={go} disabled={busy || !canCreate}>
            {busy
              ? kind === "Direct"
                ? "Opening…"
                : "Creating…"
              : kind === "Direct"
                ? "Open chat"
                : kind === "Project"
                  ? "Create project chat"
                  : "Create group"}
          </Button>
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
