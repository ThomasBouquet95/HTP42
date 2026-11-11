// Pure logic for the Fulll missing-invoice reconciliation. Kept free of Airtable
// / React so it can be unit-tested. The route supplies the uploaded workbook and
// the candidate invoices; this parses the rows and scores each transaction
// against the candidates. Matching rule (confirmed): amount (EUR, tolerance) +
// date proximity + name/reference tokens; auto-accept only a single confident
// match, otherwise flag for review.

import JSZip from "jszip";

export type FulllTxn = {
  date: string; // ISO yyyy-mm-dd ("" if unparseable)
  codeJournal: string;
  libelle: string;
  debit: number; // EUR (money out)
  credit: number; // EUR (money in; usually 0 here)
  commentaire: string; // from the file (empty on arrival)
  fingerprint: string; // stable id across re-uploads
};

export type ReconCandidate = {
  kind: "member" | "vendor";
  id: string;
  label: string; // counterparty (member name / vendor)
  reference: string; // invoiceCode / invoiceNumber
  amountEur: number | null;
  dateIso: string | null;
  pdfUrl: string | null;
  pdfFilename: string | null;
};

export type ScoredCandidate = ReconCandidate & {
  score: number;
  amountOk: boolean;
  refMatch: boolean;
  nameMatch: boolean;
  daysApart: number | null;
};

export type MatchResult = {
  status: "found" | "review" | "not_found";
  best: ScoredCandidate | null;
  candidates: ScoredCandidate[]; // top few, for the review picker
};

// ---- Number / date / week helpers ----------------------------------------

