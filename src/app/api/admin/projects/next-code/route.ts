import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { nextProjectCode } from "@/lib/airtable";

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const clientCode = (url.searchParams.get("clientCode") ?? "").trim().toUpperCase();
  const yearRaw = url.searchParams.get("year") ?? "";
  const year = Number.parseInt(yearRaw, 10);
  if (!/^[A-Z]{3}$/.test(clientCode)) {
    return NextResponse.json({ error: "Invalid clientCode" }, { status: 400 });
  }
  if (!Number.isFinite(year) || year < 2000 || year > 9999) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }
  const code = await nextProjectCode(clientCode, year);
  return NextResponse.json({ code });
}
