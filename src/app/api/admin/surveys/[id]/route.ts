import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { deleteSurvey } from "@/lib/airtable";

export const runtime = "nodejs";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  try {
    await deleteSurvey(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Delete failed." },
      { status: 500 },
    );
  }
}
