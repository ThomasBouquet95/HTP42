import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { findMemberByCode } from "@/lib/airtable";

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const code = (url.searchParams.get("code") ?? "").trim();
  const excludeId = url.searchParams.get("excludeId") ?? undefined;
  if (!code) return NextResponse.json({ valid: false, available: false });
  if (code.length > 40) return NextResponse.json({ valid: false, available: false, error: "Too long." });
  const clash = await findMemberByCode(code, excludeId);
  return NextResponse.json({ valid: true, available: !clash });
}
