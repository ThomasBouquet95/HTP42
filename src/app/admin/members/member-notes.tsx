"use client";

import { useEffect, useRef, useState } from "react";
import type { MemberNote } from "@/lib/airtable";
import { Modal, ConfirmDialog } from "@/components/modal";
import { noteHtmlToPlain, sanitizeNoteHtml } from "@/lib/note-html";

// Admin/HR-only internal notes for a member. Each note shows as a compact row
// (date + author + a short preview); clicking opens the full note — with its
// original inline formatting — in a popup, so a pasted email no longer floods
// the page. Supports inline formatting (Cmd/Ctrl+B / I / U — no toolbar), edit
// and remove. Each change saves immediately (optimistic) via the member PUT.
// Never shown to the member — admin surfaces only.
export function MemberNotes({
  memberId,
  initialNotes,
  authorName,
  className,
}: {
  memberId: string;
  initialNotes: MemberNote[];
  authorName?: string;
  className?: string;
}) {
  const [notes, setNotes] = useState<MemberNote[]>(initialNotes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewerEditing, setViewerEditing] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
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
    void persist([
      { id: newId(), html, at: new Date().toISOString(), by: authorName || undefined },
      ...notes,
    ]);
  }

  function saveEdit(id: string, html: string) {
    const clean = sanitizeNoteHtml(html);
    setViewerEditing(false);
    if (!noteHtmlToPlain(clean)) {
      // Editing to empty removes the note.
      setViewingId(null);
      void persist(notes.filter((n) => n.id !== id));
      return;
    }
    void persist(notes.map((n) => (n.id === id ? { ...n, html: clean } : n)));
  }

  function onComposerKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    handleFormatKeys(e, addNote);
  }

  const viewing = notes.find((n) => n.id === viewingId) ?? null;
  const removingNote = notes.find((n) => n.id === pendingRemove) ?? null;

  function closeViewer() {
    if (saving) return;
    setViewingId(null);
    setViewerEditing(false);
  }

  return (
    <div className={`rounded-md border border-amber-200 bg-amber-50/40 p-3 ${className ?? ""}`}>
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
        <NoteLockIcon /> Internal notes
        <span className="ml-1 font-normal normal-case text-amber-600/70">
          · admin only, never shown to the member
        </span>
      </div>

      {/* Existing notes, newest first — preview only, click to open full. */}
      {notes.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {notes.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => {
                  setViewingId(n.id);
                  setViewerEditing(false);
                }}
                className="group flex w-full items-start gap-2 rounded-md border border-amber-200/70 bg-white px-2.5 py-1.5 text-left transition hover:border-amber-300 hover:bg-amber-50/60"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                    <span>{noteMeta(n)}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-slate-700 demo-blur">
                    {noteHtmlToPlain(n.html) || "—"}
                  </span>
                </span>
                <svg
                  viewBox="0 0 16 16"
                  className="mt-0.5 h-3 w-3 shrink-0 text-slate-300 transition group-hover:text-amber-500"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden
                >
                  <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
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
          onKeyDown={onComposerKeyDown}
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

      {/* Full-note viewer / editor popup. */}
      <Modal
        open={!!viewing}
        onClose={closeViewer}
        busy={saving}
        title="Internal note"
        size="lg"
        footer={
          viewing && !viewerEditing ? (
            <>
              <button
                type="button"
                onClick={() => setPendingRemove(viewing.id)}
                disabled={saving}
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Remove
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => setViewerEditing(true)}
                disabled={saving}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={closeViewer}
                className="rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
              >
                Close
              </button>
            </>
          ) : undefined
        }
      >
        {viewing ? (
          viewerEditing ? (
            <InlineNoteEditor
              initialHtml={viewing.html}
              saving={saving}
              onSave={(html) => saveEdit(viewing.id, html)}
              onCancel={() => setViewerEditing(false)}
            />
          ) : (
            <>
              <div className="mb-2 text-[11px] text-slate-400">{noteMeta(viewing)}</div>
              <div
                className="htp-note-content max-h-[60vh] overflow-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800 demo-blur"
                dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(viewing.html) }}
              />
            </>
          )
        ) : null}
      </Modal>

      <ConfirmDialog
        open={!!pendingRemove}
        title="Remove this note?"
        message={
          <span>
            This internal note will be permanently removed.
            {removingNote ? (
              <span className="mt-2 block rounded-md bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600 ring-1 ring-slate-100">
                {noteHtmlToPlain(removingNote.html).slice(0, 200)}
                {noteHtmlToPlain(removingNote.html).length > 200 ? "…" : ""}
              </span>
            ) : null}
          </span>
        }
        confirmLabel="Remove"
        confirmTone="danger"
        busy={saving}
        onCancel={() => setPendingRemove(null)}
        onConfirm={() => {
          const id = pendingRemove;
          setPendingRemove(null);
          setViewingId(null);
          if (id) void persist(notes.filter((n) => n.id !== id));
        }}
      />
    </div>
  );
}

// Inline editor for an existing note — a contentEditable seeded with the note,
// with Save / Cancel. Shares the same formatting shortcuts as the composer.
function InlineNoteEditor({
  initialHtml,
  saving,
  onSave,
  onCancel,
}: {
  initialHtml: string;
  saving: boolean;
  onSave: (html: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = initialHtml;
    el.focus();
    // Put the caret at the end.
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [initialHtml]);

  function commit() {
    onSave(ref.current?.innerHTML ?? "");
  }

  return (
    <div className="rounded-md border border-amber-300 bg-white p-1.5">
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Edit note"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
            return;
          }
          handleFormatKeys(e, commit);
        }}
        className="htp-note-editor max-h-[55vh] min-h-[6rem] w-full overflow-auto rounded px-1.5 py-1 text-sm leading-relaxed text-slate-800 focus:outline-none"
      />
      <div className="mt-1.5 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-md px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={commit}
          disabled={saving}
          className="rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-amber-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// Cmd/Ctrl+B/I/U formatting + Cmd/Ctrl+Enter to submit, shared by composer
// and inline editor.
function handleFormatKeys(e: React.KeyboardEvent<HTMLDivElement>, submit: () => void) {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && !e.shiftKey && e.key === "Enter") {
    e.preventDefault();
    submit();
    return;
  }
  const k = e.key.toLowerCase();
  if (mod && (k === "b" || k === "i" || k === "u")) {
    e.preventDefault();
    document.execCommand(k === "b" ? "bold" : k === "i" ? "italic" : "underline");
  }
}

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return `n_${Date.now().toString(36)}${Math.round(Math.random() * 1e6).toString(36)}`;
}

// "9 Nov 2026 · Pascal Bouquet" (author omitted when unknown, e.g. legacy notes).
function noteMeta(n: MemberNote): string {
  const when = n.at ? fmtWhen(n.at) : "";
  return [when, n.by].filter(Boolean).join(" · ") || "Note";
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
