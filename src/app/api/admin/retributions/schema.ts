import { z } from "zod";
import {
  RETRIBUTION_CATEGORIES,
  RETRIBUTION_BASES,
  RETRIBUTION_AMOUNT_TYPES,
  listAllMembers,
  listAllStaffings,
  listProjects,
} from "@/lib/airtable";

// The client sends the percentage as a whole number (e.g. 5 or 5.5); the route
// converts it to the decimal fraction Airtable's percent field stores.
export const retributionSchema = z
  .object({
    projectRecordId: z.string().trim().min(1, "Pick a project."),
    category: z.enum(RETRIBUTION_CATEGORIES as [string, ...string[]]),
    otherDescription: z.string().trim().max(200).default(""),
    amountType: z.enum(RETRIBUTION_AMOUNT_TYPES as [string, ...string[]]),
    percent: z.number().min(0).max(1000).optional(),
    dailyAmount: z.number().min(0).max(1_000_000_000).optional(),
    workedStaffingId: z.string().trim().default(""),
    costBasis: z.enum(RETRIBUTION_BASES as [string, ...string[]]),
    memberRecordId: z.string().trim().min(1, "Pick a member."),
    memberCode: z.string().trim().max(40).default(""),
  })
  .refine((d) => d.category !== "Other" || d.otherDescription.trim().length > 0, {
    message: "Describe the 'Other' category.",
    path: ["otherDescription"],
  })
  .refine((d) => d.amountType !== "Percentage" || d.percent != null, {
    message: "Enter a percentage.",
    path: ["percent"],
  })
  .refine(
    (d) => d.amountType !== "Per day worked" || (d.dailyAmount != null && d.dailyAmount > 0),
    { message: "Enter a daily amount.", path: ["dailyAmount"] },
  )
  .refine((d) => d.amountType !== "Per day worked" || d.workedStaffingId.length > 0, {
    message: "Pick the consultant whose days count.",
    path: ["workedStaffingId"],
  });

export type RetributionBody = z.infer<typeof retributionSchema>;

// Confirm the linked ids refer to real records before writing. The Airtable
// client writes links with typecast:true (needed for the single-selects), and
// typecast would otherwise auto-create a phantom row for an unknown id.
export async function validateRetributionLinks(
  projectRecordId: string,
  memberRecordId: string,
  workedStaffingId: string,
): Promise<string | null> {
  const [projects, members] = await Promise.all([listProjects(), listAllMembers()]);
  const project = projects.find((p) => p.id === projectRecordId);
  if (!project) return "That project no longer exists.";
  if (!members.some((m) => m.id === memberRecordId)) return "That member no longer exists.";
  if (workedStaffingId) {
    const staffings = await listAllStaffings();
    const s = staffings.find((x) => x.id === workedStaffingId);
    if (!s) return "That staffing no longer exists.";
    if (s.projectCode !== project.projectCode)
      return "The chosen consultant isn't staffed on this project.";
  }
  return null;
}
