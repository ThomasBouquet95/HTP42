import { describe, expect, it } from "vitest";
import {
  amountMatches,
  isProcessed,
  isoWeekKey,
  matchTransaction,
  normalizeText,
  parseFrenchAmount,
  parseFrenchDate,
  rowsToTransactions,
  txnFingerprint,
  weeklyBuckets,
  type ReconCandidate,
} from "./reconciliation";

describe("french number / date parsing", () => {
  it("parses French amounts with space thousands + comma decimals", () => {
    expect(parseFrenchAmount("4 900,00")).toBe(4900);
    expect(parseFrenchAmount("11 200,00")).toBe(11200);
    expect(parseFrenchAmount("159,86")).toBe(159.86);
    expect(parseFrenchAmount(" 1 234,56")).toBe(1234.56); // non-breaking spaces
    expect(parseFrenchAmount("")).toBeNull();
    expect(parseFrenchAmount(null)).toBeNull();
  });
  it("parses DD/MM/YYYY to ISO", () => {
    expect(parseFrenchDate("26/02/2026")).toBe("2026-02-26");
    expect(parseFrenchDate("7/3/2026")).toBe("2026-03-07");
    expect(parseFrenchDate("2026-02-26")).toBe("2026-02-26");
    expect(parseFrenchDate("")).toBe("");
    expect(parseFrenchDate("Date")).toBe("");
  });
});

describe("iso week key", () => {
  it("buckets dates into ISO weeks", () => {
    expect(isoWeekKey("2026-02-26")).toBe("2026-W09");
    // 2026-01-01 is a Thursday → ISO week 1.
    expect(isoWeekKey("2026-01-01")).toBe("2026-W01");
    expect(isoWeekKey("")).toBe("");
  });
});

describe("rowsToTransactions", () => {
  it("skips the header and parses data rows, fingerprinting each", () => {
    const rows = [
      ["Date", "Code Journal", "Libellé", "Débit", "Crédit", "Commentaire"],
      ["26/02/2026", "BQ", "CHRISTIAAN BORN DJURHUUS  19", "4 900,00", "", ""],
      ["02/03/2026", "BQ", "AWS EMEA  CARTE ***6218", "159,86", "", "receipt lost"],
    ];
    const txns = rowsToTransactions(rows);
    expect(txns).toHaveLength(2);
    expect(txns[0]).toMatchObject({ date: "2026-02-26", debit: 4900, credit: 0, codeJournal: "BQ" });
    expect(txns[1].commentaire).toBe("receipt lost"); // preserved
    expect(txns[0].fingerprint).toContain("2026-02-26|4900.00");
  });

  it("fingerprint ignores card mask, case and the Crédit column so re-uploads are stable", () => {
    const a = txnFingerprint("2026-03-02", 159.86, "AWS EMEA  CARTE ***6218");
    const b = txnFingerprint("2026-03-02", 159.86, "aws emea carte ***6218");
    expect(a).toBe(b);
    // Same transaction, lot number later added to the Crédit column → same id.
    const rowsNoLot = rowsToTransactions([["18/04/2026", "BQ", "OSTERIA DODICI 23322", "155,43", "", ""]]);
    const rowsWithLot = rowsToTransactions([["18/04/2026", "BQ", "OSTERIA DODICI 23322", "155,43", "118", ""]]);
    expect(rowsNoLot[0].fingerprint).toBe(rowsWithLot[0].fingerprint);
  });
});

describe("amountMatches (EUR tolerance)", () => {
  it("accepts within the larger of €2 or 1.5%", () => {
    expect(amountMatches(5000, 5000)).toBe(true);
    expect(amountMatches(5000, 4950)).toBe(true); // within 1.5%
    expect(amountMatches(100, 101.5)).toBe(true); // within €2
    expect(amountMatches(5000, 4000)).toBe(false);
    expect(amountMatches(100, null)).toBe(false);
  });
});

