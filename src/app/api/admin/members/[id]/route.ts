import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAction } from "@/lib/auth";
import { apiError, zodMessage } from "@/lib/errors";
import {
  adminDeleteMember,
  adminUpdateMember,
  adminUpdateMemberStatus,
  findMemberByCode,
  findMemberByEmail,
  MEMBER_ROLES,
  MEMBER_STATUSES,
  CURRENCIES,
  type Currency,
  type MemberRole,
  type MemberStatus,
} from "@/lib/airtable";

const patchSchema = z.object({
  status: z.enum(MEMBER_STATUSES as [string, ...string[]]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminAction("members", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }
  try {
    await adminUpdateMemberStatus(id, parsed.data.status as MemberStatus);
  } catch (e) {
    return apiError(e, "update the member's status");
  }
  return NextResponse.json({ ok: true });
}

const nullableNumber = z.union([z.number(), z.null()]).optional();
// Yes/No provisioning flag ("" clears it).
const yesNo = z.union([z.enum(["Yes", "No"]), z.literal("")]).optional();

const schema = z.object({
  memberCode: z.string().trim().min(1).max(40).optional(),
  fullName: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().email().max(200).optional(),
  personalEmail: z
    .union([z.string().trim().email().max(200), z.literal("")])
    .optional(),
  introduction: z.string().max(5000).optional(),
  country: z.string().max(120).optional(),
  phone: z.string().max(60).optional(),
  legalEntity: z.string().max(200).optional(),
  billingCompanyName: z.string().max(200).optional(),
  billingCompanyCountry: z.string().max(120).optional(),
  billingCompanyAddress: z.string().max(2000).optional(),
  title: z.string().max(200).optional(),
  role: z.enum(MEMBER_ROLES as [string, ...string[]]).optional(),
  status: z.enum(MEMBER_STATUSES as [string, ...string[]]).optional(),
  dailyRate: nullableNumber,
  htp42DailyRate: nullableNumber,
  currency: z.union([z.enum(CURRENCIES as [string, ...string[]]), z.literal("")]).optional(),
  // Tooling / access provisioning (admin-only Yes/No flags).
  htp42Email: yesNo,
  officeLicense: yesNo,
  notionLicense: yesNo,
  claudeLicense: yesNo,
  // Admin/HR-only note — never surfaced to the member.
  internalNote: z.string().max(5000).optional(),
  // Admin/HR-only rich notes (bold/italic/underline), sanitised server-side.
  internalNotes: z
    .array(
      z.object({
        id: z.string().max(64),
        html: z.string().max(10000),
        at: z.string().max(40).nullable().optional(),
      }),
    )
    .max(200)
    .optional(),
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminAction("members", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }

  const d = parsed.data;

  try {
    if (d.email !== undefined) {
      const clash = await findMemberByEmail(d.email, id);
      if (clash) {
        return NextResponse.json(
          { error: `Email ${d.email} is already used by ${clash.fullName || "another member"}.` },
          { status: 409 },
        );
      }
    }

    if (d.memberCode !== undefined) {
      const clash = await findMemberByCode(d.memberCode, id);
      if (clash) {
        return NextResponse.json(
          { error: `Member code ${d.memberCode} is already used by ${clash.fullName || "another member"}.` },
          { status: 409 },
        );
      }
    }

    const updated = await adminUpdateMember(id, {
      memberCode: d.memberCode,
      fullName: d.fullName,
      email: d.email,
      personalEmail: d.personalEmail,
      introduction: d.introduction,
      country: d.country,
      phone: d.phone,
      legalEntity: d.legalEntity,
      billingCompanyName: d.billingCompanyName,
      billingCompanyCountry: d.billingCompanyCountry,
      billingCompanyAddress: d.billingCompanyAddress,
      title: d.title,
      role: d.role as MemberRole | undefined,
      status: d.status as MemberStatus | undefined,
      dailyRate: d.dailyRate,
      htp42DailyRate: d.htp42DailyRate,
      currency: d.currency as Currency | "" | undefined,
      htp42Email: d.htp42Email,
      officeLicense: d.officeLicense,
      notionLicense: d.notionLicense,
      claudeLicense: d.claudeLicense,
      internalNote: d.internalNote,
      internalNotes: d.internalNotes?.map((n) => ({
        id: n.id,
        html: n.html,
        at: n.at ?? null,
      })),
    });
    if (!updated) {
      return NextResponse.json(
        { error: "That member no longer exists. It may have been deleted; refresh and try again." },
        { status: 404 },
      );
    }
    return NextResponse.json({ member: updated });
  } catch (e) {
    return apiError(e, "save the member");
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminAction("members", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (id === session.sub) {
    return NextResponse.json(
      { error: "You cannot delete your own member record." },
      { status: 400 },
    );
  }
  try {
    await adminDeleteMember(id);
  } catch (e) {
    return apiError(e, "delete the member");
  }
  return NextResponse.json({ ok: true });
}
