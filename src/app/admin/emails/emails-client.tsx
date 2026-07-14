"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/form-controls";
import { SearchInput } from "@/components/search-input";
import {
  interpolateSubject,
  interpolateHtml,
  type EmailTemplateDef,
  type EmailTemplateOverride,
  type EmailVars,
} from "@/lib/email-templates";

type Item = { def: EmailTemplateDef; override: EmailTemplateOverride | null };

// Build sample vars so the live preview renders with readable stand-ins for
// each placeholder (scalars as «token», blocks as a small sample fragment).
function sampleVars(def: EmailTemplateDef): EmailVars {
  const vars: EmailVars = {};
  for (const p of def.placeholders) {
    vars[p.token] = p.block
      ? { text: `«${p.token}»`, html: `<em style="color:#64748b">«${p.token}»</em>` }
      : `«${p.token}»`;
  }
  return vars;
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 text-xs">
      <span className="font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-slate-600">{value}</span>
    </div>
  );
}

function TemplateCard({ item, canEdit }: { item: Item; canEdit: boolean }) {
  const router = useRouter();
  const { def, override } = item;
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(override?.subject || def.defaultSubject);
  const [body, setBody] = useState(override?.body || def.defaultBody);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const isCustom = !!override;
  const dirty = subject !== (override?.subject || def.defaultSubject) || body !== (override?.body || def.defaultBody);

  const vars = useMemo(() => sampleVars(def), [def]);
  const previewSubject = interpolateSubject(subject, vars);
  const previewHtml = interpolateHtml(body, vars);

  async function post(action: "save" | "reset") {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: def.key, action, subject, body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error || "Could not save.");
      } else {
        if (action === "reset") {
          setSubject(def.defaultSubject);
          setBody(def.defaultBody);
        }
        setMsg(action === "reset" ? "Reverted to the default." : "Saved.");
        router.refresh();
      }
    } catch {
      setMsg("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">{def.name}</span>
            {isCustom ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                Customised
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Default
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500">{def.purpose}</p>
        </div>
        <span className="shrink-0 text-slate-400">{open ? "−" : "+"}</span>
      </button>

      {open ? (
        <div className="space-y-4 border-t border-slate-100 px-4 py-4">
          {/* Documentation */}
          <div className="space-y-1.5 rounded-md bg-slate-50 p-3">
            <Meta label="Recipient" value={def.recipient} />
            <Meta label="Trigger" value={def.trigger} />
            <Meta label="Conditions" value={def.conditions} />
          </div>

          {/* Placeholders */}
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Placeholders
            </div>
            <div className="space-y-1">
              {def.placeholders.map((p) => (
                <div key={p.token} className="flex flex-wrap items-baseline gap-2 text-xs">
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-brand-700">
                    {`{{${p.token}}}`}
                  </code>
                  <span className="text-slate-500">
                    {p.description}
                    {p.block ? " (structured — inserted as-is)" : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Editor */}
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Subject</span>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={!canEdit}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none disabled:bg-slate-50"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Body</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={!canEdit}
                rows={12}
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs leading-relaxed focus:border-brand-500 focus:outline-none disabled:bg-slate-50"
              />
              <span className="mt-1 block text-[11px] text-slate-400">
                Blank lines separate paragraphs. Use the placeholders above; links become clickable
                automatically.
              </span>
            </label>
          </div>

          {/* Live preview */}
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Preview (with sample values)
            </div>
            <div className="rounded-md border border-slate-200">
              <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs">
                <span className="font-semibold text-slate-500">Subject: </span>
                <span className="text-slate-800">{previewSubject}</span>
              </div>
              <div
                className="prose-sm px-3 py-3 text-sm text-slate-700"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>

          {canEdit ? (
            <div className="flex items-center gap-2">
              <Button tone="primary" size="sm" disabled={busy || !dirty} onClick={() => post("save")}>
                {busy ? "Saving…" : "Save"}
              </Button>
              {isCustom ? (
                <Button tone="ghost" size="sm" disabled={busy} onClick={() => post("reset")}>
                  Revert to default
                </Button>
              ) : null}
              {msg ? <span className="text-xs text-slate-500">{msg}</span> : null}
            </div>
          ) : (
            <p className="text-xs text-slate-400">You have view-only access to email templates.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function EmailsClient({ templates, canEdit }: { templates: Item[]; canEdit: boolean }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return templates;
    return templates.filter(
      (t) =>
        t.def.name.toLowerCase().includes(term) ||
        t.def.purpose.toLowerCase().includes(term) ||
        t.def.key.toLowerCase().includes(term),
    );
  }, [q, templates]);

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-brand-100 bg-brand-50 px-3 py-2 text-xs text-brand-900">
        These are every automated email the portal sends. Edit the subject and body inline; changes
        take effect immediately for future sends. Recipients, attachments and triggers are fixed by
        the workflow and shown for reference. Revert any email to its built-in default at any time.
      </div>
      <div className="max-w-xs">
        <SearchInput value={q} onChange={setQ} placeholder="Search emails…" />
      </div>
      <div className="space-y-2">
        {filtered.map((t) => (
          <TemplateCard key={t.def.key} item={t} canEdit={canEdit} />
        ))}
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No emails match your search.</p>
        ) : null}
      </div>
    </div>
  );
}
