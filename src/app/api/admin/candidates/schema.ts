import { z } from "zod";
import { CANDIDATE_STATUSES } from "@/lib/airtable";

// Shared by the collection POST and the item PUT. Email is optional while a
// candidate is still a lead, but it's required to onboard them (enforced in the
// onboard route), so we allow empty here.
export const candidateSchema = z.object({
  fullName: z.string().trim().min(1, "A name is required.").max(200),
  email: z.union([z.string().trim().email(), z.literal("")]).default(""),
  phone: z.string().max(60).default(""),
  linkedin: z.union([z.string().trim().url(), z.literal("")]).default(""),
  country: z.string().max(120).default(""),
  source: z.string().max(300).default(""),
  expertise: z.string().max(5000).default(""),
  callNotes: z.string().max(10000).default(""),
  status: z.enum(CANDIDATE_STATUSES as [string, ...string[]]).default("To Contact"),
});
