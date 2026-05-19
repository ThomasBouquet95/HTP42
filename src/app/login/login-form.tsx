"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";

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
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-slate-200 p-8">
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
          <a
            href="/api/auth/signin"
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-brand-600 hover:bg-brand-700 text-white py-2.5 text-sm font-medium"
          >
            <MicrosoftLogo />
            Sign in with Microsoft
          </a>
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">
          Access is restricted to active network members.
        </p>
      </div>
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
