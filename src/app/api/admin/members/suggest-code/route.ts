import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { suggestMemberCode } from "@/lib/airtable";

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const fullName = (url.searchParams.get("fullName") ?? "").trim();
  if (!fullName) return NextResponse.json({ code: "" });
  const code = await suggestMemberCode(fullName);
  return NextResponse.json({ code });
}
