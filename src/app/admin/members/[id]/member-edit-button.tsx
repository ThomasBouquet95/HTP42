"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Button, FormField, FormSelect, FormTextarea } from "@/components/form-controls";
import type { Currency, MemberRole, MemberStatus } from "@/lib/airtable";

type Editable = {
  id: string;
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
  internalNote: string;
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
    internalNote: member.internalNote,
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
          internalNote: form.internalNote,
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
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Full name" value={form.fullName} onChange={(v) => set("fullName", v)} required />
          <FormField label="Login email" value={form.email} onChange={(v) => set("email", v)} />
          <FormField label="Personal email" value={form.personalEmail} onChange={(v) => set("personalEmail", v)} />
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
          <FormField label="Country" value={form.country} onChange={(v) => set("country", v)} />
          <FormField label="Phone" value={form.phone} onChange={(v) => set("phone", v)} />
          <FormField label="Legal entity" value={form.legalEntity} onChange={(v) => set("legalEntity", v)} />
          <FormField label="Member rate" type="number" value={form.dailyRate} onChange={(v) => set("dailyRate", v)} />
          <FormField label="HTP42 rate" type="number" value={form.htp42DailyRate} onChange={(v) => set("htp42DailyRate", v)} />
          <FormSelect label="Currency" value={form.currency} onChange={(v) => set("currency", v as Currency | "")}>
            <option value="">—</option>
            {currencies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </FormSelect>
        </div>

        <div className="mt-3">
          <FormTextarea
            label="Introduction"
            value={form.introduction}
            onChange={(v) => set("introduction", v)}
            rows={3}
          />
        </div>

        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/40 p-3">
          <FormTextarea
            label="Internal note (admin only — never shown to the member)"
            value={form.internalNote}
            onChange={(v) => set("internalNote", v)}
            rows={5}
          />
        </div>

        {error ? <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}
      </Modal>
    </>
  );
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M11.5 2.5l2 2L6 12l-2.5.5L4 10z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
