import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMemberById } from "@/lib/airtable";

// Public-ish member directory entry. Available to any signed-in member so
// they can click a teammate's avatar and see who they are. No internal
// finance fields (rate per day) are exposed here — that view stays admin-only.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { id } = await params;
  const m = await getMemberById(id);
  if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    member: {
      id: m.id,
      memberCode: m.memberCode,
      fullName: m.fullName,
      email: m.email,
      title: m.title,
      role: m.role,
      status: m.status,
      country: m.country,
      phone: m.phone,
      legalEntity: m.legalEntity,
      introduction: m.introduction,
      photoUrl: m.photo?.url ?? null,
      cv: m.cv ? { url: m.cv.url, filename: m.cv.filename } : null,
    },
  });
}
