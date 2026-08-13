import { describe, expect, it } from "vitest";
import { internalNoteRequired } from "./payment-review-rules";

// The internal note is the governance control for paying flagged invoices, so
// pin exactly when it's compulsory.
describe("internalNoteRequired", () => {
  it("requires a note when deciding an amber/red payment with no note", () => {
    expect(internalNoteRequired("To be paid", "amber", "")).toBe(true);
    expect(internalNoteRequired("Paid", "red", "  ")).toBe(true);
    expect(internalNoteRequired("Rejected", "amber", "")).toBe(true);
    expect(internalNoteRequired("Canceled", "red", "")).toBe(true);
  });

  it("does not require a note once one is given", () => {
    expect(internalNoteRequired("To be paid", "red", "checked with the PM")).toBe(false);
  });

  it("never requires a note for a green decision", () => {
    expect(internalNoteRequired("Paid", "green", "")).toBe(false);
    expect(internalNoteRequired("To be paid", "", "")).toBe(false);
  });

  it("does not require a note for a reversal back to review", () => {
    expect(internalNoteRequired("Under Review", "red", "")).toBe(false);
  });
});
