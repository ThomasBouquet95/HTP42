"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { ButtonLink } from "@/components/form-controls";

const errorMessages: Record<string, string> = {
  missing_token: "Sign-in was incomplete. Please try again.",
  invalid_or_expired: "That sign-in attempt is invalid or has expired. Please try again.",
  not_active:
    "This email is not registered as a network member. Please contact your administrator.",
};

export default function LoginForm() {
  const params = useSearchParams();
  const errorCode = params.get("error");
  const error = errorCode ? errorMessages[errorCode] ?? "Something went wrong. Please try again." : null;

  return (
    <main className="relative min-h-[100dvh] flex flex-col items-center justify-center px-6 py-12">
      {/* Fixed, full-bleed layered background. `fixed inset-0` covers the whole
          viewport regardless of iOS toolbar / dynamic-viewport shifts, so there
          is never a white gap above or below the content. */}
      <div aria-hidden className="fixed inset-0 -z-10 bg-[#081d38]" />
      <div
        aria-hidden
        className="fixed inset-0 -z-10 bg-gradient-to-br from-[#0a2547] via-[#0d3a68] to-[#061a30]"
      />
      <div
        aria-hidden
        className="fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(55% 45% at 50% 22%, rgba(30,145,249,0.40) 0%, rgba(30,145,249,0) 70%), radial-gradient(45% 40% at 85% 90%, rgba(56,189,248,0.22) 0%, rgba(56,189,248,0) 70%)",
        }}
      />

      <div className="relative w-full max-w-md">
        {/* Inspiring eyebrow above the card. */}
        <div className="mb-6 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-200/90">
            Network Portal
          </p>
          <h1 className="mt-2 text-2xl font-bold leading-snug text-white sm:text-3xl">
            Welcome back
          </h1>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-white/10">
          {/* Thin brand gradient accent along the top of the card. */}
          <div className="h-1.5 w-full bg-gradient-to-r from-brand-500 via-sky-400 to-brand-600" />
          <div className="p-8">
            <div className="flex flex-col items-center text-center">
              <Image
                src="/htp42-logo-full.png"
                alt="HealthTech Partners 42"
                width={1418}
                height={932}
                priority
                className="h-auto w-52"
              />
            </div>
            <p className="mt-6 text-center text-sm text-slate-600">
              Sign in with your HTP42 Microsoft account.
            </p>

            {error ? (
              <div className="mt-4 rounded-md bg-red-50 text-red-700 p-3 text-sm">{error}</div>
            ) : null}

            <div className="mt-6">
              <ButtonLink href="/api/auth/signin" tone="primary" className="w-full">
                <MicrosoftLogo />
                Sign in with Microsoft
              </ButtonLink>
            </div>
            <p className="mt-6 text-center text-xs text-slate-500">
              Access is restricted to active network members.
            </p>
          </div>
        </div>
      </div>

      <p className="relative mt-10 text-center text-xs text-white/45">
        HealthTech Partners 42
      </p>
    </main>
  );
}

function MicrosoftLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}
