// Pure project-profitability model for the Cockpit "Profitability" sub-tab.
// Kept free of React/Airtable so it can be unit-tested on its own.
//
// Projected  = the plan: contract value (revenue) minus committed consulting
//              cost (each staffing's days allocated x rate, in EUR).
// Actual     = to date: client billings (Inflow payments) minus costs incurred
//              (Outflow payments), in EUR.
// The colour flag is driven by the PROJECTED margin, since that's what tells an
// admin a project is heading negative before the money has moved.

export type ProfitFlag = "green" | "amber" | "red";

export type ProjectProfit = {
  code: string;
  name: string;
  status: string;
  contractEur: number | null; // projected revenue (project total)
  projectedCostEur: number; // committed consulting cost
  projectedProfitEur: number | null;
  projectedMargin: number | null; // profit / contract
  actualRevenueEur: number; // client billings to date
  actualCostEur: number; // costs incurred to date
  actualProfitEur: number;
  flag: ProfitFlag;
  reasons: string[];
};

type ProjectLike = {
  projectCode: string;
  projectName: string;
  status: string;
  totalAmountEur: number | null;
};
type StaffingLike = {
  projectCode: string;
  daysAllocated: number | null;
  ratePerDay: number | null;
  fxToEur: number | null;
  totalAmountEur: number | null;
};
type PaymentLike = {
  projectCodes: string[];
  direction: string;
  invoiceValueEur: number | null;
  paymentStatus: string;
};

// Margin at or above this is healthy (green); below it (but non-negative) is a
// thin margin worth a second look (amber).
export const HEALTHY_MARGIN = 0.15;

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmtEur = (n: number) => `€${Math.round(n).toLocaleString("en-US")}`;

// Committed cost of one staffing in EUR. Prefer the stored EUR value; else
// derive from days x rate with a 1.0 FX fallback (EUR / unknown currency).
function committedEur(s: StaffingLike): number {
  if (s.totalAmountEur != null) return s.totalAmountEur;
  if (s.daysAllocated != null && s.ratePerDay != null) {
    const fx = s.fxToEur && s.fxToEur > 0 ? s.fxToEur : 1;
    return s.daysAllocated * s.ratePerDay * fx;
  }
  return 0;
}

export function buildProjectProfitability(
  projects: ProjectLike[],
  staffings: StaffingLike[],
  payments: PaymentLike[],
): ProjectProfit[] {
  const costByProject = new Map<string, number>();
  for (const s of staffings) {
    if (!s.projectCode) continue;
    costByProject.set(s.projectCode, (costByProject.get(s.projectCode) ?? 0) + committedEur(s));
  }

  const revByProject = new Map<string, number>();
  const actCostByProject = new Map<string, number>();
  for (const p of payments) {
    if (p.paymentStatus === "Canceled" || p.paymentStatus === "Rejected") continue;
    const eur = p.invoiceValueEur ?? 0;
    if (eur <= 0) continue;
    // A payment usually maps to one project; if it lists several, attribute to each.
    for (const code of p.projectCodes) {
      if (!code) continue;
      if (p.direction === "Inflow") revByProject.set(code, (revByProject.get(code) ?? 0) + eur);
      else if (p.direction === "Outflow") actCostByProject.set(code, (actCostByProject.get(code) ?? 0) + eur);
    }
  }

  const rows: ProjectProfit[] = [];
  for (const pr of projects) {
    const contractEur = pr.totalAmountEur;
    const projectedCostEur = round2(costByProject.get(pr.projectCode) ?? 0);
    const actualRevenueEur = round2(revByProject.get(pr.projectCode) ?? 0);
    const actualCostEur = round2(actCostByProject.get(pr.projectCode) ?? 0);

    // Skip projects with no financial signal at all — they'd be noise.
    if (
      (contractEur == null || contractEur === 0) &&
      projectedCostEur === 0 &&
      actualRevenueEur === 0 &&
      actualCostEur === 0
    ) {
      continue;
    }

    const actualProfitEur = round2(actualRevenueEur - actualCostEur);
    const projectedProfitEur = contractEur != null ? round2(contractEur - projectedCostEur) : null;
    const projectedMargin =
      contractEur != null && contractEur > 0 ? projectedProfitEur! / contractEur : null;

    const reasons: string[] = [];
    let flag: ProfitFlag;
    if (contractEur == null || contractEur <= 0) {
      flag = "amber";
      reasons.push("No contract value set, so the projected margin can't be assessed.");
      if (projectedCostEur > 0) {
        reasons.push(`Committed cost of ${fmtEur(projectedCostEur)} with no revenue recorded.`);
      }
    } else if (projectedProfitEur! < 0) {
      flag = "red";
      reasons.push(`Committed cost exceeds the contract value by ${fmtEur(-projectedProfitEur!)}.`);
    } else if (projectedMargin! < HEALTHY_MARGIN) {
      flag = "amber";
      reasons.push(`Thin projected margin (${Math.round(projectedMargin! * 100)}%).`);
    } else {
      flag = "green";
    }
    // Costs already booked past the contract value are a hard red regardless.
    if (contractEur != null && contractEur > 0 && actualCostEur > contractEur) {
      flag = "red";
      reasons.push("Costs incurred to date already exceed the contract value.");
    }

    rows.push({
      code: pr.projectCode,
      name: pr.projectName,
      status: pr.status,
      contractEur,
      projectedCostEur,
      projectedProfitEur,
      projectedMargin,
      actualRevenueEur,
      actualCostEur,
      actualProfitEur,
      flag,
      reasons,
    });
  }

  // Risk-first: red, then amber, then green; within a flag, worst margin first.
  const order: Record<ProfitFlag, number> = { red: 0, amber: 1, green: 2 };
  return rows.sort(
    (a, b) => order[a.flag] - order[b.flag] || (a.projectedMargin ?? 1) - (b.projectedMargin ?? 1),
  );
}
