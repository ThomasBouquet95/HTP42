#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// FOUNDER-EARNINGS (temporary) — one-off migration for Pascal Bouquet (BOUPA1).
//
// WHY: Pascal owns HTP42 SAS and never actually charges it. To see his figures
// on the cockpit income statement he had been creating "Subcontractor" OUTFLOW
// payments and marking them "Paid" just to close them. Those fake payments are
// counted as real "Consulting & subcontractors" cost, which is wrong.
//
// WHAT THIS DOES (BOUPA1 only):
//   For every live outflow payment linked to member BOUPA1, it
//     1. creates a "Founder Earnings" record with the same amount / currency /
//        EUR value, dated to the payment's Invoice Date (so it lands in the
//        right year on the cockpit), and
//     2. CANCELS the original payment (status -> "Canceled") so it stops
//        counting as consulting cost. Canceling (not deleting) keeps the audit
//        trail and is reversible.
//   Net effect: his amount moves out of the shared consulting bucket into his
//   own "Pascal Bouquet" node. Total cost is unchanged; it's just relabeled.
//
// SAFETY:
//   • DRY RUN by default. Prints exactly what it would do. Pass --apply to write.
//   • Touches ONLY payments whose linked Member is BOUPA1.
//   • Idempotent: each created earning is tagged [mig-pay:<paymentId>]; re-runs
//     skip anything already migrated, and Canceled/Rejected payments are ignored.
//
// RUN:
//   AIRTABLE_PAT=pat... AIRTABLE_BASE_ID=app... node scripts/migrate-founder-earnings-boupa1.mjs
//   AIRTABLE_PAT=pat... AIRTABLE_BASE_ID=app... node scripts/migrate-founder-earnings-boupa1.mjs --apply
//
// Part of the removable founder-earnings feature — delete with it.
// ─────────────────────────────────────────────────────────────────────────

const MEMBER_CODE = "BOUPA1";
const MEMBER_NAME_FALLBACK = "Pascal Bouquet";
const APPLY = process.argv.includes("--apply");

const PAT = process.env.AIRTABLE_PAT;
const BASE = process.env.AIRTABLE_BASE_ID;
if (!PAT || !BASE) {
  console.error("Missing AIRTABLE_PAT or AIRTABLE_BASE_ID in the environment.");
  process.exit(1);
}

const EARNINGS_TABLE = "Founder Earnings";
const PAYMENTS_TABLE = "Payments";
const MEMBERS_TABLE = "Network Members";
const PROJECTS_TABLE = "Projects";

// Mirror src/lib/fx.ts so the EUR figure matches the app exactly.
const DEFAULT_FX_TO_EUR = { USD: 0.92, CHF: 1.04 };
function effectiveEur(p) {
  if (p.invoiceValueEur != null) return p.invoiceValueEur;
  if (p.invoiceValue == null) return 0;
  const isEur = p.invoiceCurrency === "EUR" || p.invoiceCurrency === "";
  if (isEur) return p.invoiceValue;
  const rate = p.fxRateToEur ?? DEFAULT_FX_TO_EUR[p.invoiceCurrency] ?? 1;
  return p.invoiceValue * rate;
}

const auth = { Authorization: `Bearer ${PAT}` };
const dataUrl = (table) => `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}`;
const metaUrl = () => `https://api.airtable.com/v0/meta/bases/${BASE}/tables`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function listAll(table, fields) {
  const out = [];
  let offset;
  do {
    const url = new URL(dataUrl(table));
    url.searchParams.set("pageSize", "100");
    for (const f of fields ?? []) url.searchParams.append("fields[]", f);
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url, { headers: auth });
    if (res.status === 404) return null; // table doesn't exist yet
    if (!res.ok) throw new Error(`GET ${table} failed ${res.status}: ${await res.text()}`);
    const data = await res.json();
    out.push(...data.records);
    offset = data.offset;
    if (offset) await sleep(220); // stay under Airtable's 5 req/s
  } while (offset);
  return out;
}

