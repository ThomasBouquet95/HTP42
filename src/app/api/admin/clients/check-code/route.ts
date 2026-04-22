import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { findClientByCode } from "@/lib/airtable";

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const code = (url.searchParams.get("code") ?? "").trim().toUpperCase();
  const excludeId = url.searchParams.get("excludeId") ?? undefined;
  if (!/^[A-Z]{3}$/.test(code)) {
    return NextResponse.json({ valid: false, available: false, error: "Client code must be exactly 3 uppercase letters." });
  }
  const clash = await findClientByCode(code, excludeId);
  return NextResponse.json({ valid: true, available: !clash });
}
