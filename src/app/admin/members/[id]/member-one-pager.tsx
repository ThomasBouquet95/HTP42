"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DownloadChip } from "@/components/download-chip";
import { Button } from "@/components/form-controls";

// Admin upload/replace/remove of a member's HTP42 one-pager deck (PPT/PDF),
// shown next to the CV on the member page. Posts to the member one-pager route
// and refreshes the server data on success.
export function MemberOnePager({
  memberId,
  url,
  filename,
}: {
  memberId: string;
  url: string | null;
  filename: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(`/api/admin/members/${memberId}/one-pager`, { method: "POST", body: fd });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(d.error ?? "Upload failed.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/members/${memberId}/one-pager`, { method: "DELETE" });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Remove failed.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <DownloadChip url={url ?? undefined} title="Open one-pager" emptyTitle="No one-pager yet" />
        {url ? (
          <span className="min-w-0 truncate text-xs text-slate-600">{filename || "one-pager.pdf"}</span>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.ppt,.pptx,.png,.jpg,.jpeg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            if (fileRef.current) fileRef.current.value = "";
          }}
        />
        <Button tone="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? "Uploading…" : url ? "Replace" : "Upload"}
        </Button>
        {url ? (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="text-[11px] text-slate-500 hover:text-rose-600 disabled:opacity-50"
          >
            Remove
          </button>
        ) : null}
      </div>
      <p className="mt-1.5 text-[11px] text-slate-400">PDF or PowerPoint — up to 5 MB.</p>
      {error ? <div className="mt-2 text-[11px] text-rose-600">{error}</div> : null}
    </div>
  );
}
