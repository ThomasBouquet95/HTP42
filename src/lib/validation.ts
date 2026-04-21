import { z } from "zod";

const dayHours = z.number().min(0).max(24);
const dayTask = z.string().max(500).default("");

const daySchema = z.object({
  hours: dayHours,
  task: dayTask,
});

export const timesheetInputSchema = z.object({
  staffingRecordId: z.string().min(3),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  status: z.enum(["Draft", "Submitted"]),
  monday: daySchema,
  tuesday: daySchema,
  wednesday: daySchema,
  thursday: daySchema,
  friday: daySchema,
});

export type TimesheetInputBody = z.infer<typeof timesheetInputSchema>;
