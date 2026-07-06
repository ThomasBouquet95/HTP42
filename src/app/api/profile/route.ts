import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { updateMemberProfile } from "@/lib/airtable";
import { apiError, zodMessage } from "@/lib/errors";

// All profile fields are optional in the payload. The two flows that hit this
// endpoint (the main profile form, the bank-account modal) only send what
// they touch, so we don't want to require fields they don't own.
const schema = z.object({
  fullName: z.string().trim().min(1, "Full name is required.").max(200).optional(),
  introduction: z.string().max(5000).optional(),
  country: z.string().max(120).optional(),
  phone: z.string().max(60).optional(),
  legalEntity: z.string().max(200).optional(),
  personalEmail: z
    .union([z.string().trim().email("Enter a valid email."), z.literal("")])
    .optional(),
  bankAccountName: z.string().max(200).optional(),
  bankAccountAddress: z.string().max(2000).optional(),
  iban: z
    .string()
    .trim()
    .max(64)
    .regex(/^$|^[A-Z0-9 ]{6,64}$/i, "IBAN can only contain letters, digits, and spaces.")
    .optional(),
});

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }

  // IBANs are conventionally stored uppercase + without spaces. Normalise on
  // write so admins see a consistent format.
  const input = { ...parsed.data };
  if (input.iban !== undefined) input.iban = input.iban.replace(/\s+/g, "").toUpperCase();

  try {
    const updated = await updateMemberProfile(session.sub, input);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ member: updated });
  } catch (e) {
    return apiError(e, "update your profile");
  }
}
