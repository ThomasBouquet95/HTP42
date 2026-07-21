"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Modal } from "@/components/modal";
import { Button, FormSelect, FormTextarea } from "@/components/form-controls";

const TYPES = ["Bug", "Improvement", "Question", "Other"] as const;
const URGENCIES = ["Low", "Medium", "High", "Critical"] as const;

// Admin-only "Report an issue / suggest an improvement" launcher for the top
// nav. Opens a modal: type + urgency + description + optional screenshot.
export function ReportIssueButton() {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string>("Bug");
  const [urgency, setUrgency] = useState<string>("Medium");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function reset() {
    setType("Bug");
    setUrgency("Medium");
    setDescription("");
    setFile(null);
    setBusy(false);
    setError(null);
    setDone(false);
  }
  function close() {
    if (busy) return;
    setOpen(false);
    reset();
  }

  async function submit() {
    if (description.trim().length < 3) {
      setError("Please add a short description.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("type", type);
      fd.append("urgency", urgency);
      fd.append("description", description.trim());
      fd.append("page", pathname);
      if (file) fd.append("screenshot", file);
      const res = await fetch("/api/support-tickets", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not submit.");
        return;
      }
      setDone(true);
    } catch {
      setError("Network error while submitting.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Report an issue or suggest an improvement"
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M8 1.5 14.5 13h-13z" strokeLinejoin="round" />
          <path d="M8 6.5v3" strokeLinecap="round" />
          <circle cx="8" cy="11.4" r="0.6" fill="currentColor" stroke="none" />
        </svg>
        <span className="hidden md:inline">Report / suggest</span>
      </button>

      <Modal
        open={open}
        onClose={close}
        busy={busy}
        title="Report an issue or suggest an improvement"
        size="lg"
        footer={
          done ? (
            <Button tone="primary" size="sm" onClick={close}>
              Done
            </Button>
          ) : (
            <>
              <Button tone="secondary" size="sm" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button tone="primary" size="sm" onClick={submit} disabled={busy}>
                {busy ? "Submitting…" : "Submit"}
              </Button>
            </>
          )
        }
      >
        {done ? (
          <div className="py-6 text-center text-sm text-slate-700">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              ✓
            </div>
            Thanks — your report was submitted. The team can see it under Admin → Roles &amp; access →
            Requests.
          </div>
        ) : (
          <div className="space-y-3">
            {error ? (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {error}
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <FormSelect label="Type" value={type} onChange={setType}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </FormSelect>
              <FormSelect label="Urgency" value={urgency} onChange={setUrgency}>
                {URGENCIES.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </FormSelect>
            </div>
            <FormTextarea
              label="Description"
              value={description}
              onChange={setDescription}
              rows={5}
              placeholder="What happened, or what would you improve? Steps to reproduce help for bugs."
            />
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Screenshot (optional)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-50"
              />
              {file ? <p className="mt-1 truncate text-[11px] text-slate-500">{file.name}</p> : null}
            </div>
            <p className="text-[11px] text-slate-400">
              Submitted from <span className="font-mono">{pathname || "/"}</span>
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
