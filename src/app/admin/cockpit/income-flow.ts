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
  // Drill-down: the next split under each node, keyed by that node's key.
  //  - a client's key  -> its revenue by project
  //  - "__other_clients__" -> the individual clients folded into the tail
  //  - a cost bucket's key -> that cost split by who was paid (beneficiary)
  // Sorted desc, so a click can reveal the breakdown without another pass.
  details: Record<string, FlowItem[]>;
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

// Accumulate value into a nested key -> sum map (the cost drill-down buckets).
function addSplit(outer: Map<string, Map<string, number>>, outerKey: string, label: string, value: number) {
  let inner = outer.get(outerKey);
  if (!inner) {
    inner = new Map();
    outer.set(outerKey, inner);
  }
  inner.set(label, (inner.get(label) ?? 0) + value);
}

// Turn a label -> sum map into a sorted FlowItem[] (desc), capped so the panel
// stays readable; the remainder folds into a single "Other" row.
function toSortedItems(m: Map<string, number> | undefined, max = 12): FlowItem[] {
  if (!m) return [];
  return capItems(
    [...m.entries()].map(([label, value]) => ({ key: label, label, value })),
    max,
  );
}

// Sort a FlowItem[] desc and fold the long tail into one "Other" row.
function capItems(items: FlowItem[], max = 12): FlowItem[] {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  if (sorted.length <= max) return sorted;
  const head = sorted.slice(0, max - 1);
  const tail = sorted.slice(max - 1);
  const tailVal = tail.reduce((s, c) => s + c.value, 0);
  return [...head, { key: "__other__", label: `Other (${tail.length})`, value: tailVal }];
}

export function buildIncomeFlow(
  // Network payments only: the founder's own pay (his tagged earning payments)
  // must already be removed so it isn't counted as a cost.
  payments: PaymentRecord[],
  clientNameById: Map<string, string>,
  scope: ChartScope,
  // Project record id -> display label, for the revenue-by-project drill-down.
  projectLabelById: Map<string, string> = new Map(),
  // The founder's own billable revenue per project record id, netted out of that
  // project's revenue (and its client's bucket + the gross total). The cost side
  // is handled by excluding his pay from `payments`.
  ownRevenueByProjectId: Map<string, number> = new Map(),
): IncomeFlow {
  const rows = liveRows(payments, scope);

  // --- Revenue by client (inflows) --- grouped client -> projectKey -> cell, so
  // the founder's slice can be netted at the project level (and roll up cleanly
  // to the client bucket + the gross total).
  const byClient = new Map<string, number>();
  const clientByProject = new Map<string, Map<string, { label: string; value: number }>>();
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
    const projId = p.projectRecordIds.find((id) => id) ?? "";
    const projKey = projId || (p.invoiceReference ? `ref:${p.invoiceReference}` : "__unattributed__");
    const projLabel = (projId && projectLabelById.get(projId)) || p.invoiceReference || "Unattributed";
    let inner = clientByProject.get(name);
    if (!inner) {
      inner = new Map();
      clientByProject.set(name, inner);
    }
    const cell = inner.get(projKey) ?? { label: projLabel, value: 0 };
    cell.value += eur;
    inner.set(projKey, cell);
  }

  // Net the founder's own billable revenue out, per project — from the project
  // cell, its client bucket, and the gross total, so everything stays consistent.
  for (const [clientName, inner] of clientByProject) {
    for (const [projKey, cell] of inner) {
      const slice = ownRevenueByProjectId.get(projKey) ?? 0;
      if (slice <= 0) continue;
      const cut = Math.min(slice, cell.value);
      cell.value -= cut;
      byClient.set(clientName, (byClient.get(clientName) ?? 0) - cut);
      revenue -= cut;
    }
  }

  let clients: FlowItem[] = [...byClient.entries()]
    .filter(([, value]) => value > 0)
    .map(([label, value]) => ({ key: label, label, value }))
    .sort((a, b) => b.value - a.value);
  const tailClients: FlowItem[] = [];
  if (clients.length > MAX_CLIENT_NODES) {
    const head = clients.slice(0, MAX_CLIENT_NODES - 1);
    const tail = clients.slice(MAX_CLIENT_NODES - 1);
    tailClients.push(...tail);
    const tailVal = tail.reduce((s, c) => s + c.value, 0);
    clients = [
      ...head,
      { key: "__other_clients__", label: `Other clients (${tail.length})`, value: tailVal },
    ];
  }

  // --- Costs by category (outflows) ---
  const byCat = new Map<string, { label: string; value: number }>();
  const costByBeneficiary = new Map<string, Map<string, number>>(); // catKey -> beneficiary -> sum
  for (const p of rows) {
    if (p.direction !== "Outflow") continue;
    const eur = effectiveEur(p);
    if (eur <= 0) continue;
    const { key, label } = costCategory(p.type);
    const cur = byCat.get(key) ?? { label, value: 0 };
    cur.value += eur;
    byCat.set(key, cur);
    const who =
      p.beneficiary ||
      p.projectRecordIds.map((id) => projectLabelById.get(id)).find(Boolean) ||
      p.invoiceReference ||
      "Unattributed";
    addSplit(costByBeneficiary, key, who, eur);
  }
  const costs: FlowItem[] = COST_ORDER.filter((k) => byCat.has(k)).map((k) => ({
    key: k,
    label: byCat.get(k)!.label,
    value: byCat.get(k)!.value,
  }));
  const totalCosts = costs.reduce((s, c) => s + c.value, 0);

  // --- Drill-down details, keyed by node key ---
  const details: Record<string, FlowItem[]> = {};
  for (const c of clients) {
    if (c.key === "__other_clients__") {
      details[c.key] = tailClients;
      continue;
    }
    const inner = clientByProject.get(c.label);
    if (!inner) continue;
    const items = [...inner.values()]
      .filter((v) => v.value > 0)
      .map((v) => ({ key: v.label, label: v.label, value: v.value }));
    const split = capItems(items);
    if (split.length > 1) details[c.key] = split; // 1 project = nothing to split
  }
  for (const k of COST_ORDER) {
    if (!byCat.has(k)) continue;
    const split = toSortedItems(costByBeneficiary.get(k));
    if (split.length > 1) details[k] = split;
  }

  return { revenue, clients, costs, totalCosts, net: revenue - totalCosts, details };
}
