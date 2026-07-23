"use client";

import { useRef, useState } from "react";
import type { MemberNote } from "@/lib/airtable";
import { noteHtmlToPlain, sanitizeNoteHtml } from "@/lib/note-html";

// Admin/HR-only internal notes for a member. Supports multiple notes with
// inline formatting (Cmd/Ctrl+B / I / U — no toolbar) and add/remove. Each
// change saves immediately (optimistic) via the member PUT, so it sticks
// without a page refresh. Never shown to the member — this lives only on
// admin surfaces.
export function MemberNotes({
  memberId,
  initialNotes,
  className,
}: {
  memberId: string;
  initialNotes: MemberNote[];
  className?: string;
}) {
  const [notes, setNotes] = useState<MemberNote[]>(initialNotes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  async function persist(next: MemberNote[]) {
    const prev = notes;
    setNotes(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/members/${memberId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ internalNotes: next }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Could not save the note.");
      }
    } catch (e) {
      setNotes(prev); // roll back
      setError(e instanceof Error ? e.message : "Could not save the note.");
    } finally {
      setSaving(false);
    }
  }

  function addNote() {
    const el = editorRef.current;
    if (!el) return;
    const html = sanitizeNoteHtml(el.innerHTML);
    if (!noteHtmlToPlain(html)) return;
    el.innerHTML = "";
    void persist([{ id: newId(), html, at: new Date().toISOString() }, ...notes]);
  }

  function removeNote(id: string) {
    if (!confirm("Remove this note?")) return;
    void persist(notes.filter((n) => n.id !== id));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.shiftKey && e.key === "Enter") {
      e.preventDefault();
      addNote();
      return;
    }
    // contentEditable applies bold/italic/underline natively on Cmd/Ctrl+B/I/U;
    // call execCommand explicitly so it's reliable across browsers.
    const k = e.key.toLowerCase();
    if (mod && (k === "b" || k === "i" || k === "u")) {
      e.preventDefault();
      document.execCommand(k === "b" ? "bold" : k === "i" ? "italic" : "underline");
    }
  }

  return (
    <div className={`rounded-md border border-amber-200 bg-amber-50/40 p-3 ${className ?? ""}`}>
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
        <NoteLockIcon /> Internal notes
        <span className="ml-1 font-normal normal-case text-amber-600/70">
          · admin only, never shown to the member
        </span>
      </div>

      {/* Existing notes, newest first */}
      {notes.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {notes.map((n) => (
            <li
              key={n.id}
              className="group flex items-start justify-between gap-2 rounded-md border border-amber-200/70 bg-white px-2.5 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <div
                  className="text-xs leading-relaxed text-slate-800 demo-blur [&_a]:pointer-events-none"
                  dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(n.html) }}
                />
                {n.at ? (
                  <div className="mt-0.5 text-[10px] text-slate-400">{fmtWhen(n.at)}</div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => removeNote(n.id)}
                disabled={saving}
                aria-label="Remove note"
                title="Remove note"
                className="shrink-0 rounded p-0.5 text-slate-300 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[11px] italic text-slate-400">No notes yet.</p>
      )}

      {/* Composer */}
      <div className="mt-2">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="Write a note"
          onKeyDown={onKeyDown}
          data-placeholder="Write a note… ⌘/Ctrl+B bold, I italic, U underline"
          className="htp-note-editor min-h-[3.5rem] w-full rounded-md border border-amber-300 bg-white px-2.5 py-2 text-xs leading-relaxed text-slate-800 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
        />
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-[10px] text-slate-400">
            ⌘/Ctrl+B bold · I italic · U underline · ⌘/Ctrl+Enter to add
          </span>
          <button
            type="button"
            onClick={addNote}
            disabled={saving}
            className="rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Add note"}
          </button>
        </div>
        {error ? <div className="mt-1 text-[11px] text-red-600">{error}</div> : null}
      </div>
    </div>
  );
}

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return `n_${Date.now().toString(36)}${Math.round(Math.random() * 1e6).toString(36)}`;
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function NoteLockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
