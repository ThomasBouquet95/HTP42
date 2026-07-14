"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/form-controls";
import { SearchInput } from "@/components/search-input";
import { SegmentedTabs, FilterBar, FilterMultiSelect, FilterDateRange } from "@/components/filters";
import {
  interpolateSubject,
  interpolateHtml,
  emailTypeOf,
  type EmailTemplateDef,
  type EmailTemplateOverride,
  type EmailVars,
} from "@/lib/email-templates";

type Item = { def: EmailTemplateDef; override: EmailTemplateOverride | null };
type Defaults = { sender: string; financeInbox: string };
export type EmailLogRow = {
  id: string;
  sentAt: string | null;
  label: string;
  status: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  attachments: string;
  error: string;
  body: string;
  files: { filename: string; url: string }[];
};

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

function Labelled({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-slate-400">{hint}</span> : null}
    </label>
  );
}

const inputCls =
  "w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none disabled:bg-slate-50";

function TemplateCard({
  item,
  canEdit,
  defaults,
}: {
  item: Item;
  canEdit: boolean;
  defaults: Defaults;
}) {
  const router = useRouter();
  const { def, override } = item;
  const [open, setOpen] = useState(false);
  // Pre-fill the routing fields with the *effective* values so the admin sees
  // the real sender / recipients (e.g. invoices@…) rather than a blank box.
  const init = {
    subject: override?.subject || def.defaultSubject,
    body: override?.body || def.defaultBody,
    to: override?.to || (def.toMode === "fixed" ? defaults.financeInbox : ""),
    cc: override?.cc || def.defaultCc.join(", "),
    from: override?.from || defaults.sender,
  };
  const [subject, setSubject] = useState(init.subject);
  const [body, setBody] = useState(init.body);
  const [to, setTo] = useState(init.to);
  const [cc, setCc] = useState(init.cc);
  const [from, setFrom] = useState(init.from);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const isCustom = !!override;
  const dirty =
    subject !== init.subject ||
    body !== init.body ||
    to !== init.to ||
    cc !== init.cc ||
    from !== init.from;

  const vars = useMemo(() => sampleVars(def), [def]);
  const previewSubject = interpolateSubject(subject, vars);
  const previewHtml = interpolateHtml(body, vars);

  const defaultCcLabel = def.defaultCc.length ? def.defaultCc.join(", ") : "none";
  const toDefaultLabel =
    def.toMode === "fixed" ? defaults.financeInbox || "finance inbox" : def.dynamicRecipient || "per record";

  async function post(action: "save" | "reset") {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: def.key, action, subject, body, to, cc, from }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error || "Could not save.");
      } else {
        if (action === "reset") {
          setSubject(def.defaultSubject);
          setBody(def.defaultBody);
          setTo(def.toMode === "fixed" ? defaults.financeInbox : "");
          setCc(def.defaultCc.join(", "));
          setFrom(defaults.sender);
        }
        setMsg(action === "reset" ? "Reverted to the default." : "Saved. Applies to future sends.");
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
        <div className="space-y-5 border-t border-slate-100 px-4 py-4">
          {/* Reference: how it fires */}
          <div className="grid gap-x-6 gap-y-1.5 rounded-md bg-slate-50 p-3 text-xs sm:grid-cols-2">
            <div>
              <span className="font-semibold uppercase tracking-wide text-slate-400">Trigger</span>
              <p className="text-slate-600">{def.trigger}</p>
            </div>
            <div>
              <span className="font-semibold uppercase tracking-wide text-slate-400">Conditions</span>
              <p className="text-slate-600">{def.conditions}</p>
            </div>
          </div>

          {/* Routing: from / to / cc */}
          <div className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Routing
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Labelled label="From (sender)" hint={`Default: ${defaults.sender || "not configured"}. Must be a mailbox authorised in Microsoft 365.`}>
                <input
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  disabled={!canEdit}
                  placeholder={defaults.sender || "sender@htp42.com"}
                  className={inputCls}
                />
              </Labelled>
              <Labelled
                label="To (recipient)"
                hint={
                  def.toMode === "fixed"
                    ? `Default: ${toDefaultLabel}. Comma-separate multiple addresses.`
                    : `Sent to ${toDefaultLabel} automatically. Leave blank to keep that, or set an address to force every send to a fixed inbox.`
                }
              >
                <input
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  disabled={!canEdit}
                  placeholder={def.toMode === "fixed" ? toDefaultLabel : `(${toDefaultLabel})`}
                  className={inputCls}
                />
              </Labelled>
            </div>
            <Labelled label="CC" hint={`Default: ${defaultCcLabel}. Comma-separate multiple addresses; leave blank to use the default.`}>
              <input
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                disabled={!canEdit}
                placeholder={defaultCcLabel}
                className={inputCls}
              />
            </Labelled>
          </div>

          {/* Content: subject / body */}
          <div className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Content
            </div>
            <Labelled label="Subject">
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={!canEdit}
                className={inputCls}
              />
            </Labelled>
            <Labelled
              label="Body"
              hint="Blank lines separate paragraphs. Use the placeholders below; links become clickable automatically."
            >
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={!canEdit}
                rows={12}
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs leading-relaxed focus:border-brand-500 focus:outline-none disabled:bg-slate-50"
              />
            </Labelled>
            <div className="flex flex-wrap gap-1.5">
              {def.placeholders.map((p) => (
                <span
                  key={p.token}
                  title={p.description + (p.block ? " (structured — inserted as-is)" : "")}
                  className="cursor-help rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-brand-700"
                >
                  {`{{${p.token}}}`}
                </span>
              ))}
            </div>
          </div>

          {/* Live preview */}
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Preview (sample values)
            </div>
            <div className="rounded-md border border-slate-200">
              <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs">
                <span className="font-semibold text-slate-500">Subject: </span>
                <span className="text-slate-800">{previewSubject}</span>
              </div>
              <div
                className="px-3 py-3 text-sm text-slate-700"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>

          {canEdit ? (
            <div className="flex items-center gap-2">
              <Button tone="primary" size="sm" disabled={busy || !dirty} onClick={() => post("save")}>
                {busy ? "Saving…" : "Save changes"}
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

function TemplatesView({
  templates,
  canEdit,
  defaults,
}: {
  templates: Item[];
  canEdit: boolean;
  defaults: Defaults;
}) {
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
      <div className="rounded-md border border-brand-100 bg-brand-50 px-3 py-2.5 text-xs leading-relaxed text-brand-900">
        Every automated email the portal sends is listed here. Edit the sender, recipients (To / CC),
        subject and body — changes are saved to the database and{" "}
        <strong>take effect on the next send</strong>, not just in this preview. Triggers and
        attachments are fixed by the workflow. Revert any email to its built-in default at any time.
      </div>
      <div className="max-w-xs">
        <SearchInput value={q} onChange={setQ} placeholder="Search emails…" />
      </div>
      <div className="space-y-2">
        {filtered.map((t) => (
          <TemplateCard key={t.def.key} item={t} canEdit={canEdit} defaults={defaults} />
        ))}
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No emails match your search.</p>
        ) : null}
      </div>
    </div>
  );
}

function fmtStamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusPill({ status }: { status: string }) {
  const sent = status.toLowerCase() === "sent";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        sent ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
      }`}
    >
      {status || "—"}
    </span>
  );
}

function LogRow({ log }: { log: EmailLogRow }) {
  const [open, setOpen] = useState(false);
  const attachmentCount =
    log.files.length || (log.attachments ? log.attachments.split(",").filter(Boolean).length : 0);
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
      >
        <StatusPill status={log.status} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-slate-800">
              {log.label || log.subject || "(email)"}
            </span>
            {attachmentCount > 0 ? (
              <span
                title={log.attachments}
                className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500"
              >
                📎 {attachmentCount}
              </span>
            ) : null}
          </div>
          <p className="truncate text-xs text-slate-500">
            to {log.to || "—"} · {log.subject}
          </p>
        </div>
        <span className="shrink-0 text-xs text-slate-400">{fmtStamp(log.sentAt)}</span>
      </button>
      {open ? (
        <div className="space-y-2 border-t border-slate-100 px-4 py-3 text-xs">
          <div className="grid grid-cols-[5rem_1fr] gap-1.5">
            <span className="font-semibold text-slate-400">From</span>
            <span className="text-slate-700">{log.from || "—"}</span>
            <span className="font-semibold text-slate-400">To</span>
            <span className="text-slate-700">{log.to || "—"}</span>
            <span className="font-semibold text-slate-400">Cc</span>
            <span className="text-slate-700">{log.cc || "—"}</span>
            <span className="font-semibold text-slate-400">Subject</span>
            <span className="text-slate-700">{log.subject || "—"}</span>
            <span className="font-semibold text-slate-400">Attachments</span>
            <span className="text-slate-700">
              {log.files.length > 0 ? (
                <span className="flex flex-wrap gap-1.5">
                  {log.files.map((f, i) => (
                    <a
                      key={i}
                      href={`/api/admin/emails/attachment?id=${encodeURIComponent(log.id)}&i=${i}`}
                      className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 hover:border-brand-300 hover:bg-brand-50"
                    >
                      📎 {f.filename}
                    </a>
                  ))}
                </span>
              ) : (
                log.attachments || "none"
              )}
            </span>
            {log.error ? (
              <>
                <span className="font-semibold text-rose-500">Error</span>
                <span className="text-rose-600">{log.error}</span>
              </>
            ) : null}
          </div>
          {log.body ? (
            <div>
              <div className="mb-1 font-semibold text-slate-400">Body</div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-700">
                {log.body}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TypeTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-brand-300 bg-brand-50 text-brand-800"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
      }`}
    >
      {label}
      <span
        className={`rounded-full px-1.5 text-[10px] font-semibold ${
          active ? "bg-brand-200 text-brand-800" : "bg-slate-100 text-slate-500"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function dayOf(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function LogsView({ logs, canEdit }: { logs: EmailLogRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [attach, setAttach] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Bucket every row (live or backfilled) by its type, so the tabs cover the
  // whole log — historical imports included.
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of logs) {
      const t = emailTypeOf(l.label, l.subject);
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [logs]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return logs.filter((l) => {
      if (type && emailTypeOf(l.label, l.subject) !== type) return false;
      if (term) {
        const hay = [l.label, l.subject, l.to, l.cc, l.from, l.status, l.attachments]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (statuses.length && !statuses.includes(l.status)) return false;
      if (attach.length) {
        const has = l.files.length > 0 || !!l.attachments;
        if (attach.includes("yes") && !has) return false;
        if (attach.includes("no") && has) return false;
      }
      const day = dayOf(l.sentAt);
      if (from && day && day < from) return false;
      if (to && day && day > to) return false;
      return true;
    });
  }, [q, logs, type, statuses, attach, from, to]);

  const anyFilter = type || statuses.length || attach.length || from || to || q;

  async function backfill() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/emails/backfill", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error || "Import failed.");
      } else {
        setMsg(
          `Imported ${data.imported} email${data.imported === 1 ? "" : "s"}` +
            (data.filled ? `, added attachments to ${data.filled} existing` : "") +
            (data.skipped ? ` (${data.skipped} already up to date).` : "."),
        );
        router.refresh();
      }
    } catch {
      setMsg("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
        Every email the portal has dispatched, newest first (last {logs.length}). Each entry records
        the sender, recipients, subject, the attachments that went with it, and the delivery outcome.
        Expand a row to see the full recipients and the message body. The log starts from when this
        feature went live; use <strong>Import from Sent Items</strong> to pull in the mailbox history.
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-64">
          <SearchInput value={q} onChange={setQ} placeholder="Search subject, recipient…" />
        </div>
        {canEdit ? (
          <Button tone="secondary" size="sm" disabled={busy} onClick={backfill}>
            {busy ? "Importing…" : "Import from Sent Items"}
          </Button>
        ) : null}
        {msg ? <span className="text-xs text-slate-500">{msg}</span> : null}
      </div>
      {/* Type tabs — switch between the different kinds of email. */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2">
        <TypeTab label="All" count={logs.length} active={type === ""} onClick={() => setType("")} />
        {typeCounts.map(([t, n]) => (
          <TypeTab key={t} label={t} count={n} active={type === t} onClick={() => setType(t)} />
        ))}
      </div>
      <FilterBar>
        <FilterMultiSelect
          label="Status"
          selected={statuses}
          onChange={setStatuses}
          options={[
            { value: "Sent", label: "Sent" },
            { value: "Failed", label: "Failed" },
          ]}
        />
        <FilterMultiSelect
          label="Attachments"
          selected={attach}
          onChange={setAttach}
          options={[
            { value: "yes", label: "With attachment" },
            { value: "no", label: "No attachment" },
          ]}
        />
        <FilterDateRange label="Sent" from={from} to={to} onFrom={setFrom} onTo={setTo} />
        {anyFilter ? (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setType("");
              setStatuses([]);
              setAttach([]);
              setFrom("");
              setTo("");
            }}
            className="text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            Reset
          </button>
        ) : null}
        <span className="text-xs text-slate-400">
          {filtered.length} of {logs.length}
        </span>
      </FilterBar>
      <div className="space-y-2">
        {filtered.map((l) => (
          <LogRow key={l.id} log={l} />
        ))}
        {logs.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            No emails have been sent yet. Sent emails will appear here.
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No logs match your filters.</p>
        ) : null}
      </div>
    </div>
  );
}

export function EmailsClient({
  templates,
  canEdit,
  defaults,
  logs,
}: {
  templates: Item[];
  canEdit: boolean;
  defaults: Defaults;
  logs: EmailLogRow[];
}) {
  const [tab, setTab] = useState<"templates" | "logs">("templates");
  return (
    <div className="space-y-4">
      <SegmentedTabs
        ariaLabel="Emails section"
        value={tab}
        onChange={setTab}
        options={[
          { value: "templates", label: "Templates" },
          { value: "logs", label: "Sent log", badge: logs.length || undefined },
        ]}
      />
      {tab === "templates" ? (
        <TemplatesView templates={templates} canEdit={canEdit} defaults={defaults} />
      ) : (
        <LogsView logs={logs} canEdit={canEdit} />
      )}
    </div>
  );
}
