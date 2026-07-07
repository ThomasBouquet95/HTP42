import { z } from "zod";
import { RETRIBUTION_CATEGORIES, RETRIBUTION_BASES, listAllMembers, listProjects } from "@/lib/airtable";

// Confirm the linked ids refer to real records before writing. The Airtable
// client writes links with typecast:true (needed for the "Other" category /
// Cost Basis single-selects), and typecast would otherwise auto-create a
// phantom row in Projects / Network Members for an unknown id.
export async function validateRetributionLinks(
  projectRecordId: string,
  memberRecordId: string,
): Promise<string | null> {
  const [projects, members] = await Promise.all([listProjects(), listAllMembers()]);
  if (!projects.some((p) => p.id === projectRecordId)) return "That project no longer exists.";
  if (!members.some((m) => m.id === memberRecordId)) return "That member no longer exists.";
  return null;
}

// The client sends the percentage as a whole number (e.g. 5 or 5.5); the route
// converts it to the decimal fraction Airtable's percent field stores.
export const retributionSchema = z
  .object({
    projectRecordId: z.string().trim().min(1, "Pick a project."),
    category: z.enum(RETRIBUTION_CATEGORIES as [string, ...string[]]),
    otherDescription: z.string().trim().max(200).default(""),
    percent: z.number().min(0).max(1000),
    costBasis: z.enum(RETRIBUTION_BASES as [string, ...string[]]),
    memberRecordId: z.string().trim().min(1, "Pick a member."),
    memberCode: z.string().trim().max(40).default(""),
  })
  .refine((d) => d.category !== "Other" || d.otherDescription.trim().length > 0, {
    message: "Describe the 'Other' category.",
    path: ["otherDescription"],
  });

export type RetributionBody = z.infer<typeof retributionSchema>;
