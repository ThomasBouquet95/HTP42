import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import { apiError } from "@/lib/errors";
import { deleteAllReconRows } from "@/lib/reconciliation-store";

export const runtime = "nodejs";
export const maxDuration = 120;

// Clear every stored reconciliation row so the admin can re-upload a fresh file.
// Destructive — the client confirms first.
export async function POST() {
  const session = await requireAdminAction("reconciliation", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const deleted = await deleteAllReconRows();
    return NextResponse.json({ ok: true, deleted });
  } catch (e) {
    return apiError(e, "reset the reconciliation data");
  }
}
