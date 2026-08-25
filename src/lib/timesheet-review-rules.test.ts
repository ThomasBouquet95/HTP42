import { describe, expect, it } from "vitest";
import { assessTimesheetHours, timesheetCommentRequired } from "./timesheet-review-rules";

describe("assessTimesheetHours", () => {
  it("green when comfortably within the agreed hours", () => {
    const a = assessTimesheetHours({ allocatedHours: 160, approvedHours: 40, thisHours: 40 });
    expect(a.confidence).toBe("green");
    expect(a.projectedHours).toBe(80);
  });

  it("amber when approving this week reaches ~90% of the agreed hours", () => {
    const a = assessTimesheetHours({ allocatedHours: 160, approvedHours: 120, thisHours: 24 });
    expect(a.confidence).toBe("amber"); // 144 / 160 = 90%
    expect(a.reason).toMatch(/90%/);
  });

  it("red when approving this week goes over the agreed hours", () => {
    const a = assessTimesheetHours({ allocatedHours: 40, approvedHours: 32, thisHours: 16 });
    expect(a.confidence).toBe("red"); // 48 > 40
    expect(a.reason).toMatch(/over/);
  });

  it("green when the staffing has no agreed hours to check against", () => {
    expect(assessTimesheetHours({ allocatedHours: null, approvedHours: 200, thisHours: 40 }).confidence).toBe("green");
    expect(assessTimesheetHours({ allocatedHours: 0, approvedHours: 200, thisHours: 40 }).confidence).toBe("green");
  });
});

describe("timesheetCommentRequired", () => {
  it("requires a comment for amber/red with no comment", () => {
    expect(timesheetCommentRequired("amber", "")).toBe(true);
    expect(timesheetCommentRequired("red", "   ")).toBe(true);
  });
  it("does not require once a comment is present, or when green", () => {
    expect(timesheetCommentRequired("red", "confirmed with the PM")).toBe(false);
    expect(timesheetCommentRequired("green", "")).toBe(false);
    expect(timesheetCommentRequired("", "")).toBe(false);
  });
});
