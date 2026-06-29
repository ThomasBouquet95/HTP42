import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-shot helper that renames the Contracts columns the portal no
// longer reads or writes, prefixing them with "Archived · " so an admin
// can see at a glance which fields are safe to delete in Airtable.
// Idempotent — fields already prefixed are skipped. Admin-gated.
//
// We rename rather than delete so no data is lost: the detailed-terms
// content was migrated into Key Terms, but the originals stay until a
// human confirms and removes them by hand.
//
// NOT touched:
//   - "Project Code" is the table's PRIMARY field — Airtable won't let
//     it be deleted, and it still feeds the contract search box + the
//     upload-notification email. So it stays as-is.
//   - All live fields (Side, Contract Type, Stage, Signatory 1/2 *,
//     Signature/Expiry Date, Key Terms, Comment, PDF, the linked
//     Client / Project / Member records).

const PREFIX = "Archived · ";

// Field names the portal has stopped using. Matched by their current
// Airtable name.
const ORPHAN_FIELD_NAMES = [
  "Company / Consultant",
  "Contact Type",
  "Signatory",
  "Contact Details",
  "Effective Date",
  "Duration",
  "Notice Period",
  "Non-Solicitation",
  "Validity",
  "Confidentiality",
  "Intellectual Property",
  "Exclusivity",
  "Governing Law / Jurisdiction",
  "Consultant Visibility",
  "Specific Clauses / Comments",
  "Contract Status",
];

type AirtableField = { id: string; name: string };
type AirtableTable = { id: string; name: string; fields: AirtableField[] };

export async function POST() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const baseId = env.airtableBaseId;
  const pat = env.airtablePat;

  // 1) Read the table schema to resolve field ids.
  const metaUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${pat}` },
    cache: "no-store",
  });
  if (!metaRes.ok) {
    const text = await metaRes.text().catch(() => "");
    return NextResponse.json(
      { error: `Meta fetch failed (${metaRes.status}): ${text}` },
      { status: 502 },
    );
  }
  const data = (await metaRes.json()) as { tables: AirtableTable[] };
  const table = data.tables.find((t) => t.name === "Contracts");
  if (!table) {
    return NextResponse.json({ error: "Contracts table not found" }, { status: 404 });
  }

  const renamed: string[] = [];
  const skipped: string[] = [];
  const notFound: string[] = [];

  for (const name of ORPHAN_FIELD_NAMES) {
    const field = table.fields.find((f) => f.name === name);
    if (!field) {
      notFound.push(name);
      continue;
    }
    if (field.name.startsWith(PREFIX)) {
      skipped.push(name);
      continue;
    }
    const patchUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${table.id}/fields/${field.id}`;
    const res = await fetch(patchUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${pat}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: `${PREFIX}${name}` }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        {
          error: `Rename of "${name}" failed (${res.status}): ${text}`,
          renamedSoFar: renamed,
        },
        { status: 502 },
      );
    }
    renamed.push(name);
  }

  return NextResponse.json({
    ok: true,
    renamed,
    skipped,
    notFound,
    note: 'Fields prefixed with "Archived · " are safe to delete in Airtable once you have confirmed the data is captured elsewhere. "Project Code" was intentionally left alone (primary field + still used).',
  });
}
