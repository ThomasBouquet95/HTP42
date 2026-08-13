// Shared payment-review rules, kept pure so both the server route and the tests
// use the exact same logic.

// Status changes that count as a "decision" (as opposed to reopening a payment
// back to review). A decision on a flagged payment must carry an internal note.
export const DECISION_TARGETS = new Set(["To be paid", "Paid", "Rejected", "Canceled"]);

// An internal note is compulsory when an admin decides (not reopens) a payment
// whose confidence assessment is amber or red.
export function internalNoteRequired(
  targetStatus: string,
  confidence: string,
  internalNote: string,
): boolean {
  return (
    DECISION_TARGETS.has(targetStatus) &&
    (confidence === "amber" || confidence === "red") &&
    !internalNote.trim()
  );
}
