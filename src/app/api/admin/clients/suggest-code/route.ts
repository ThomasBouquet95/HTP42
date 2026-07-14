import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { suggestClientCode } from "@/lib/airtable";

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const name = (url.searchParams.get("name") ?? "").trim();
  if (!name) return NextResponse.json({ code: "" });
  const code = await suggestClientCode(name);
  return NextResponse.json({ code });
}
