import { NextResponse } from "next/server";
import { revalidateMember, startSession, verifyMagicToken } from "@/lib/auth";
import { env } from "@/lib/env";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) return redirectWithError("missing_token");

  const payload = await verifyMagicToken(token);
  if (!payload) return redirectWithError("invalid_or_expired");

  const member = await revalidateMember(payload.email);
  if (!member) return redirectWithError("not_active");

  await startSession(member);
  return NextResponse.redirect(`${env.appUrl}/dashboard`);
}

function redirectWithError(code: string): Response {
  return NextResponse.redirect(`${env.appUrl}/login?error=${encodeURIComponent(code)}`);
}
