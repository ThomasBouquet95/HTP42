import { NextResponse } from "next/server";
import { clearMagicSession, readMagicSession } from "@/lib/airtable";
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

  // Single-use + latest-link-wins: reject if the stored jti does not match
  // this token's jti. Any older outstanding link (issued before a newer one)
  // will be orphaned, and replaying a used link after the session has been
  // cleared will also fall into this branch.
  const stored = await readMagicSession(member.id);
  if (!stored || stored.jti !== payload.jti) {
    return redirectWithError("invalid_or_expired");
  }

  await clearMagicSession(member.id);
  await startSession(member);
  return NextResponse.redirect(`${env.appUrl}/dashboard`);
}

function redirectWithError(code: string): Response {
  return NextResponse.redirect(`${env.appUrl}/login?error=${encodeURIComponent(code)}`);
}
