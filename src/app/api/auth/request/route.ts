import { NextResponse } from "next/server";
import { z } from "zod";
import {
  findActiveMemberByEmail,
  readMagicSession,
  writeMagicSession,
} from "@/lib/airtable";
import { createMagicToken } from "@/lib/auth";
import { sendMagicLinkEmail } from "@/lib/email";
import { env } from "@/lib/env";

const schema = z.object({ email: z.string().email() });

// Cool-off between magic-link emails for a given member, in milliseconds.
const REQUEST_COOL_OFF_MS = 30_000;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email." }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();

  // Always return 200 regardless of whether the email is registered so an
  // attacker cannot enumerate member emails through this endpoint. The
  // callback route is the one that tells the user "not_active" if they try a
  // link whose email isn't an active member.
  const member = await findActiveMemberByEmail(email);
  if (!member) return NextResponse.json({ ok: true });

  // Per-member rate limit using the Airtable Session field as the shared
  // timestamp. Also serves as the single-use JTI store (see callback).
  const existing = await readMagicSession(member.id);
  const now = Date.now();
  if (existing && now - existing.lastRequestMs < REQUEST_COOL_OFF_MS) {
    return NextResponse.json({ ok: true });
  }

  const { token, jti } = await createMagicToken(email);
  await writeMagicSession(member.id, { jti, lastRequestMs: now });

  const url = `${env.appUrl}/api/auth/callback?token=${encodeURIComponent(token)}`;
  await sendMagicLinkEmail(email, url);

  return NextResponse.json({ ok: true });
}
