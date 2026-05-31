"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { MemberRecord } from "@/lib/airtable";
import { PhotoCropModal } from "@/components/photo-crop-modal";
import { Modal } from "@/components/modal";

type Props = { initial: MemberRecord };

const MAX_BYTES = 1 * 1024 * 1024;

export function ProfileForm({ initial }: Props) {
  const router = useRouter();
  const [member, setMember] = useState<MemberRecord>(initial);
  const [fullName, setFullName] = useState(initial.fullName);
  const [introduction, setIntroduction] = useState(initial.introduction);
  const [country, setCountry] = useState(initial.country);
  const [phone, setPhone] = useState(initial.phone);
  const [legalEntity, setLegalEntity] = useState(initial.legalEntity);
  const [personalEmail, setPersonalEmail] = useState(initial.personalEmail);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; message: string } | null>(null);
  const [bankOpen, setBankOpen] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNotice(null);
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName,
          introduction,
          country,
          phone,
          legalEntity,
          personalEmail,
        }),
      });
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { member?: MemberRecord };
        if (data.member) setMember(data.member);
        setNotice({ kind: "ok", message: "Profile saved." });
        router.refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setNotice({ kind: "err", message: data.error ?? "Unable to save." });
      }
    } catch {
      setNotice({ kind: "err", message: "Network error. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-slate-200 p-4 sm:p-5">
        <UploadSection
          member={member}
          onMember={setMember}
          onNotice={setNotice}
        />
      </div>

      <form onSubmit={onSubmit} className="space-y-4 bg-white rounded-lg border border-slate-200 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <ReadOnly label="Member code" value={member.memberCode} mono />
          <ReadOnly label="Login email" value={member.email} />
          <ReadOnly label="Role" value={member.role || "—"} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" value={fullName} onChange={setFullName} required />
          <Field
            label="Personal email"
            value={personalEmail}
            onChange={setPersonalEmail}
            type="email"
            help="Optional. Used for communication. You still sign in with your login email above."
          />
          <Field label="Country" value={country} onChange={setCountry} />
          <Field label="Phone" value={phone} onChange={setPhone} type="tel" />
          <Field label="Legal entity" value={legalEntity} onChange={setLegalEntity} />
        </div>
        <TextArea label="Introduction" value={introduction} onChange={setIntroduction} />

        <BankAccountCard member={member} onEdit={() => setBankOpen(true)} />

        {notice ? (
          <div
            className={`rounded-md p-2.5 text-xs ${
              notice.kind === "ok"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {notice.message}
          </div>
        ) : null}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-brand-600 hover:bg-brand-700 text-white px-3.5 py-1.5 text-xs font-medium disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>

      <BankAccountModal
        open={bankOpen}
        member={member}
        onClose={() => setBankOpen(false)}
        onSaved={(m) => {
          setMember(m);
          setBankOpen(false);
          setNotice({ kind: "ok", message: "Bank details saved." });
          router.refresh();
        }}
      />
    </div>
  );
}

// Card on the profile page that shows the current bank account snapshot
// (masked IBAN) and an "Edit" button that opens the modal. Lives outside the
// main form so the user doesn't have to re-submit the whole profile to update
// banking info.
function BankAccountCard({
  member,
  onEdit,
}: {
  member: MemberRecord;
  onEdit: () => void;
}) {
  const hasAny =
    member.bankAccountName || member.bankAccountAddress || member.iban;
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">
            Bank account
          </div>
          <div className="mt-0.5 text-xs text-slate-700">
            {hasAny ? (
              <>
                <span className="font-medium">
                  {member.bankAccountName || "(no name)"}
                </span>
                {member.iban ? (
                  <span className="ml-2 font-mono text-slate-500">
                    {maskIban(member.iban)}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-slate-400">
                Not set yet. Add it so finance can pay you.
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-100"
        >
          {hasAny ? "Edit" : "Add"}
        </button>
      </div>
    </div>
  );
}

// Shows only the country (first 4 chars) and last 4 of the IBAN to avoid
// leaking the full string on screen when not strictly necessary.
function maskIban(iban: string): string {
  const clean = iban.replace(/\s+/g, "").toUpperCase();
  if (clean.length <= 8) return clean;
  return `${clean.slice(0, 4)} · · · ${clean.slice(-4)}`;
}

function BankAccountModal({
  open,
  member,
  onClose,
  onSaved,
}: {
  open: boolean;
  member: MemberRecord;
  onClose: () => void;
  onSaved: (m: MemberRecord) => void;
}) {
  const [name, setName] = useState(member.bankAccountName);
  const [address, setAddress] = useState(member.bankAccountAddress);
  const [iban, setIban] = useState(member.iban);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset the form whenever the modal opens, so abandoned edits don't bleed
  // into the next time it's opened.
  useEffect(() => {
    if (!open) return;
    setName(member.bankAccountName);
    setAddress(member.bankAccountAddress);
    setIban(member.iban);
    setErr(null);
  }, [open, member.bankAccountName, member.bankAccountAddress, member.iban]);

  async function save() {
    setErr(null);
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bankAccountName: name,
          bankAccountAddress: address,
          iban,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        member?: MemberRecord;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Save failed.");
      if (data.member) onSaved(data.member);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Bank account"
      size="md"
      busy={saving}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-md bg-brand-600 hover:bg-brand-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-slate-500">
          Used by HTP42 finance to pay you. Visible to admins only, never shared
          outside the team.
        </p>
        <Field
          label="Name or legal entity on the account"
          value={name}
          onChange={setName}
          placeholder="e.g. Thomas Bouquet, or HTP42 SAS"
        />
        <TextArea
          label="Billing address"
          value={address}
          onChange={setAddress}
          rows={3}
        />
        <Field
          label="IBAN"
          value={iban}
          onChange={(v) => setIban(v.replace(/[^A-Za-z0-9 ]/g, ""))}
          placeholder="FR76 3000 …"
          mono
        />
        {err ? (
          <div className="rounded-md bg-red-50 p-2 text-xs text-red-700">{err}</div>
        ) : null}
      </div>
    </Modal>
  );
}

function UploadSection({
  member,
  onMember,
  onNotice,
}: {
  member: MemberRecord;
  onMember: (m: MemberRecord) => void;
  onNotice: (n: { kind: "ok" | "err"; message: string }) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <PhotoUpload member={member} onMember={onMember} onNotice={onNotice} />
      <CvUpload member={member} onMember={onMember} onNotice={onNotice} />
    </div>
  );
}

function PhotoUpload({
  member,
  onMember,
  onNotice,
}: {
  member: MemberRecord;
  onMember: (m: MemberRecord) => void;
  onNotice: (n: { kind: "ok" | "err"; message: string }) => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pickedFile, setPickedFile] = useState<File | null>(null);

  async function uploadFile(f: File) {
    if (f.size > MAX_BYTES) {
      onNotice({ kind: "err", message: "Photo must be 1 MB or smaller after compression." });
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/profile/photo", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { member?: MemberRecord; error?: string };
      if (res.ok && data.member) {
        onMember(data.member);
        onNotice({ kind: "ok", message: "Photo updated." });
        router.refresh();
      } else {
        onNotice({ kind: "err", message: data.error ?? "Upload failed." });
      }
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removePhoto() {
    setBusy(true);
    try {
      const res = await fetch("/api/profile/photo", { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { member?: MemberRecord; error?: string };
      if (res.ok && data.member) {
        onMember(data.member);
        onNotice({ kind: "ok", message: "Photo removed." });
        router.refresh();
      } else {
        onNotice({ kind: "err", message: data.error ?? "Remove failed." });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">Photo</div>
      <div className="flex items-center gap-3">
        <div className="h-16 w-16 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200">
          {member.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={member.photo.url} alt="Profile" className="h-full w-full object-cover" />
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          )}
        </div>
        <div className="space-y-1.5 text-xs">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="rounded-md border border-slate-300 bg-white hover:bg-slate-50 px-2.5 py-1 font-medium disabled:opacity-60"
            >
              {member.photo ? "Replace" : "Upload"}
            </button>
            {member.photo ? (
              <button
                type="button"
                onClick={removePhoto}
                disabled={busy}
                className="rounded-md border border-red-200 text-red-700 bg-white hover:bg-red-50 px-2.5 py-1 font-medium disabled:opacity-60"
              >
                Remove
              </button>
            ) : null}
          </div>
          <p className="text-[11px] text-slate-500">Below 1 MB</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setPickedFile(f);
            // Reset so picking the same file again still triggers onChange.
            if (fileRef.current) fileRef.current.value = "";
          }}
        />
      </div>
      <PhotoCropModal
        open={!!pickedFile}
        file={pickedFile}
        onClose={() => setPickedFile(null)}
        onCropped={(f) => {
          setPickedFile(null);
          uploadFile(f);
        }}
      />
    </div>
  );
}

function CvUpload({
  member,
  onMember,
  onNotice,
}: {
  member: MemberRecord;
  onMember: (m: MemberRecord) => void;
  onNotice: (n: { kind: "ok" | "err"; message: string }) => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function uploadFile(f: File) {
    if (f.size > MAX_BYTES) {
      onNotice({ kind: "err", message: "CV must be 1 MB or smaller." });
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/profile/cv", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { member?: MemberRecord; error?: string };
      if (res.ok && data.member) {
        onMember(data.member);
        onNotice({ kind: "ok", message: "CV updated." });
        router.refresh();
      } else {
        onNotice({ kind: "err", message: data.error ?? "Upload failed." });
      }
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeCv() {
    setBusy(true);
    try {
      const res = await fetch("/api/profile/cv", { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { member?: MemberRecord; error?: string };
      if (res.ok && data.member) {
        onMember(data.member);
        onNotice({ kind: "ok", message: "CV removed." });
        router.refresh();
      } else {
        onNotice({ kind: "err", message: data.error ?? "Remove failed." });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">CV</div>
      <div className="flex items-center gap-3">
        <div className="h-16 w-16 rounded-md bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M14 3v5h5M9 13h6M9 17h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </div>
        <div className="space-y-1.5 text-xs min-w-0 flex-1">
          {member.cv ? (
            <a
              href={member.cv.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-brand-600 hover:text-brand-700 font-medium truncate"
              title={member.cv.filename}
            >
              {member.cv.filename || "CV"}
            </a>
          ) : (
            <p className="text-slate-500">No CV uploaded yet.</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="rounded-md border border-slate-300 bg-white hover:bg-slate-50 px-2.5 py-1 font-medium disabled:opacity-60"
            >
              {member.cv ? "Replace" : "Upload"}
            </button>
            {member.cv ? (
              <button
                type="button"
                onClick={removeCv}
                disabled={busy}
                className="rounded-md border border-red-200 text-red-700 bg-white hover:bg-red-50 px-2.5 py-1 font-medium disabled:opacity-60"
              >
                Remove
              </button>
            ) : null}
          </div>
          <p className="text-[11px] text-slate-500">Below 1 MB</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadFile(f);
          }}
        />
      </div>
    </div>
  );
}

function ReadOnly({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs ${mono ? "font-mono" : ""}`}>
        {value || "—"}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  type,
  placeholder,
  help,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
  help?: string;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      <input
        type={type ?? "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className={`mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs ${
          mono ? "font-mono uppercase" : ""
        }`}
      />
      {help ? <p className="mt-1 text-[10px] text-slate-500">{help}</p> : null}
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows ?? 4}
        className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
      />
    </label>
  );
}
