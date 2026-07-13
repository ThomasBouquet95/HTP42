import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import { apiError } from "@/lib/errors";
import { attachProjectSow, getProjectById } from "@/lib/airtable";

export const runtime = "nodejs";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Attach/replace the SOW for a project. Creates or updates the project's
// linked Client-side SOW contract in Legal and returns the PDF ref.
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
    return NextResponse.json({ error: "The SOW must be a PDF." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "The SOW is too large (max 5 MB)." }, { status: 400 });
  }

  try {
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const pdf = await attachProjectSow(id, file.name || `SOW-${project.projectCode}.pdf`, base64);
    return NextResponse.json({ pdf });
  } catch (e) {
    return apiError(e, "attach the SOW");
  }
}
