import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import {
  attachContractPdf,
  createContract,
  createProject,
  getOpportunityById,
  patchOpportunity,
  CURRENCIES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  type Currency,
  type ProjectStatus,
  type ProjectType,
} from "@/lib/airtable";
import { apiError } from "@/lib/errors";

export const runtime = "nodejs";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Convert an opportunity into a real project. Creates the project, optionally
// creates a linked Client-side SOW contract (Legal) from an uploaded PDF, then
// marks the opportunity Won and records the project code. Multipart so the SOW
// file can ride along.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminAction("opportunities", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const opp = await getOpportunityById(id);
  if (!opp) return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  const s = (k: string) => String(form.get(k) ?? "").trim();

  const projectCode = s("projectCode").toUpperCase();
  const projectName = s("projectName");
  const type = s("type");
  const currency = s("currency");
  const totalAmountStr = s("totalAmount");
  const startDate = s("startDate");
  const endDate = s("endDate");
  const status = s("status");
  const objective = s("objective");

  // Compulsory fields for a real project.
  if (!projectCode) return NextResponse.json({ error: "A project code is required." }, { status: 400 });
  if (!projectName) return NextResponse.json({ error: "A project name is required." }, { status: 400 });
  if (!(PROJECT_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: "Pick a project type." }, { status: 400 });
  }
  if (!(CURRENCIES as readonly string[]).includes(currency)) {
    return NextResponse.json({ error: "Pick a currency." }, { status: 400 });
  }
  const totalAmount = totalAmountStr === "" ? null : Number(totalAmountStr);
  if (totalAmount == null || !Number.isFinite(totalAmount) || totalAmount <= 0) {
    return NextResponse.json({ error: "A total amount is required." }, { status: 400 });
  }
  if (!startDate) return NextResponse.json({ error: "A start date is required." }, { status: 400 });
  if (!opp.clientRecordIds[0]) {
    return NextResponse.json(
      { error: "This opportunity has no client to link a project to." },
      { status: 400 },
    );
  }

  // Optional SOW PDF → becomes a linked Client-side contract in Legal.
  const file = form.get("sow");
  let sowBase64: string | null = null;
  let sowName = "";
  if (file instanceof File && file.size > 0) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "The SOW must be a PDF." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "The SOW is too large (max 5 MB)." }, { status: 400 });
    }
    sowBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    sowName = file.name || `SOW-${projectCode}.pdf`;
  }

  // 1) Create the project.
  let projectId: string;
  try {
    projectId = await createProject({
      projectCode,
      projectName,
      clientRecordIds: opp.clientRecordIds,
      projectLeaderRecordIds: [],
      type: type as ProjectType,
      objective,
      startDate: startDate || null,
      endDate: endDate || null,
      currency: currency as Currency,
      totalAmount,
      fxToEur: null,
      status: ((PROJECT_STATUSES as readonly string[]).includes(status)
        ? status
        : "") as ProjectStatus | "",
      paymentSchedule: [],
    });
  } catch (e) {
    return apiError(e, "convert the opportunity to a project");
  }

  // 2) Optional SOW contract linked to the client + project (best-effort).
  let sowWarning: string | null = null;
  if (sowBase64) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const contract = await createContract({
        side: "Client",
        contractType: "SOW",
        clientRecordIds: opp.clientRecordIds,
        projectRecordIds: [projectId],
        projectCode,
        signatureDate: today,
      });
      await attachContractPdf(contract.id, sowName, sowBase64);
    } catch (e) {
      console.error("SOW contract creation failed during convert:", e);
      sowWarning = "The project was created, but the SOW upload failed. Add it in Legal.";
    }
  }

  // 3) Mark the opportunity Won + record the project code.
  try {
    await patchOpportunity(id, { status: "Won", convertedProject: projectCode });
  } catch (e) {
    console.error("Opportunity status update failed during convert:", e);
    return NextResponse.json({
      ok: true,
      projectCode,
      warning:
        sowWarning ??
        "The project was created, but the opportunity status couldn't be updated.",
    });
  }

  return NextResponse.json({ ok: true, projectCode, warning: sowWarning });
}
