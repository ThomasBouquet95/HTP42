import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAction } from "@/lib/auth";
import { apiError, zodMessage } from "@/lib/errors";
import { getReconRow, updateReconRow, type ReconRowPatch } from "@/lib/reconciliation-store";

export const runtime = "nodejs";

const schema = z.object({
  commentaire: z.string().max(5000).optional(),
  resolution: z
    .enum(["", "receipt_lost", "personal", "already_deposited", "other"])
    .optional(),
  // Set a confirmed match, or null to clear it back to "not found".
  match: z
    .union([
      z.object({
        kind: z.enum(["member", "vendor"]),
        id: z.string().min(1).max(64),
        label: z.string().max(300).default(""),
      }),
      z.null(),
    ])
    .optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminAction("reconciliation", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }
  const d = parsed.data;

  const existing = await getReconRow(id);
  if (!existing) return NextResponse.json({ error: "Row not found." }, { status: 404 });

  const patch: ReconRowPatch = {};
  if (d.commentaire !== undefined) patch.commentaire = d.commentaire;
  if (d.resolution !== undefined) patch.resolution = d.resolution;
  if (d.match !== undefined) {
    if (d.match === null) {
      patch.matchStatus = "not_found";
      patch.matchedKind = "";
      patch.matchedInvoiceId = "";
      patch.matchedLabel = "";
    } else {
      patch.matchStatus = "found";
      patch.matchedKind = d.match.kind;
      patch.matchedInvoiceId = d.match.id;
      patch.matchedLabel = d.match.label;
    }
  }

  try {
    await updateReconRow(id, patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e, "update the reconciliation row");
  }
}
