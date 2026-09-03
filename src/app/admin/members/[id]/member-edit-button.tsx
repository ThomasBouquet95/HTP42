"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Button, FormField, FormSelect, FormTextarea } from "@/components/form-controls";
import type { Currency, MemberRole, MemberStatus, YesNo } from "@/lib/airtable";

// The four tooling / access provisioning flags, in display order.
const TOOLING_FIELDS = [
  { key: "htp42Email", label: "HTP42 email" },
  { key: "officeLicense", label: "Office license" },
  { key: "notionLicense", label: "Notion license" },
  { key: "claudeLicense", label: "Claude license" },
] as const;

type Editable = {
  id: string;
  photoUrl: string | null;
  fullName: string;
  email: string;
  personalEmail: string;
  role: MemberRole | "";
  status: MemberStatus;
  title: string;
  country: string;
  phone: string;
  legalEntity: string;
  dailyRate: number | null;
  htp42DailyRate: number | null;
  currency: Currency | "";
  introduction: string;
  htp42Email: YesNo;
  officeLicense: YesNo;
  notionLicense: YesNo;
  claudeLicense: YesNo;
};

// Admin edit affordance on a member's page: opens a modal with the editable
// fields plus the admin-only internal note (never shown to the member). Saves
// via the same PUT the members list uses, then refreshes the server data.
export function MemberEditButton({
  member,
  roles,
  statuses,
  currencies,
}: {
  member: Editable;
  roles: readonly MemberRole[];
  statuses: readonly MemberStatus[];
  currencies: readonly Currency[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(member.photoUrl);
  const [photoBusy, setPhotoBusy] = useState(false);

  async function changePhoto(file: File | null) {
    setPhotoBusy(true);
    setError(null);
    try {
      let res: Response;
      if (file) {
        const fd = new FormData();
        fd.set("file", file);
        res = await fetch(`/api/admin/members/${member.id}/photo`, { method: "POST", body: fd });
      } else {
        res = await fetch(`/api/admin/members/${member.id}/photo`, { method: "DELETE" });
      }
      const data = (await res.json().catch(() => ({}))) as {
        member?: { photo?: { url: string } | null };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Photo update failed.");
      setPhotoUrl(data.member?.photo?.url ?? null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Photo update failed.");
    } finally {
      setPhotoBusy(false);
    }
  }
  const [form, setForm] = useState(() => ({
    fullName: member.fullName,
    email: member.email,
    personalEmail: member.personalEmail,
    role: member.role,
    status: member.status,
    title: member.title,
    country: member.country,
    phone: member.phone,
    legalEntity: member.legalEntity,
    dailyRate: member.dailyRate == null ? "" : String(member.dailyRate),
    htp42DailyRate: member.htp42DailyRate == null ? "" : String(member.htp42DailyRate),
    currency: member.currency,
    introduction: member.introduction,
    htp42Email: member.htp42Email,
    officeLicense: member.officeLicense,
    notionLicense: member.notionLicense,
    claudeLicense: member.claudeLicense,
  }));

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/members/${member.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          personalEmail: form.personalEmail.trim(),
          role: form.role || undefined,
          status: form.status,
          title: form.title,
          country: form.country,
          phone: form.phone,
          legalEntity: form.legalEntity,
          dailyRate: form.dailyRate === "" ? null : Number(form.dailyRate),
          htp42DailyRate: form.htp42DailyRate === "" ? null : Number(form.htp42DailyRate),
          currency: form.currency,
          introduction: form.introduction,
          htp42Email: form.htp42Email,
          officeLicense: form.officeLicense,
          notionLicense: form.notionLicense,
          claudeLicense: form.claudeLicense,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Save failed.");
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button tone="primary" size="sm" onClick={() => setOpen(true)}>
        <PencilIcon /> Edit member
      </Button>

      <Modal
        open={open}
        onClose={() => (saving ? undefined : setOpen(false))}
        busy={saving}
        title={`Edit ${member.fullName || "member"}`}
        size="xl"
        footer={
          <>
            <Button tone="secondary" size="sm" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button tone="primary" size="sm" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </>
        }
      >
        {/* Profile photo — the one picture used across the app. Saved
            instantly (independent of the field save below). */}
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-600">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" className="h-full w-full object-cover demo-blur" />
            ) : (
              (form.fullName || "?").trim().slice(0, 1).toUpperCase()
            )}
          </span>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
              Profile photo
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <label
                className={`inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 ${
                  photoBusy ? "pointer-events-none opacity-60" : "cursor-pointer"
                }`}
              >
                {photoBusy ? "Uploading…" : photoUrl ? "Replace" : "Upload"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  disabled={photoBusy}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (f) void changePhoto(f);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              {photoUrl ? (
                <button
                  type="button"
                  onClick={() => void changePhoto(null)}
                  disabled={photoBusy}
                  className="text-[11px] text-slate-500 hover:text-red-600 disabled:opacity-50"
                >
                  Remove
                </button>
              ) : null}
            </div>
            <p className="mt-1 text-[10px] text-slate-400">Same picture the member sees on their profile. Max 2 MB.</p>
          </div>
        </div>

        <Section title="Identity">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Full name" value={form.fullName} onChange={(v) => set("fullName", v)} required />
            <FormSelect label="Status" value={form.status} onChange={(v) => set("status", v as MemberStatus)}>
              {statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </FormSelect>
            <FormSelect label="Role" value={form.role} onChange={(v) => set("role", v as MemberRole | "")}>
              <option value="">—</option>
              {roles.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </FormSelect>
            <FormField label="Title" value={form.title} onChange={(v) => set("title", v)} />
          </div>
        </Section>

        <Section title="Contact & location">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Login email" value={form.email} onChange={(v) => set("email", v)} />
            <FormField label="Personal email" value={form.personalEmail} onChange={(v) => set("personalEmail", v)} />
            <FormField label="Phone" value={form.phone} onChange={(v) => set("phone", v)} />
            <FormField label="Country" value={form.country} onChange={(v) => set("country", v)} />
            <FormField label="Legal entity" value={form.legalEntity} onChange={(v) => set("legalEntity", v)} className="sm:col-span-2" />
          </div>
        </Section>

        <Section title="Commercials">
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="Member rate" type="number" value={form.dailyRate} onChange={(v) => set("dailyRate", v)} />
            <FormField label="HTP42 rate" type="number" value={form.htp42DailyRate} onChange={(v) => set("htp42DailyRate", v)} />
            <FormSelect label="Currency" value={form.currency} onChange={(v) => set("currency", v as Currency | "")}>
              <option value="">—</option>
              {currencies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </FormSelect>
          </div>
        </Section>

        <Section title="Tooling & access">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TOOLING_FIELDS.map((t) => (
              <FormSelect
                key={t.key}
                label={t.label}
                value={form[t.key]}
                onChange={(v) => set(t.key, v as YesNo)}
              >
                <option value="">—</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </FormSelect>
            ))}
          </div>
        </Section>

        <Section title="Description">
          <FormTextarea
            label=""
            value={form.introduction}
            onChange={(v) => set("introduction", v)}
            rows={3}
          />
        </Section>

        {error ? <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}
      </Modal>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 first:mt-0">
      <h3 className="mb-2 border-b border-slate-100 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h3>
      {children}
    </section>
  );
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M11.5 2.5l2 2L6 12l-2.5.5L4 10z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
