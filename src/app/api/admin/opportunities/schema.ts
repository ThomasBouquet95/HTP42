import { z } from "zod";
import { CURRENCIES, OPPORTUNITY_STAGES, OPPORTUNITY_STATUSES } from "@/lib/airtable";

const nullableNumber = z.union([z.number(), z.null()]).optional();
const nullableDate = z.union([z.string().trim().min(1), z.null()]).optional();

// Shared by the collection POST and the item PUT.
export const opportunitySchema = z.object({
  title: z.string().trim().min(1, "A title is required.").max(300),
  clientRecordIds: z.array(z.string()).max(1).default([]),
  stage: z.union([z.enum(OPPORTUNITY_STAGES as [string, ...string[]]), z.literal("")]).default(""),
  status: z.union([z.enum(OPPORTUNITY_STATUSES as [string, ...string[]]), z.literal("")]).default(""),
  statusNote: z.string().max(5000).default(""),
  contact: z.string().max(500).default(""),
  description: z.string().max(5000).default(""),
  estimatedValue: nullableNumber,
  currency: z.union([z.enum(CURRENCIES as [string, ...string[]]), z.literal("")]).default(""),
  expectedStart: nullableDate,
});
