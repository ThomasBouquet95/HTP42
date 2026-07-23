import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import { apiError } from "@/lib/errors";
import { attachProjectPurchaseOrder, getProjectById } from "@/lib/airtable";
import { hasPdfSignature } from "@/lib/file-signatures";

export const runtime = "nodejs";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Attach/replace the Purchase Order document for a project. Files it in Legal
// as a Client-side "Purchase Order" contract linked to the project + client
// and returns the PDF ref. Mirrors the SOW attach route.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminAction("projects", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const project = await getProjectById(id);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file." }, { status: 400 });
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "The purchase order must be a PDF." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "The purchase order is too large (max 5 MB)." }, { status: 400 });
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    if (!hasPdfSignature(buf)) {
      return NextResponse.json({ error: "The purchase order must be a valid PDF." }, { status: 400 });
    }
    const base64 = buf.toString("base64");
    const pdf = await attachProjectPurchaseOrder(
      id,
      file.name || `PO-${project.projectCode}.pdf`,
      base64,
    );
    return NextResponse.json({ pdf });
  } catch (e) {
    return apiError(e, "attach the purchase order");
  }
}
