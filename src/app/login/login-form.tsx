"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";

const errorMessages: Record<string, string> = {
  missing_token: "Sign-in link was missing a token. Please request a new one.",
  invalid_or_expired: "That sign-in link is invalid or has expired. Please request a new one.",
  not_active:
    "Your account is no longer an active network member. Please contact your administrator.",
};

export default function LoginForm() {
  const params = useSearchParams();
  const initialError = params.get("error");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(
    initialError ? errorMessages[initialError] ?? "Something went wrong. Please try again." : null,
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setSent(true);
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Unable to send the sign-in link. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-2xl font-semibold">HTP42 Timesheets</h1>
        <p className="mt-1 text-sm text-slate-600">Sign in with your network-member email.</p>

        {sent ? (
          <div className="mt-6 rounded-lg bg-brand-50 text-brand-700 p-4 text-sm">
            Check your inbox — we just sent a sign-in link to <strong>{email}</strong>. The link
            expires in 15 minutes.
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-600"
                placeholder="you@company.com"
              />
            </label>
            {error ? (
              <div className="rounded-md bg-red-50 text-red-700 p-3 text-sm">{error}</div>
            ) : null}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-brand-600 hover:bg-brand-700 text-white py-2 font-medium disabled:opacity-60"
            >
              {submitting ? "Sending…" : "Send sign-in link"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
