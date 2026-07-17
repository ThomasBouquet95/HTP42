import type { QontoTx } from "./qonto";

// ---------------------------------------------------------------------------
// Reconciliation: fuzzy-match app payments against Qonto bank transactions.
// This module is PURE (no I/O) so it can be unit-tested. The API route maps
// PaymentRecord → ReconInputPayment, calls proposeReconciliation, and writes
// the accepted links back to Airtable.
// ---------------------------------------------------------------------------

export type ReconInputPayment = {
  id: string;
  paymentCode: string;
  direction: "Inflow" | "Outflow" | "";
  currency: string; // invoice currency ("EUR" | "USD" | …)
  value: number | null; // native invoice value
  valueEur: number | null; // EUR-normalized value (for EUR-account matching)
  date: string | null; // best reference date (payment/due/invoice)
  reference: string; // invoice reference (often appears in the bank memo)
  names: string[]; // beneficiary + member/client/project codes
  status: string; // payment status (Canceled/Rejected are skipped)
  linkedTxId: string; // already-linked Qonto tx id, if any
};

export type ReconProposal = {
  paymentId: string;
  paymentCode: string;
  paymentName: string;
  paymentAmount: number | null;
  paymentCurrency: string;
  paymentDate: string | null;
  direction: string;
  txId: string;
  txLabel: string;
  txReference: string;
  txDate: string | null;
  txAmount: number;
  txCurrency: string;
  score: number;
  confidence: "high" | "medium" | "low";
  reasons: string[];
};

export type ReconResult = {
  proposals: ReconProposal[];
  stats: {
    scanned: number; // eligible payments considered
    alreadyLinked: number; // payments that already carry a Qonto link
    matched: number; // proposals produced
    unmatched: number; // eligible, unlinked payments with no proposal
    txConsidered: number; // non-declined Qonto transactions in the pool
  };
};

const SKIP_STATUSES = new Set(["canceled", "cancelled", "rejected"]);

// Normalize free text for comparison: lowercase, strip accents, drop
// punctuation, collapse whitespace.
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  const seen = new Set<string>();
  for (const t of normalizeText(s).split(" ")) if (t.length >= 2) seen.add(t);
  return [...seen];
}

// Whole-day difference between two YYYY-MM-DD(…) strings, or null if unparsable.
export function dayDiff(a: string | null, b: string | null): number | null {
  const parse = (s: string | null): number | null => {
    if (!s) return null;
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  };
  const pa = parse(a);
  const pb = parse(b);
  if (pa == null || pb == null) return null;
  return Math.round(Math.abs(pa - pb) / 86_400_000);
}

function sideOf(direction: string): "inflow" | "outflow" | null {
  if (direction === "Inflow") return "inflow";
  if (direction === "Outflow") return "outflow";
  return null;
}

// Pick the comparable amount for a payment vs a transaction, honouring
// currency. Returns null when the pair isn't comparable or the amounts are too
// far apart to be the same movement.
function amountMatch(
  p: ReconInputPayment,
  tx: QontoTx,
): { base: number; diff: number; exact: boolean } | null {
  let base: number | null = null;
  const pCur = p.currency || "EUR";
  if (pCur === tx.currency && p.value != null) base = p.value;
  else if (tx.currency === "EUR" && p.valueEur != null) base = p.valueEur;
  if (base == null || base <= 0) return null;
  const diff = Math.abs(base - tx.amount);
  const tol = Math.max(0.01, base * 0.02); // 1 cent, or 2% for FX/fee drift
  if (diff > tol) return null;
  return { base, diff, exact: diff <= 0.01 };
}

type Scored = { proposal: ReconProposal; paymentIdx: number };

