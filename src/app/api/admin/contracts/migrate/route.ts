import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-shot migration that cleans the Contracts table after the
// Status/Validity/Signatory redesign. Idempotent — safe to re-run. Three
// passes:
//
//   1. Ensure "Signatory 1 Date", "Signatory 2 Date", and "Comment"
//      fields exist on the Contracts table (created via the Airtable
//      meta API when absent).
//   2. Walk every contract row and migrate the historical detailed-
//      terms fields (Confidentiality, IP, Non-solicitation, Exclusivity,
//      Governing Law, Notice Period, Duration, Consultant Visibility,
//      Effective Date, Specific Clauses) into Key Terms as bullets. Each
//      moved value is appended only if Key Terms doesn't already contain
//      its text — avoids duplicate paragraphs on re-runs.
//   3. Clean dirty date columns. Signature Date and Expiry Date carry
//      legacy free-text like "Fabien (HP): 04/06/2026 | Pascal (HTP42):
//      04/06/2026" — split that into Signatory 1/2 Date + a single ISO
//      Signature Date. Also strip name-prefix patterns from Expiry Date
//      when the rest of the value parses to a date.
//
// Returns a JSON summary: counts per pass, plus the rows that needed
// migration so admins can sanity-check the rewrites against Airtable.

const BASE_ID = () => env.airtableBaseId;
const PAT = () => env.airtablePat;
const META_BASE = () => `https://api.airtable.com/v0/meta/bases/${BASE_ID()}/tables`;

type AirtableField = {
  id: string;
  name: string;
  type: string;
  options?: { choices?: Array<{ name: string }> };
};

type AirtableTable = {
  id: string;
  name: string;
  fields: AirtableField[];
};

async function fetchContractsTable(): Promise<AirtableTable> {
  const res = await fetch(META_BASE(), {
    headers: { Authorization: `Bearer ${PAT()}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Meta fetch failed (${res.status})`);
  const data = (await res.json()) as { tables: AirtableTable[] };
  const table = data.tables.find((t) => t.name === "Contracts");
  if (!table) throw new Error("Contracts table not found");
  return table;
}

async function ensureField(
  tableId: string,
  name: string,
  type: "singleLineText" | "multilineText",
): Promise<{ created: boolean; fieldId: string }> {
  const table = await fetchContractsTable();
  const existing = table.fields.find((f) => f.name === name);
  if (existing) return { created: false, fieldId: existing.id };
  const res = await fetch(
    `https://api.airtable.com/v0/meta/bases/${BASE_ID()}/tables/${tableId}/fields`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAT()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, type }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`create_field ${name} failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { id: string };
  return { created: true, fieldId: json.id };
}

type Record = {
  id: string;
  fields: { [k: string]: unknown };
};

async function listAllContracts(): Promise<Record[]> {
  const all: Record[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(
      `https://api.airtable.com/v0/${BASE_ID()}/${encodeURIComponent("Contracts")}`,
    );
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${PAT()}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`list contracts failed (${res.status})`);
    const data = (await res.json()) as { records: Record[]; offset?: string };
    all.push(...data.records);
    offset = data.offset;
  } while (offset);
  return all;
}

async function patchInBatches(
  updates: Array<{ id: string; fields: { [k: string]: unknown } }>,
): Promise<number> {
  let n = 0;
  for (let i = 0; i < updates.length; i += 10) {
    const batch = updates.slice(i, i + 10);
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID()}/${encodeURIComponent("Contracts")}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${PAT()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ records: batch, typecast: true }),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`patch batch failed (${res.status}): ${text}`);
    }
    n += batch.length;
  }
  return n;
}

// Detailed-term columns that get folded into Key Terms. The key is the
// Airtable field name, the value is the prefix we add when migrating
// the content into a Key Terms bullet.
const DETAILED_TERMS: Array<[string, string]> = [
  ["Confidentiality", "Confidentiality"],
  ["Non-Solicitation", "Non-solicitation"],
  ["Intellectual Property", "IP"],
  ["Exclusivity", "Exclusivity"],
  ["Governing Law / Jurisdiction", "Governing law"],
  ["Notice Period", "Notice period"],
  ["Duration", "Duration"],
  ["Consultant Visibility", "Consultant visibility"],
  ["Effective Date", "Effective"],
  ["Specific Clauses / Comments", "Notes"],
];

function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  if (typeof v === "object" && "name" in (v as { name?: unknown })) {
    const name = (v as { name?: unknown }).name;
    return typeof name === "string" ? name : "";
  }
  return String(v);
}

function appendBullet(existing: string, line: string): string {
  if (!line.trim()) return existing;
  if (existing.toLowerCase().includes(line.toLowerCase())) return existing;
  const prefix = existing.trim() ? existing.trim() + "\n" : "";
  return `${prefix}• ${line}`;
}

