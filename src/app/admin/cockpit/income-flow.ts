import type { PaymentRecord } from "@/lib/airtable";
import { effectiveEur } from "@/lib/fx";
import type { ChartScope } from "../payments/payment-charts";

// Pure builders for the income-statement Sankey on the Cockpit page:
// revenue by client -> gross revenue -> cost categories + net result.
// Kept free of React so it can be unit-tested on its own.

export type FlowItem = { key: string; label: string; value: number };

export type IncomeFlow = {
  // Gross revenue = sum of all live inflows in scope.
  revenue: number;
  // Revenue split by client (sorted desc, long tail bucketed into "Other").
  clients: FlowItem[];
  // Outflows grouped into friendly cost categories (only non-zero ones).
  costs: FlowItem[];
  totalCosts: number;
  // revenue - totalCosts (can be negative = operating at a loss).
  net: number;
};

// Keep the left column readable: show the biggest clients individually and
// fold the rest into a single "Other clients" node.
const MAX_CLIENT_NODES = 8;

// Map an outflow payment's Type to a friendly cost bucket. The portal's
// payment types are Client Invoice / Subcontractor / Expense / Other; on the
// outflow side Subcontractor is the network's consulting spend and Expense
// covers IT / software / other bills.
export function costCategory(type: string): { key: string; label: string } {
  switch (type) {
    case "Subcontractor":
      return { key: "consulting", label: "Consulting & subcontractors" };
    case "Expense":
      return { key: "expenses", label: "Expenses (IT & other)" };
    default:
      return { key: "other", label: "Other costs" };
  }
}

// Fixed display order for cost buckets (top = biggest recurring cost first).
const COST_ORDER = ["consulting", "expenses", "other"] as const;

// Charts always drop Canceled / Rejected; "executed" scope further narrows to
// Paid only (mirrors payment-charts.chartRows).
function liveRows(payments: PaymentRecord[], scope: ChartScope): PaymentRecord[] {
  return payments.filter((p) => {
    if (p.paymentStatus === "Canceled" || p.paymentStatus === "Rejected") return false;
    if (scope === "executed" && p.paymentStatus !== "Paid") return false;
    return true;
  });
}

export function buildIncomeFlow(
  payments: PaymentRecord[],
  clientNameById: Map<string, string>,
  scope: ChartScope,
): IncomeFlow {
  const rows = liveRows(payments, scope);

  // --- Revenue by client (inflows) ---
  const byClient = new Map<string, number>();
  let revenue = 0;
  for (const p of rows) {
    if (p.direction !== "Inflow") continue;
    const eur = effectiveEur(p);
    if (eur <= 0) continue;
    revenue += eur;
    const name =
      p.clientRecordIds.map((id) => clientNameById.get(id)).find(Boolean) ||
      p.beneficiary ||
      "Unattributed";
    byClient.set(name, (byClient.get(name) ?? 0) + eur);
  }

  let clients: FlowItem[] = [...byClient.entries()]
    .map(([label, value]) => ({ key: label, label, value }))
    .sort((a, b) => b.value - a.value);
  if (clients.length > MAX_CLIENT_NODES) {
    const head = clients.slice(0, MAX_CLIENT_NODES - 1);
    const tail = clients.slice(MAX_CLIENT_NODES - 1);
    const tailVal = tail.reduce((s, c) => s + c.value, 0);
    clients = [
      ...head,
      { key: "__other_clients__", label: `Other clients (${tail.length})`, value: tailVal },
    ];
  }

  // --- Costs by category (outflows) ---
  const byCat = new Map<string, { label: string; value: number }>();
  for (const p of rows) {
    if (p.direction !== "Outflow") continue;
    const eur = effectiveEur(p);
    if (eur <= 0) continue;
    const { key, label } = costCategory(p.type);
    const cur = byCat.get(key) ?? { label, value: 0 };
    cur.value += eur;
    byCat.set(key, cur);
  }
  const costs: FlowItem[] = COST_ORDER.filter((k) => byCat.has(k)).map((k) => ({
    key: k,
    label: byCat.get(k)!.label,
    value: byCat.get(k)!.value,
  }));
  const totalCosts = costs.reduce((s, c) => s + c.value, 0);

  return { revenue, clients, costs, totalCosts, net: revenue - totalCosts };
}
