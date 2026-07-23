"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/form-controls";

// One-click admin migration: folds the legacy "Engagement Lead" and "Project
// Lead" project roles into a single "Project Manager" across every staffing.
// Idempotent — re-running once done reports "0". Kept in the Staffing header
// because that's where the Project Role lives.
export function MigrateRolesButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function run() {
    if (
      !confirm(
        "Migrate every staffing with an Engagement Lead or Project Lead role to Project Manager? This updates Airtable and can't be undone automatically.",
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/staffings/migrate-roles", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        migrated?: number;
        scanned?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Migration failed.");
      const n = data.migrated ?? 0;
      setMsg({
        kind: "ok",
        text:
          n === 0
            ? "Already up to date — nothing to migrate."
            : `Migrated ${n} staffing${n === 1 ? "" : "s"} to Project Manager.`,
      });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Migration failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {msg ? (
        <span
          className={`text-[11px] ${msg.kind === "error" ? "text-red-600" : "text-emerald-600"}`}
        >
          {msg.text}
        </span>
      ) : null}
      <Button tone="secondary" size="sm" onClick={run} disabled={busy}>
        {busy ? "Migrating…" : "Migrate lead roles → Project Manager"}
      </Button>
    </div>
  );
}