// Extract the first "Name (Co): DD/MM/YYYY" segment from a string like
// "Fabien Baiata (HP): 04/06/2026 | Pascal Bouquet (HTP42): 03/06/2026".
// Returns name, company, date for each segment plus the cleaned date.
type Segment = { name: string; company: string; date: string };
function parseSignatoryDateBlob(s: string): Segment[] {
  if (!s) return [];
  const parts = s.split(/[|;]/).map((p) => p.trim()).filter(Boolean);
  const out: Segment[] = [];
  for (const p of parts) {
    const m = p.match(
      /^(?<name>[^():]+?)(?:\s*\((?<co>[^)]+)\))?\s*[:\-]\s*(?<date>\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/,
    );
    if (m && m.groups) {
      out.push({
        name: m.groups.name.trim(),
        company: (m.groups.co ?? "").trim(),
        date: m.groups.date.trim(),
      });
    } else {
      const dateOnly = p.match(/(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/);
      if (dateOnly) out.push({ name: "", company: "", date: dateOnly[1] });
    }
  }
  return out;
}

function toIsoLoose(s: string): string {
  const t = s.trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!m) return t;
  let [, d, mo, y] = m;
  if (y.length === 2) y = String(2000 + Number(y));
  const dd = String(Number(d)).padStart(2, "0");
  const mm = String(Number(mo)).padStart(2, "0");
  if (Number(dd) < 1 || Number(dd) > 31) return t;
  if (Number(mm) < 1 || Number(mm) > 12) return t;
  return `${y}-${mm}-${dd}`;
}

export async function POST() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const table = await fetchContractsTable();

  // 1) Field creates.
  const created: string[] = [];
  for (const [name, type] of [
    ["Signatory 1 Date", "singleLineText"] as const,
    ["Signatory 2 Date", "singleLineText"] as const,
    ["Comment", "multilineText"] as const,
  ]) {
    const r = await ensureField(table.id, name, type);
    if (r.created) created.push(name);
  }

  // 2) Walk contracts and build per-row patches.
  const rows = await listAllContracts();
  const updates: Array<{ id: string; fields: { [k: string]: unknown } }> = [];
  const trace: Array<{ id: string; changes: string[] }> = [];

  for (const row of rows) {
    const fields = row.fields;
    const changes: string[] = [];
    const patch: { [k: string]: unknown } = {};
    let keyTerms = asString(fields["Key Terms"]);
    const beforeKeyTerms = keyTerms;

    // Fold detailed terms into Key Terms.
    for (const [colName, label] of DETAILED_TERMS) {
      const raw = asString(fields[colName]).trim();
      if (!raw) continue;
      keyTerms = appendBullet(keyTerms, `${label}: ${raw}`);
    }
    if (keyTerms !== beforeKeyTerms) {
      patch["Key Terms"] = keyTerms;
      changes.push("keyTerms+=detailed");
    }

    // Clean Signature Date / Expiry Date and seed signatory dates when
    // the blob carries a "Name (Co): DD/MM/YYYY" pattern.
    const sigBlob = asString(fields["Signature Date"]).trim();
    if (sigBlob && /[|:]/.test(sigBlob)) {
      const segs = parseSignatoryDateBlob(sigBlob);
      if (segs.length > 0) {
        const sig1Date = asString(fields["Signatory 1 Date"]).trim();
        const sig2Date = asString(fields["Signatory 2 Date"]).trim();
        if (!sig1Date && segs[0]?.date) {
          patch["Signatory 1 Date"] = toIsoLoose(segs[0].date);
          changes.push("sig1Date");
        }
        if (!sig2Date && segs[1]?.date) {
          patch["Signatory 2 Date"] = toIsoLoose(segs[1].date);
          changes.push("sig2Date");
        }
        // Reduce Signature Date to a single ISO when possible.
        const firstDate = segs[0]?.date;
        if (firstDate) {
          patch["Signature Date"] = toIsoLoose(firstDate);
          changes.push("signatureDate");
        }
      }
    } else if (sigBlob) {
      // Plain date string. Normalize to ISO when parseable so the table
      // renders consistently.
      const iso = toIsoLoose(sigBlob);
      if (iso !== sigBlob && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        patch["Signature Date"] = iso;
        changes.push("signatureDate.normalized");
      }
    }

    const expBlob = asString(fields["Expiry Date"]).trim();
    if (expBlob && /[|:]/.test(expBlob)) {
      const segs = parseSignatoryDateBlob(expBlob);
      const firstDate = segs[0]?.date;
      if (firstDate) {
        patch["Expiry Date"] = toIsoLoose(firstDate);
        changes.push("expiryDate");
      }
    } else if (expBlob) {
      const iso = toIsoLoose(expBlob);
      if (iso !== expBlob && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        patch["Expiry Date"] = iso;
        changes.push("expiryDate.normalized");
      }
    }

    if (Object.keys(patch).length > 0) {
      updates.push({ id: row.id, fields: patch });
      trace.push({ id: row.id, changes });
    }
  }

  const patched = await patchInBatches(updates);

  return NextResponse.json({
    ok: true,
    createdFields: created,
    contractsScanned: rows.length,
    contractsPatched: patched,
    sample: trace.slice(0, 10),
  });
}
