"use client";

import { useEffect, useState } from "react";
import type { ChatConversation } from "@/lib/airtable";

// Source of truth for "how many of my chat conversations have unread
// messages right now". Used by:
//   - the AppHeader nav badge (small bubble next to "Chat")
//   - the chat client itself (sidebar dots + tab title)
// Both consumers run the same lightweight 15s poll so we don't rely on a
// global context to share state. The localStorage key matches what the
// chat client writes when the user opens a conversation.
const LAST_SEEN_KEY = "htp42-chat-lastSeen";
const POLL_MS = 15_000;

export function useChatUnreadCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let lastReqId = 0;

    function readLastSeen(): Record<string, string> {
      if (typeof window === "undefined") return {};
      try {
        const raw = window.localStorage.getItem(LAST_SEEN_KEY);
        return raw ? (JSON.parse(raw) as Record<string, string>) : {};
      } catch {
        return {};
      }
    }

    async function refresh() {
      // Skip while the tab is hidden — the badge can't be seen anyway and
      // the chat client may already be polling on its own.
      if (typeof document !== "undefined" && document.hidden) return;
      const reqId = ++lastReqId;
      try {
        const res = await fetch("/api/chat/conversations", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { conversations: ChatConversation[] };
        if (cancelled || reqId !== lastReqId) return;
        const seen = readLastSeen();
        let n = 0;
        for (const c of data.conversations) {
          if (!c.lastMessageAt) continue;
          const last = seen[c.id];
          if (!last || Date.parse(c.lastMessageAt) > Date.parse(last)) n += 1;
        }
        setCount(n);
      } catch {
        // swallow — next tick will retry
      }
    }

    // Initial fetch on mount + interval poll + refresh on tab focus.
    refresh();
    const id = setInterval(refresh, POLL_MS);
    const onVis = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    // Re-evaluate whenever the localStorage entry changes (another tab
    // marked something as read, or our own chat client did).
    const onStorage = (e: StorageEvent) => {
      if (e.key === LAST_SEEN_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    // localStorage "storage" events don't fire in the SAME tab that wrote
    // them, so the chat client dispatches this custom event after every
    // last-seen update. Without it the header badge would lag up to a full
    // poll cycle behind the user marking a message as read in the same tab
    // (notably right after they sent a message and want the badge to
    // clear immediately).
    const onLastSeenChanged = () => refresh();
    window.addEventListener("htp42-chat-lastseen-changed", onLastSeenChanged);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("htp42-chat-lastseen-changed", onLastSeenChanged);
    };
  }, []);

  return count;
}
