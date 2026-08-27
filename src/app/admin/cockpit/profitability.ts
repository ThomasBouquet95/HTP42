// Pure project-profitability model for the Cockpit "Profitability" sub-tab.
// Kept free of React/Airtable so it can be unit-tested on its own.
//
// No forecasting: we track ACTUAL cost as it arises against the project's
// contract value (revenue), and flag projects whose costs are eating the
// contract — approaching, or already past, negative.
//   Margin left = contract value − cost incurred to date (Outflow payments).
//   Billed      = client billings to date (Inflow payments), for context.
// The flag is driven by how much of the contract the costs have consumed.

export type ProfitFlag = "green" | "amber" | "red";

export type ProjectProfit = {
  code: string;
  name: string;
  status: string;
  contractEur: number | null; // revenue (the deal value)
  revenueToDateEur: number; // all client invoices to date (received + expected)
  receivedEur: number; // the paid (executed) portion of revenue to date
  costEur: number; // costs incurred to date (executed + committed)
  costPaidEur: number; // the paid (executed) portion of cost to date
  marginLeftEur: number | null; // contract − cost
  consumedPct: number | null; // cost / contract
  flag: ProfitFlag;
  reasons: string[];
};

type ProjectLike = {
  id: string; // Airtable record id — the join key
  projectCode: string;
  projectName: string;
  status: string;
  totalAmountEur: number | null;
};
type PaymentLike = {
  // Record ids of the linked project(s). We join on the record id, not the
  // display value: a payment's project link resolves to the project's PRIMARY
  // field (its name), which would never match a project's code.
  projectRecordIds: string[];
  direction: string;
  invoiceValueEur: number | null;
  paymentStatus: string;
};

// Costs at/above this share of the contract are "approaching negative" (amber);
// above 100% the project is negative (red).
export const WATCH_CONSUMED = 0.85;

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmtEur = (n: number) => `€${Math.round(n).toLocaleString("en-US")}`;

export function buildProjectProfitability(
  projects: ProjectLike[],
  payments: PaymentLike[],
): ProjectProfit[] {
  const revenueByProject = new Map<string, number>(); // all inflows (incl. expected)
  const receivedByProject = new Map<string, number>(); // paid inflows only
  const costByProject = new Map<string, number>(); // all outflows (incl. committed)
  const costPaidByProject = new Map<string, number>(); // paid outflows only
  for (const p of payments) {
    if (p.paymentStatus === "Canceled" || p.paymentStatus === "Rejected") continue;
    const eur = p.invoiceValueEur ?? 0;
    if (eur <= 0) continue;
    // A payment usually maps to one project; if it lists several, attribute to each.
    for (const id of p.projectRecordIds) {
      if (!id) continue;
      if (p.direction === "Inflow") {
        revenueByProject.set(id, (revenueByProject.get(id) ?? 0) + eur);
        if (p.paymentStatus === "Paid") receivedByProject.set(id, (receivedByProject.get(id) ?? 0) + eur);
      } else if (p.direction === "Outflow") {
        costByProject.set(id, (costByProject.get(id) ?? 0) + eur);
        if (p.paymentStatus === "Paid") costPaidByProject.set(id, (costPaidByProject.get(id) ?? 0) + eur);
      }
    }
  }

  const rows: ProjectProfit[] = [];
  for (const pr of projects) {
    const contractEur = pr.totalAmountEur;
    const revenueToDateEur = round2(revenueByProject.get(pr.id) ?? 0);
    const receivedEur = round2(receivedByProject.get(pr.id) ?? 0);
    const costEur = round2(costByProject.get(pr.id) ?? 0);
    const costPaidEur = round2(costPaidByProject.get(pr.id) ?? 0);

    // Skip projects with no financial signal at all — they'd be noise.
    if ((contractEur == null || contractEur === 0) && revenueToDateEur === 0 && costEur === 0) continue;

    const marginLeftEur = contractEur != null ? round2(contractEur - costEur) : null;
    const consumedPct = contractEur != null && contractEur > 0 ? costEur / contractEur : null;

    const reasons: string[] = [];
    let flag: ProfitFlag;
    if (contractEur == null || contractEur <= 0) {
      flag = "amber";
      reasons.push("No contract value set, so cost can't be tracked against revenue.");
      if (costEur > 0) reasons.push(`Costs of ${fmtEur(costEur)} incurred with no revenue recorded.`);
    } else if (costEur > contractEur) {
      flag = "red";
      reasons.push(
        `Costs (${fmtEur(costEur)}) exceed the contract value (${fmtEur(contractEur)}) by ${fmtEur(costEur - contractEur)}.`,
      );
    } else if (consumedPct! >= WATCH_CONSUMED) {
      flag = "amber";
      reasons.push(
        `Costs are ${Math.round(consumedPct! * 100)}% of the contract value — only ${fmtEur(marginLeftEur!)} margin left.`,
      );
    } else {
      flag = "green";
    }

    rows.push({
      code: pr.projectCode,
      name: pr.projectName,
      status: pr.status,
      contractEur,
      revenueToDateEur,
      receivedEur,
      costEur,
      costPaidEur,
      marginLeftEur,
      consumedPct,
      flag,
      reasons,
    });
  }

  // Risk-first: red, then amber, then green; within a flag, most-consumed first.
  const order: Record<ProfitFlag, number> = { red: 0, amber: 1, green: 2 };
  return rows.sort(
    (a, b) => order[a.flag] - order[b.flag] || (b.consumedPct ?? -1) - (a.consumedPct ?? -1),
  );
}
