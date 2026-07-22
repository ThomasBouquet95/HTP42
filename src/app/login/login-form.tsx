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
    <main className="relative min-h-[100dvh] flex items-center justify-center p-6 bg-gradient-to-br from-[#0a2547] via-[#0d3a68] to-[#08447e]">
      {/* Soft brand glow behind the card for depth on the dark backdrop. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 30%, rgba(30,145,249,0.35) 0%, rgba(30,145,249,0) 70%)",
        }}
      />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl ring-1 ring-white/10">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/htp42-logo-full.png"
            alt="HealthTech Partners 42"
            width={1418}
            height={932}
            priority
            className="h-auto w-56"
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
      <p className="absolute bottom-5 left-0 right-0 text-center text-xs text-white/50">
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
