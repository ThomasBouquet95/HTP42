import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAction } from "@/lib/auth";
import { apiError, zodMessage } from "@/lib/errors";
import { createClient, findClientByCode } from "@/lib/airtable";

const CODE = /^[A-Z]{3}$/;

const schema = z.object({
  clientCode: z
    .string()
    .trim()
    .regex(CODE, "Client code must be exactly 3 uppercase letters."),
  clientName: z.string().trim().min(1).max(200),
  kind: z.union([z.enum(["Client", "Partner"]), z.literal("")]).optional().default(""),
  industry: z.string().trim().max(120).optional().default(""),
  country: z.string().trim().max(120).optional().default(""),
  keyContact: z.string().trim().max(200).optional().default(""),
  notes: z.string().max(5000).optional().default(""),
  subjectToDes: z.union([z.enum(["Yes", "No"]), z.literal("")]).optional().default(""),
});

export async function POST(request: Request) {
  const session = await requireAdminAction("clients", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }

  try {
    const clash = await findClientByCode(parsed.data.clientCode);
    if (clash) {
      return NextResponse.json(
        { error: `Client code ${parsed.data.clientCode} is already in use.` },
        { status: 409 },
      );
    }

    const id = await createClient(parsed.data);
    return NextResponse.json({ id });
  } catch (e) {
    return apiError(e, "save the client");
  }
}
