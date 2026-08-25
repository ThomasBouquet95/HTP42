// Shared, pure rules for the timesheet review confidence, so the review UI, the
// server enforcement, and the tests all agree. Mirrors the payment-review
// assessment: amber when approving a week would take a member near the hours
// allocated on the staffing, red when it would go over.

export type HoursConfidence = "green" | "amber" | "red";

const round1 = (n: number) => Math.round(n * 10) / 10;

export function assessTimesheetHours(params: {
  allocatedHours: number | null; // staffing's agreed hours (days * 8), null if unset
  approvedHours: number; // already Approved/Invoiced/Paid on the staffing (excludes this week)
  thisHours: number; // the week being reviewed
}): { confidence: HoursConfidence; projectedHours: number; reason: string } {
  const { allocatedHours, approvedHours, thisHours } = params;
  const projectedHours = approvedHours + thisHours;
  // No agreed cap on the staffing, so there's nothing to warn against.
  if (allocatedHours == null || allocatedHours <= 0) {
    return { confidence: "green", projectedHours, reason: "" };
  }
  if (projectedHours > allocatedHours + 0.05) {
    return {
      confidence: "red",
      projectedHours,
      reason: `Approving this takes the total to ${round1(projectedHours)} h against ${round1(allocatedHours)} h agreed (${round1(projectedHours - allocatedHours)} h over).`,
    };
  }
  if (projectedHours >= allocatedHours * 0.9) {
    return {
      confidence: "amber",
      projectedHours,
      reason: `Approving this uses ${Math.round((projectedHours / allocatedHours) * 100)}% of the agreed hours.`,
    };
  }
  return { confidence: "green", projectedHours, reason: "" };
}

// A comment is compulsory when deciding a week whose assessment is amber or red.
export function timesheetCommentRequired(confidence: string, comment: string): boolean {
  return (confidence === "amber" || confidence === "red") && !comment.trim();
}
