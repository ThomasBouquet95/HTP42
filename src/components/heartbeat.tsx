"use client";

import { useEffect } from "react";

// Pings /api/auth/heartbeat while the portal tab is open and visible so the
// admin sign-in dashboard can show real-time presence ("online now"). We
// only ping while document.visibilityState === "visible" to avoid waking up
// background tabs unnecessarily; the server collapses bursts to one Airtable
// write per minute anyway.
const HEARTBEAT_INTERVAL_MS = 60_000;

export function Heartbeat() {
  useEffect(() => {
    let cancelled = false;
    function ping() {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      // Fire-and-forget; never block the UI on the response.
      void fetch("/api/auth/heartbeat", {
        method: "POST",
        keepalive: true,
      }).catch(() => {});
    }
    // Initial ping the moment the component mounts.
    ping();
    const interval = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    // Also ping immediately when the tab regains focus so "online" pops back
    // on right away after the user comes back from another tab.
    const onVisibility = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return null;
}
