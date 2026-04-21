import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { updateMemberProfile } from "@/lib/airtable";

const schema = z.object({
  fullName: z.string().trim().min(1, "Full name is required.").max(200),
  introduction: z.string().max(5000).default(""),
  country: z.string().max(120).default(""),
  phone: z.string().max(60).default(""),
  legalEntity: z.string().max(200).default(""),
});

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const updated = await updateMemberProfile(session.sub, parsed.data);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ member: updated });
}
