// FX-risk check for staffings (lesson from ECS-2025-01: a USD fixed-price
// project staffed with a consultant who invoiced in CHF turned a 7% margin
// negative). Rule: a consultant's rate must be set in the project's billing
// currency, so the consultant — not HTP42 — carries their own FX risk. HTP42
// already carries the project-currency → EUR risk; it shouldn't carry theirs.

export type StaffingFxRisk = {
  kind: "rate-currency" | "member-currency";
  title: string;
  detail: string;
};

export function staffingFxRisks(input: {
  projectCurrency?: string | null;
  staffingCurrency?: string | null;
  memberCurrency?: string | null;
  memberName?: string | null;
}): StaffingFxRisk[] {
  const project = (input.projectCurrency || "").trim();
  const rate = (input.staffingCurrency || "").trim();
  const member = (input.memberCurrency || "").trim();
  const who = (input.memberName || "").trim() || "This member";
  if (!project) return [];

  const risks: StaffingFxRisk[] = [];
  if (rate && rate !== project) {
    risks.push({
      kind: "rate-currency",
      title: `Risk: FX — rate in ${rate}, project billed in ${project}`,
      detail: `HTP42 would carry the ${rate}/${project} exchange risk on this consultant. Set the daily rate in ${project} so the consultant carries it.`,
    });
  }
  // Rate already matches the project, but the member normally invoices in
  // another currency: flag it so the admin confirms the consultant accepts a
  // rate in the project currency (they invoice its equivalent at the day's rate).
  if (member && member !== project && member !== rate) {
    risks.push({
      kind: "member-currency",
      title: `Risk: FX — ${who} invoices in ${member}, project billed in ${project}`,
      detail: `Make sure they accept a ${project} rate and carry the exchange risk: their ${member} invoice must equal the ${project} amount at the day's rate, not their usual ${member} rate.`,
    });
  }
  return risks;
}
