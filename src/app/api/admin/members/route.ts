import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth";
import {
  adminCreateMember,
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
  memberCode: z.string().trim().min(1).max(60),
  fullName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(200),
  personalEmail: z
    .union([z.string().trim().email().max(200), z.literal("")])
    .optional(),
  status: z.enum(MEMBER_STATUSES as [string, ...string[]]),
  role: z.enum(MEMBER_ROLES as [string, ...string[]]).optional(),
  title: z.string().max(200).optional(),
  introduction: z.string().max(5000).optional(),
  country: z.string().max(120).optional(),
  phone: z.string().max(60).optional(),
  legalEntity: z.string().max(200).optional(),
  dailyRate: nullableNumber,
  htp42DailyRate: nullableNumber,
  currency: z.union([z.enum(CURRENCIES as [string, ...string[]]), z.literal("")]).optional(),
});

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const d = parsed.data;

  const [codeClash, emailClash] = await Promise.all([
    findMemberByCode(d.memberCode),
    findMemberByEmail(d.email),
  ]);
  if (codeClash) {
    return NextResponse.json(
      { error: `Member code ${d.memberCode} is already in use.` },
      { status: 409 },
    );
  }
  if (emailClash) {
    return NextResponse.json(
      { error: `Email ${d.email} is already in use.` },
      { status: 409 },
    );
  }

  const created = await adminCreateMember({
    memberCode: d.memberCode,
    fullName: d.fullName,
    email: d.email,
    personalEmail: d.personalEmail,
    status: d.status as MemberStatus,
    role: d.role as MemberRole | undefined,
    title: d.title,
    introduction: d.introduction,
    country: d.country,
    phone: d.phone,
    legalEntity: d.legalEntity,
    dailyRate: d.dailyRate,
    htp42DailyRate: d.htp42DailyRate,
    currency: d.currency as Currency | "" | undefined,
  });
  return NextResponse.json({ member: created });
}
