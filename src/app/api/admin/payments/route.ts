import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth";
import { createPayment, CURRENCIES, PAYMENT_STATUSES, type Currency, type PaymentDirection, type PaymentStatus } from "@/lib/airtable";

const nullableNumber = z.union([z.number(), z.null()]).optional();
const nullableDate = z.union([z.string().trim().min(1), z.null()]).optional();

const schema = z.object({
  direction: z.union([z.literal("Inflow"), z.literal("Outflow"), z.literal("")]).default(""),
  type: z.string().trim().max(120).default(""),
  projectRecordIds: z.array(z.string()).max(10).default([]),
  clientRecordIds: z.array(z.string()).max(10).default([]),
  memberRecordIds: z.array(z.string()).max(10).default([]),
  invoiceDate: nullableDate,
  invoiceReference: z.string().trim().max(200).default(""),
  invoiceCurrency: z.union([z.enum(CURRENCIES as [string, ...string[]]), z.literal("")]).default(""),
  invoiceValue: nullableNumber,
  fxRateToEur: nullableNumber,
  invoiceValueEur: nullableNumber,
  paymentTerms: z.string().trim().max(200).default(""),
  paymentStatus: z
    .union([z.enum(PAYMENT_STATUSES as [string, ...string[]]), z.literal("")])
    .default(""),
  paymentDate: nullableDate,
  dueDate: nullableDate,
  beneficiary: z.string().trim().max(200).default(""),
  comment: z.string().max(5000).default(""),
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
  const id = await createPayment({
    direction: d.direction as PaymentDirection | "",
    type: d.type,
    projectRecordIds: d.projectRecordIds,
    clientRecordIds: d.clientRecordIds,
    memberRecordIds: d.memberRecordIds,
    invoiceDate: d.invoiceDate ?? null,
    invoiceReference: d.invoiceReference,
    invoiceCurrency: d.invoiceCurrency as Currency | "",
    invoiceValue: d.invoiceValue ?? null,
    fxRateToEur: d.fxRateToEur ?? null,
    invoiceValueEur: d.invoiceValueEur ?? null,
    paymentTerms: d.paymentTerms,
    paymentStatus: d.paymentStatus as PaymentStatus | "",
    paymentDate: d.paymentDate ?? null,
    dueDate: d.dueDate ?? null,
    beneficiary: d.beneficiary,
    comment: d.comment,
  });
  return NextResponse.json({ id });
}
