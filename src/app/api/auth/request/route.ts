import { NextResponse } from "next/server";
import { z } from "zod";
import { findActiveMemberByEmail } from "@/lib/airtable";
import { createMagicToken } from "@/lib/auth";
import { sendMagicLinkEmail } from "@/lib/email";
import { env } from "@/lib/env";

const schema = z.object({ email: z.string().email() });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email." }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();

  const member = await findActiveMemberByEmail(email);
  if (!member) {
    return NextResponse.json(
      { error: "This email is not registered as a network member. Please contact your administrator." },
      { status: 403 },
    );
  }

  const token = await createMagicToken(email);
  const url = `${env.appUrl}/api/auth/callback?token=${encodeURIComponent(token)}`;
  await sendMagicLinkEmail(email, url);

  return NextResponse.json({ ok: true });
}
