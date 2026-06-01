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
}: {
  currentMemberId: string;
  initialConversations: ChatConversation[];
  members: MemberOpt[];
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

  // Background refresh: conversations list (handle: new DMs from others, new
  // messages bumping the order).
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const res = await fetch("/api/chat/conversations", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { conversations: ChatConversation[] };
        if (!cancelled) setConversations(data.conversations);
      } catch {
        // swallow — next poll will retry
      }
    }
    const id = setInterval(refresh, CONVERSATIONS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Active conversation messages: load on switch + poll while open.
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/chat/conversations/${encodeURIComponent(activeId!)}/messages`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { messages: ChatMessage[] };
        if (!cancelled) setMessages(data.messages);
      } catch {
        // swallow
      }
    }
    load();
    const id = setInterval(load, MESSAGES_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [activeId]);

  // Auto-scroll the messages pane to the bottom when new messages land or we
  // switch conversations.
  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, activeId]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  function openConversation(id: string) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("c", id);
    router.replace(`/chat?${sp.toString()}`);
  }

  async function send() {
    if (!activeConversation) return;
    const body = composer.trim();
    if (!body || sending) return;
    setSending(true);
    // Optimistic insert. The poll will overwrite with the canonical record.
    const optimistic: ChatMessage = {
      id: `optim-${Date.now()}`,
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
    } catch {
      // Roll back the optimistic message and restore the input so the user
      // can retry without retyping.
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
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
    <div className="grid gap-3 h-[calc(100vh-9rem)] grid-cols-1 sm:grid-cols-[260px_1fr]">
      {/* Conversations list */}
      <aside className="flex flex-col rounded-lg border border-slate-200 bg-white overflow-hidden">
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
                            active ? "font-semibold text-brand-700" : "font-medium text-slate-900"
                          }`}
                        >
                          {d.label}
                        </span>
                        <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                          {c.lastMessageAt ? formatAgo(nowTick - Date.parse(c.lastMessageAt)) : ""}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-slate-500">
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
      <section className="flex flex-col rounded-lg border border-slate-200 bg-white overflow-hidden min-h-0">
        {activeConversation ? (
          <>
            <ActiveConversationHeader
              conversation={activeConversation}
              describe={describe(activeConversation)}
              membersById={membersById}
              currentMemberId={currentMemberId}
              now={nowTick}
            />
            <div
              ref={scrollerRef}
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
                  return (
                    <MessageBubble
                      key={m.id}
                      message={m}
                      own={own}
                      groupedWithPrev={grouped}
                    />
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
}: {
  conversation: ChatConversation;
  describe: { label: string; subtitle: string; avatar: MemberOpt | null };
  membersById: Map<string, MemberOpt>;
  currentMemberId: string;
  now: number;
}) {
  const others = conversation.memberRecordIds.filter((id) => id !== currentMemberId);
  return (
    <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5">
      <div className="min-w-0 flex items-center gap-2">
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

function MessageBubble({
  message,
  own,
  groupedWithPrev,
}: {
  message: ChatMessage;
  own: boolean;
  groupedWithPrev: boolean;
}) {
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
          className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-xs leading-relaxed ${
            own
              ? "bg-brand-600 text-white rounded-br-md"
              : "bg-white text-slate-800 ring-1 ring-slate-200 rounded-bl-md"
          }`}
        >
          {message.body}
        </div>
        {message.sentAt ? (
          <div
            className={`mt-0.5 text-[9px] tabular-nums ${
              own ? "text-right text-slate-400" : "text-slate-400"
            }`}
            title={new Date(message.sentAt).toLocaleString()}
          >
            {new Date(message.sentAt).toLocaleTimeString("en-GB", {
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
  return (
    <div className="border-t border-slate-100 px-3 py-2">
      <div className="flex items-end gap-2">
        <textarea
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
          className="flex-1 resize-none rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/30"
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
  currentMemberId,
  now,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  members: MemberOpt[];
  currentMemberId: string;
  now: number;
  onCreate: (
    payload:
      | { kind: "Direct"; memberRecordId: string }
      | { kind: "Group"; title: string; memberRecordIds: string[] },
  ) => void;
}) {
  const [kind, setKind] = useState<ChatKind>("Direct");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupTitle, setGroupTitle] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind("Direct");
    setSearch("");
    setSelected(new Set());
    setGroupTitle("");
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

  async function go() {
    setBusy(true);
    try {
      if (kind === "Direct") {
        const id = [...selected][0];
        if (!id) return;
        onCreate({ kind: "Direct", memberRecordId: id });
      } else {
        const ids = [...selected];
        if (ids.length < 1 || !groupTitle.trim()) return;
        onCreate({ kind: "Group", title: groupTitle.trim(), memberRecordIds: ids });
      }
    } finally {
      setBusy(false);
    }
  }

  const canCreate =
    kind === "Direct"
      ? selected.size === 1
      : selected.size >= 1 && groupTitle.trim().length > 0;

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
          <div className="inline-flex items-center rounded-md border border-slate-200 bg-white p-0.5">
            {(
              [
                { v: "Direct" as const, label: "Direct message" },
                { v: "Group" as const, label: "Group" },
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
            {busy ? "Opening…" : kind === "Direct" ? "Open chat" : "Create group"}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ----- utils ----------------------------------------------------------------

function formatAgo(diffMs: number): string {
  if (!Number.isFinite(diffMs) || diffMs < 0) return "";
  if (diffMs < MIN) return "now";
  const min = Math.floor(diffMs / MIN);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(mo / 12)}y`;
}