async function ensureEarningsTable() {
  const res = await fetch(metaUrl(), { headers: auth });
  if (!res.ok) throw new Error(`meta list failed ${res.status}`);
  const { tables } = await res.json();
  if (tables.some((t) => t.name === EARNINGS_TABLE)) return;
  const create = await fetch(metaUrl(), {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: EARNINGS_TABLE,
      description:
        "TEMPORARY: recorded earnings for a founder (no invoice/payment). Safe to delete with the founder-earnings feature.",
      fields: [
        { name: "Member Name", type: "singleLineText" },
        { name: "Member Code", type: "singleLineText" },
        { name: "Project Code", type: "singleLineText" },
        { name: "Amount", type: "number", options: { precision: 2 } },
        { name: "Currency", type: "singleLineText" },
        { name: "Amount EUR", type: "number", options: { precision: 2 } },
        { name: "Comment", type: "multilineText" },
        { name: "Submitted At", type: "singleLineText" },
      ],
    }),
  });
  if (!create.ok) throw new Error(`create ${EARNINGS_TABLE} failed ${create.status}: ${await create.text()}`);
  console.log(`Created "${EARNINGS_TABLE}" table.`);
}

const fmt = (n) => (n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 2 }));

async function main() {
  console.log(`\n${APPLY ? "APPLY" : "DRY RUN"} — founder-earnings migration for ${MEMBER_CODE}\n`);

  // 1. Resolve the member record id (payments link members by record id).
  const members = await listAll(MEMBERS_TABLE, ["Member Code", "Full Name"]);
  const member = (members ?? []).find((m) => m.fields["Member Code"] === MEMBER_CODE);
  if (!member) {
    console.error(`No member found with Member Code = ${MEMBER_CODE}. Aborting.`);
    process.exit(1);
  }
  const memberName = member.fields["Full Name"] || MEMBER_NAME_FALLBACK;
  console.log(`Member: ${memberName} (${member.id})`);

  // 2. Project record id -> Project Code, for labeling the earnings.
  const projects = await listAll(PROJECTS_TABLE, ["Project Code"]);
  const projectCode = new Map((projects ?? []).map((p) => [p.id, p.fields["Project Code"] ?? ""]));

  // 3. Already-migrated payment ids (idempotency), from the earnings table.
  const earnings = await listAll(EARNINGS_TABLE, ["Comment"]);
  const migrated = new Set();
  for (const e of earnings ?? []) {
    const m = String(e.fields["Comment"] ?? "").match(/\[mig-pay:(rec[A-Za-z0-9]+)\]/);
    if (m) migrated.add(m[1]);
  }
  if (earnings) console.log(`Earnings table exists; ${migrated.size} payment(s) already migrated.`);
  else console.log(`Earnings table does not exist yet${APPLY ? " — will be created." : "."}`);

  // 4. All outflows, filtered in JS to BOUPA1 + live status + not-yet-migrated.
  const payments = await listAll(PAYMENTS_TABLE, [
    "Payment Code", "Direction", "Type", "Member", "Project",
    "Invoice Date", "Invoice Currency", "Invoice Value", "FX Rate to EUR",
    "Invoice Value EUR", "Payment Status", "Beneficiary", "Comment",
  ]);

  const dead = new Set(["Canceled", "Rejected"]);
  const targets = [];
  const skipped = { migrated: 0, dead: 0, noDate: 0 };
  for (const r of payments ?? []) {
    const f = r.fields;
    if (f["Direction"] !== "Outflow") continue;
    const memberIds = Array.isArray(f["Member"]) ? f["Member"] : [];
    if (!memberIds.includes(member.id)) continue;
    if (migrated.has(r.id)) { skipped.migrated++; continue; }
    if (dead.has(f["Payment Status"])) { skipped.dead++; continue; }
    const eur = effectiveEur({
      invoiceValueEur: f["Invoice Value EUR"] ?? null,
      invoiceValue: f["Invoice Value"] ?? null,
      invoiceCurrency: f["Invoice Currency"] ?? "",
      fxRateToEur: f["FX Rate to EUR"] ?? null,
    });
    const projIds = Array.isArray(f["Project"]) ? f["Project"] : [];
    const pCode = projIds.map((id) => projectCode.get(id)).find(Boolean) ?? "";
    if (!f["Invoice Date"]) skipped.noDate++;
    targets.push({
      id: r.id,
      code: f["Payment Code"] ?? "",
      date: f["Invoice Date"] ?? "",
      currency: f["Invoice Currency"] ?? "",
      value: f["Invoice Value"] ?? null,
      eur,
      status: f["Payment Status"] ?? "",
      projectCode: pCode,
      comment: f["Comment"] ?? "",
    });
  }

  // 5. Report.
  targets.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  console.log(`\nOutflow payments to migrate: ${targets.length}`);
  console.log("(already migrated: " + skipped.migrated + ", canceled/rejected: " + skipped.dead + ")\n");
  if (targets.length) {
    console.log("  Payment Code      Date        Cur    Value        EUR          Status        Project");
    console.log("  " + "-".repeat(92));
    for (const t of targets) {
      console.log(
        "  " +
          String(t.code).padEnd(16) + "  " +
          String(t.date || "(no date)").padEnd(10) + "  " +
          String(t.currency || "—").padEnd(4) + "  " +
          fmt(t.value).padStart(10) + "  " +
          fmt(t.eur).padStart(10) + "  " +
          String(t.status || "—").padEnd(12) + "  " +
          String(t.projectCode || "—"),
      );
    }
    const totalEur = targets.reduce((s, t) => s + (t.eur || 0), 0);
    console.log("  " + "-".repeat(92));
    console.log(`  TOTAL EUR moved to "${memberName}" node: ${fmt(totalEur)}`);
  }
  if (skipped.noDate) {
    console.log(`\n⚠️  ${skipped.noDate} payment(s) have NO Invoice Date — they'll have no year on the cockpit. Review these.`);
  }

  if (!APPLY) {
    console.log(`\nDRY RUN complete. Re-run with --apply to write the changes.\n`);
    return;
  }
  if (!targets.length) {
    console.log(`\nNothing to migrate.\n`);
    return;
  }

  // 6. Apply: create earning, then cancel the payment. Sequential + throttled.
  await ensureEarningsTable();
  let done = 0;
  for (const t of targets) {
    const comment = `Migrated from payment ${t.code} (${t.status}).` +
      (t.comment ? ` Original note: ${t.comment}.` : "") + ` [mig-pay:${t.id}]`;
    const create = await fetch(dataUrl(EARNINGS_TABLE), {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          "Member Name": memberName,
          "Member Code": MEMBER_CODE,
          "Project Code": t.projectCode,
          "Amount": t.value,
          "Currency": t.currency,
          "Amount EUR": t.eur,
          "Comment": comment,
          "Submitted At": t.date ? new Date(t.date).toISOString() : "",
        },
        typecast: true,
      }),
    });
    if (!create.ok) {
      console.error(`  ✗ ${t.code}: failed to create earning ${create.status}: ${await create.text()}`);
      continue; // leave the payment untouched so a re-run can retry cleanly
    }
    await sleep(220);
    const cancel = await fetch(dataUrl(PAYMENTS_TABLE), {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        records: [{
          id: t.id,
          fields: {
            "Payment Status": "Canceled",
            "Payment Date": null,
            "Comment": (t.comment ? t.comment + " " : "") + "[migrated → Founder Earnings]",
          },
        }],
        typecast: true,
      }),
    });
    if (!cancel.ok) {
      console.error(`  ⚠ ${t.code}: earning created but CANCEL failed ${cancel.status}: ${await cancel.text()}`);
      console.error(`     -> cancel payment ${t.id} manually to avoid double counting.`);
      continue;
    }
    done++;
    console.log(`  ✓ ${t.code}  ${fmt(t.eur)} EUR  → earning created, payment canceled`);
    await sleep(220);
  }
  console.log(`\nDone. Migrated ${done}/${targets.length} payment(s).\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