// "4 900,00" / "4 900,00" / "-1 234,56" → 4900. Returns null when empty.
export function parseFrenchAmount(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return raw;
  const cleaned = raw
    .replace(/[  \s]/g, "") // spaces, incl. non-breaking / narrow
    .replace(/−/g, "-") // minus sign
    .replace(/\./g, "") // thousands dot, if any
    .replace(/,/g, "."); // decimal comma → dot
  if (!cleaned || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// "26/02/2026" → "2026-02-26". Also tolerates an already-ISO value.
export function parseFrenchDate(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return "";
}

// ISO-8601 week key, e.g. "2026-W09". Empty for an unparseable date.
export function isoWeekKey(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  // Shift to Thursday of this week, then week 1 is the week with Jan 4th.
  const day = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const ft = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ft + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// A human label for a week key, e.g. "Week of 23 Feb 2026" (the Monday).
export function weekLabel(weekKey: string): string {
  const m = weekKey.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return weekKey;
  const [, y, w] = m;
  const jan4 = new Date(Date.UTC(Number(y), 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Day + (Number(w) - 1) * 7);
  return `Week of ${monday.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;
}

// Normalise a label for comparison: uppercase, strip accents, drop card masks
// ("CARTE ***6218") and collapse to single spaces.
export function normalizeText(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/CARTE\s*\*+\d+/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Stable fingerprint so a re-uploaded file keeps each transaction's state.
// Based on date + debit + normalised libellé only: the Crédit column is left
// out on purpose — some Fulll exports put a lot/batch number there (e.g. "118")
// rather than a euro amount, and that must not change a transaction's identity.
export function txnFingerprint(date: string, debit: number, libelle: string): string {
  return `${date}|${debit.toFixed(2)}|${normalizeText(libelle)}`;
}

// ---- Workbook parsing (jszip; the Fulll export is a single simple sheet) ---

// Turn a matrix of string cells (incl. the header row) into transactions.
export function rowsToTransactions(rows: string[][]): FulllTxn[] {
  const out: FulllTxn[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const date = parseFrenchDate(r[0] ?? "");
    // Skip the header and any row without a real date in column A.
    if (!date) continue;
    const debit = parseFrenchAmount(r[3] ?? "") ?? 0;
    const credit = parseFrenchAmount(r[4] ?? "") ?? 0;
    const libelle = (r[2] ?? "").trim();
    out.push({
      date,
      codeJournal: (r[1] ?? "").trim(),
      libelle,
      debit,
      credit,
      commentaire: (r[5] ?? "").trim(),
      fingerprint: txnFingerprint(date, debit, libelle),
    });
  }
  return out;
}

const XML_ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
function decodeXml(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m] ?? m);
}

function colToIndex(ref: string): number {
  const letters = ref.replace(/\d+/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// Parse the first worksheet of a Fulll .xlsx buffer into transactions.
export async function parseFulllWorkbook(buf: Buffer | Uint8Array): Promise<FulllTxn[]> {
  const zip = await JSZip.loadAsync(buf);
  const shared: string[] = [];
  const ssFile = zip.file("xl/sharedStrings.xml");
  if (ssFile) {
    const xml = await ssFile.async("string");
    for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      const text = [...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1])).join("");
      shared.push(text);
    }
  }
  const sheetName = Object.keys(zip.files)
    .filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f))
    .sort()[0];
  if (!sheetName) return [];
  const xml = await zip.file(sheetName)!.async("string");
  const rows: string[][] = [];
  for (const rowM of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const c of rowM[1].matchAll(/<c r="([A-Z]+\d+)"(?:[^>]*?t="([^"]+)")?[^>]*>([\s\S]*?)<\/c>/g)) {
      const idx = colToIndex(c[1]);
      const type = c[2];
      const inner = c[3];
      let value = "";
      if (type === "inlineStr") {
        value = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1])).join("");
      } else {
        const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
        value = type === "s" ? shared[Number(v)] ?? "" : decodeXml(v);
      }
      cells[idx] = value;
    }
    rows.push(Array.from(cells, (x) => x ?? ""));
  }
  return rowsToTransactions(rows);
}

// ---- Status / weekly dashboard -------------------------------------------

// A row is "processed" (leaves the missing pile) when its invoice was sent to
// Fulll OR an admin recorded an outcome (receipt lost / personal / already
// deposited / other). Confirmed decision.
export function isProcessed(row: { sentToFulllAt?: string; resolution?: string }): boolean {
  return !!(row.sentToFulllAt && row.sentToFulllAt.length) || !!(row.resolution && row.resolution.length);
}

export type WeekBucket = {
  week: string; // yyyy-Www
  label: string;
  missing: number; // not found AND not processed (the headline "missing invoices")
  review: number; // matched candidates awaiting confirmation, not processed
  found: number; // a confident invoice match, not yet processed
  processed: number;
  total: number;
};

// Weekly counts bucketed by the transaction date's ISO week (confirmed). The
// headline `missing` = not found AND not processed; the other buckets give
// context so the number isn't read in isolation.
export function weeklyBuckets(
  rows: { date: string; matchStatus: "found" | "review" | "not_found"; sentToFulllAt?: string; resolution?: string }[],
): WeekBucket[] {
  const map = new Map<string, WeekBucket>();
  for (const r of rows) {
    const week = isoWeekKey(r.date);
    if (!week) continue;
    const b =
      map.get(week) ??
      { week, label: weekLabel(week), missing: 0, review: 0, found: 0, processed: 0, total: 0 };
    b.total += 1;
    if (isProcessed(r)) b.processed += 1;
    else if (r.matchStatus === "not_found") b.missing += 1;
    else if (r.matchStatus === "review") b.review += 1;
    else b.found += 1;
    map.set(week, b);
  }
  return [...map.values()].sort((a, b) => b.week.localeCompare(a.week));
}

// ---- Matching -------------------------------------------------------------

// Amount is a necessary signal: a candidate must match the debit in EUR within
// the larger of €2 or 1.5% (covers FX rounding + small bank fees).
export function amountMatches(txnEur: number, invEur: number | null): boolean {
  if (invEur == null || invEur <= 0 || txnEur <= 0) return false;
  const tol = Math.max(2, txnEur * 0.015);
  return Math.abs(txnEur - invEur) <= tol;
}

function daysBetween(a: string, b: string): number | null {
  if (!a || !b) return null;
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(da) || Number.isNaN(db)) return null;
  return Math.round((da - db) / 86_400_000);
}

// Tokens worth matching on (drop short/noise tokens).
const NOISE_TOKENS = new Set(["THE", "AND", "SARL", "SAS", "LTD", "INC", "GMBH", "APS", "LDA", "BV", "CARTE", "FACTURE", "INVOICE", "NO", "FT", "RE", "BILL", "COM", "WWW"]);
function tokensOf(s: string): string[] {
  return normalizeText(s)
    .split(" ")
    .filter((t) => t.length >= 3 && !NOISE_TOKENS.has(t));
}

// Score one candidate against a transaction. amountOk gates everything.
export function scoreCandidate(txn: FulllTxn, c: ReconCandidate): ScoredCandidate {
  const amountOk = amountMatches(txn.debit, c.amountEur);
  const libN = normalizeText(txn.libelle);
  const refN = normalizeText(c.reference);
  // Reference hit: the invoice ref/number appears in the libellé (strong).
  const refMatch = refN.length >= 3 && libN.includes(refN);
  // Name hit: a significant counterparty token appears in the libellé.
  const labelTokens = tokensOf(c.label);
  const libTokens = new Set(tokensOf(txn.libelle));
  const nameHits = labelTokens.filter((t) => libTokens.has(t)).length;
  const nameMatch = nameHits > 0;
  const daysApart = c.dateIso ? daysBetween(txn.date, c.dateIso) : null;
  // Payments land on/after the invoice date; allow a little slack before it.
  const dateOk = daysApart == null ? false : daysApart >= -7 && daysApart <= 120;

  let score = 0;
  if (amountOk) score += 45;
  if (refMatch) score += 40;
  score += Math.min(nameHits, 3) * 12; // up to 36
  if (dateOk) score += 15;
  else if (daysApart != null && Math.abs(daysApart) <= 200) score += 5;
  return { ...c, score, amountOk, refMatch, nameMatch, daysApart };
}

export type MatchOptions = { topN?: number };

// Match a transaction against all candidates. Auto-accept ("found") only when a
// single candidate matches the amount AND the name or reference, and it clearly
// leads the field; multiple amount-matches, or an amount-only match, → "review".
export function matchTransaction(
  txn: FulllTxn,
  candidates: ReconCandidate[],
  opts: MatchOptions = {},
): MatchResult {
  const topN = opts.topN ?? 5;
  const scored = candidates
    .map((c) => scoreCandidate(txn, c))
    .filter((c) => c.amountOk)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { status: "not_found", best: null, candidates: [] };

  const best = scored[0];
  const second = scored[1];
  const strong = best.refMatch || best.nameMatch;
  const clearLead = !second || best.score - second.score >= 15;

  const status: MatchResult["status"] = strong && clearLead ? "found" : "review";
  return { status, best, candidates: scored.slice(0, topN) };
}
