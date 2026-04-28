"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { MemberRecord } from "@/lib/airtable";
import { PhotoCropModal } from "@/components/photo-crop-modal";

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
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; message: string } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNotice(null);
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fullName, introduction, country, phone, legalEntity }),
      });
      if (res.ok) {
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
          <ReadOnly label="Email" value={member.email} />
          <ReadOnly label="Role" value={member.role || "—"} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" value={fullName} onChange={setFullName} required />
          <Field label="Country" value={country} onChange={setCountry} />
          <Field label="Phone" value={phone} onChange={setPhone} type="tel" />
          <Field label="Legal entity" value={legalEntity} onChange={setLegalEntity} />
        </div>
        <TextArea label="Introduction" value={introduction} onChange={setIntroduction} />

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
    </div>
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
          <p className="text-[11px] text-slate-500">Adjust crop & zoom · saved as JPEG ≤ 1 MB</p>
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
          <p className="text-[11px] text-slate-500">PDF or Word · max 1 MB</p>
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      <input
        type={type ?? "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
      />
    </label>
  );
}