describe("matchTransaction", () => {
  const txn = {
    date: "2026-06-03",
    codeJournal: "BQ",
    libelle: "BORN DJURHUUS CONSULTING APS  INVOICE 21 ECS-2026-04",
    debit: 5000,
    credit: 0,
    commentaire: "",
    fingerprint: "fp",
  };
  const cand = (over: Partial<ReconCandidate>): ReconCandidate => ({
    kind: "member", id: "x", label: "", reference: "", amountEur: null, dateIso: null, pdfUrl: null, pdfFilename: null, ...over,
  });

  it("auto-accepts a single confident match (amount + name/ref)", () => {
    const r = matchTransaction(txn, [
      cand({ id: "inv1", label: "Born Djurhuus Consulting", reference: "ECS-2026-04", amountEur: 5000, dateIso: "2026-05-28" }),
      cand({ id: "other", label: "Klarity", reference: "FT 2026/4", amountEur: 16800, dateIso: "2026-06-01" }),
    ]);
    expect(r.status).toBe("found");
    expect(r.best?.id).toBe("inv1");
  });

  it("flags review when two invoices share the amount but names are weak", () => {
    const r = matchTransaction({ ...txn, libelle: "VIREMENT 5000" }, [
      cand({ id: "a", label: "Alpha", reference: "A-1", amountEur: 5000, dateIso: "2026-05-20" }),
      cand({ id: "b", label: "Beta", reference: "B-2", amountEur: 5000, dateIso: "2026-05-22" }),
    ]);
    expect(r.status).toBe("review");
    expect(r.candidates.length).toBe(2);
  });

  it("matches a member by their company alias when the libellé shows the company", () => {
    const companyTxn = {
      date: "2026-11-05", codeJournal: "BQ", libelle: "LITTLE CUBE CONSULTING GMBH",
      debit: 38593.75, credit: 0, commentaire: "", fingerprint: "fp2",
    };
    const r = matchTransaction(companyTxn, [
      cand({ id: "jen", label: "Jennifer Example", aliases: ["Little Cube Consulting GmbH"], reference: "INV-9", amountEur: 38593.75, dateIso: "2026-11-01" }),
    ]);
    expect(r.status).toBe("found");
    expect(r.best?.id).toBe("jen");
  });

  it("returns not_found when no candidate matches the amount", () => {
    const r = matchTransaction(txn, [cand({ id: "a", label: "Born Djurhuus", reference: "ECS-2026-04", amountEur: 999 })]);
    expect(r.status).toBe("not_found");
    expect(r.best).toBeNull();
  });
});

describe("isProcessed / weeklyBuckets", () => {
  it("processed when sent or annotated", () => {
    expect(isProcessed({ sentToFulllAt: "2026-11-01T10:00:00Z" })).toBe(true);
    expect(isProcessed({ resolution: "receipt_lost" })).toBe(true);
    expect(isProcessed({ sentToFulllAt: "", resolution: "" })).toBe(false);
    expect(isProcessed({})).toBe(false);
  });

  it("headline 'missing' counts not-found AND not-processed, by transaction week", () => {
    const rows = [
      { date: "2026-02-26", matchStatus: "not_found" as const }, // W09 missing
      { date: "2026-02-24", matchStatus: "not_found" as const, resolution: "personal" }, // W09 processed
      { date: "2026-02-25", matchStatus: "review" as const }, // W09 review
      { date: "2026-03-07", matchStatus: "found" as const }, // W10 found (not processed)
    ];
    const buckets = weeklyBuckets(rows);
    const w09 = buckets.find((b) => b.week === "2026-W09")!;
    expect(w09.missing).toBe(1);
    expect(w09.review).toBe(1);
    expect(w09.processed).toBe(1);
    expect(w09.total).toBe(3);
    const w10 = buckets.find((b) => b.week === "2026-W10")!;
    expect(w10.found).toBe(1);
    expect(w10.missing).toBe(0);
  });
});

describe("normalizeText", () => {
  it("strips accents, card masks and punctuation", () => {
    expect(normalizeText("Libellé")).toBe("LIBELLE");
    expect(normalizeText("AWS EMEA  CARTE ***6218")).toBe("AWS EMEA");
  });
});
