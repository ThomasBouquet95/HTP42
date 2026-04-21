import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth";
import { getClientById, updateClient } from "@/lib/airtable";

const schema = z.object({
  clientCode: z.string().trim().min(1).max(60),
  clientName: z.string().trim().min(1).max(200),
  industry: z.string().trim().max(120).optional().default(""),
  country: z.string().trim().max(120).optional().default(""),
  keyContact: z.string().trim().max(200).optional().default(""),
  notes: z.string().max(5000).optional().default(""),
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await getClientById(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  await updateClient(id, parsed.data);
  return NextResponse.json({ ok: true });
}
