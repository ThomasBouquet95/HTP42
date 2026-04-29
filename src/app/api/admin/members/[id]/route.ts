import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth";
import {
  adminDeleteMember,
  adminUpdateMember,
  findMemberByCode,
  findMemberByEmail,
  MEMBER_ROLES,
  MEMBER_STATUSES,
  CURRENCIES,
  type Currency,
  type MemberRole,
  type MemberStatus,
} from "@/lib/airtable";

const nullableNumber = z.union([z.number(), z.null()]).optional();

const schema = z.object({
  memberCode: z.string().trim().min(1).max(40).optional(),
  fullName: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().email().max(200).optional(),
  introduction: z.string().max(5000).optional(),
  country: z.string().max(120).optional(),
  phone: z.string().max(60).optional(),
  legalEntity: z.string().max(200).optional(),
  title: z.string().max(200).optional(),
  role: z.enum(MEMBER_ROLES as [string, ...string[]]).optional(),
  status: z.enum(MEMBER_STATUSES as [string, ...string[]]).optional(),
  dailyRate: nullableNumber,
  htp42DailyRate: nullableNumber,
  currency: z.union([z.enum(CURRENCIES as [string, ...string[]]), z.literal("")]).optional(),
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const d = parsed.data;

  if (d.email !== undefined) {
    const clash = await findMemberByEmail(d.email, id);
    if (clash) {
      return NextResponse.json(
        { error: `Email ${d.email} is already in use.` },
        { status: 409 },
      );
    }
  }

  if (d.memberCode !== undefined) {
    const clash = await findMemberByCode(d.memberCode, id);
    if (clash) {
      return NextResponse.json(
        { error: `Member code ${d.memberCode} is already in use.` },
        { status: 409 },
      );
    }
  }

  const updated = await adminUpdateMember(id, {
    memberCode: d.memberCode,
    fullName: d.fullName,
    email: d.email,
    introduction: d.introduction,
    country: d.country,
    phone: d.phone,
    legalEntity: d.legalEntity,
    title: d.title,
    role: d.role as MemberRole | undefined,
    status: d.status as MemberStatus | undefined,
    dailyRate: d.dailyRate,
    htp42DailyRate: d.htp42DailyRate,
    currency: d.currency as Currency | "" | undefined,
  });
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ member: updated });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (id === session.sub) {
    return NextResponse.json(
      { error: "You cannot delete your own member record." },
      { status: 400 },
    );
  }
  await adminDeleteMember(id);
  return NextResponse.json({ ok: true });
}