function scoreOne(
  p: ReconInputPayment,
  tx: QontoTx,
): { score: number; confidence: ReconProposal["confidence"]; reasons: string[] } | null {
  // Direction is mandatory.
  const pSide = sideOf(p.direction);
  if (pSide && pSide !== tx.side) return null;

  const amt = amountMatch(p, tx);
  if (!amt) return null;

  const reasons: string[] = [];
  const amountScore = amt.exact ? 1 : 0.6;
  reasons.push(amt.exact ? "amount exact" : "amount ~match");

  // Name / reference.
  const txText = `${tx.label} ${tx.reference} ${tx.note}`;
  let nameScore: number;
  const ref = normalizeText(p.reference);
  if (ref.length >= 3 && normalizeText(txText).includes(ref)) {
    nameScore = 1;
    reasons.push("reference match");
  } else {
    const pTokens = tokens(p.names.join(" "));
    if (pTokens.length === 0) {
      nameScore = 0.2;
    } else {
      const q = new Set(tokens(txText));
      const hits = pTokens.filter((t) => q.has(t)).length;
      nameScore = hits / pTokens.length;
      if (hits > 0) reasons.push(`name ${hits}/${pTokens.length}`);
    }
  }

  // Date proximity.
  const dd = dayDiff(p.date, tx.settledAt || tx.emittedAt);
  let dateScore: number;
  if (dd == null) {
    dateScore = 0.3;
  } else {
    dateScore = Math.max(0, 1 - dd / 120);
    if (dd <= 45) reasons.push(dd === 0 ? "same day" : `${dd}d apart`);
  }

  const score = 0.5 * amountScore + 0.3 * nameScore + 0.2 * dateScore;
  const confidence: ReconProposal["confidence"] =
    score >= 0.8 ? "high" : score >= 0.62 ? "medium" : "low";
  return { score, confidence, reasons };
}

// Core matcher. Greedy 1:1 assignment: each payment links to at most one
// transaction, and each transaction to at most one payment (highest score
// wins). Transactions already linked to a payment are removed from the pool.
export function proposeReconciliation(
  payments: ReconInputPayment[],
  txs: QontoTx[],
  minScore = 0.5,
): ReconResult {
  const usableTx = txs.filter((t) => t.status.toLowerCase() !== "declined");

  // Transactions already claimed by an existing link are off the table.
  const alreadyLinkedTxIds = new Set(
    payments.map((p) => p.linkedTxId).filter((id): id is string => !!id),
  );
  const pool = usableTx.filter((t) => !alreadyLinkedTxIds.has(t.id));

  const eligible = payments.filter(
    (p) => !SKIP_STATUSES.has(p.status.toLowerCase()) && !p.linkedTxId,
  );
  const alreadyLinked = payments.filter((p) => !!p.linkedTxId).length;

  // Build every viable (payment, tx) candidate, then assign greedily by score.
  const candidates: Scored[] = [];
  eligible.forEach((p, paymentIdx) => {
    for (const tx of pool) {
      const s = scoreOne(p, tx);
      if (!s || s.score < minScore) continue;
      candidates.push({
        paymentIdx,
        proposal: {
          paymentId: p.id,
          paymentCode: p.paymentCode,
          paymentName: p.names.find(Boolean) || p.paymentCode,
          paymentAmount: p.value ?? p.valueEur,
          paymentCurrency: p.currency || "EUR",
          paymentDate: p.date,
          direction: p.direction,
          txId: tx.id,
          txLabel: tx.label,
          txReference: tx.reference,
          txDate: tx.settledAt || tx.emittedAt,
          txAmount: tx.amount,
          txCurrency: tx.currency,
          score: s.score,
          confidence: s.confidence,
          reasons: s.reasons,
        },
      });
    }
  });

  candidates.sort((a, b) => b.proposal.score - a.proposal.score);
  const usedTx = new Set<string>();
  const usedPayment = new Set<number>();
  const proposals: ReconProposal[] = [];
  for (const c of candidates) {
    if (usedPayment.has(c.paymentIdx) || usedTx.has(c.proposal.txId)) continue;
    usedPayment.add(c.paymentIdx);
    usedTx.add(c.proposal.txId);
    proposals.push(c.proposal);
  }

  return {
    proposals,
    stats: {
      scanned: eligible.length,
      alreadyLinked,
      matched: proposals.length,
      unmatched: eligible.length - proposals.length,
      txConsidered: pool.length,
    },
  };
}
