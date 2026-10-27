// Storage for the editable parts of the monthly-closing dashboard: per-line
// comment + last-reminder date, and the month's global close status. Everything
// else on the dashboard is derived live from the operational tables; only the
// human-maintained notes live here. Stored in a dedicated, lazily-created
// Airtable table so it's easy to inspect and safe to drop.

import { env } from "./env";

export type ClosingLine = {
  comment: string;
  lastReminderDate: string | null;
};

export type MonthStatus = {
  status: "In progress" | "Done" | "";
  comment: string;
};

const TABLE = "Monthly Close";
const F = {
  rowKey: "Row Key", // `${month}|${projectCode}|${memberCode}` or `${month}|__status__`
  month: "Month",
  memberCode: "Member Code",
  projectCode: "Project Code",
  comment: "Comment",
  lastReminderDate: "Last Reminder Date",
  monthStatus: "Month Status",
  statusComment: "Status Comment",
  updatedAt: "Updated At",
} as const;

const STATUS_SUFFIX = "__status__";
const lineKey = (month: string, projectCode: string, memberCode: string) =>
  `${month}|${projectCode}|${memberCode}`;
const statusKey = (month: string) => `${month}|${STATUS_SUFFIX}`;
// The row-model key used by closing.ts (project__member).
const modelKey = (projectCode: string, memberCode: string) => `${projectCode}__${memberCode}`;

const metaTablesUrl = () => `https://api.airtable.com/v0/meta/bases/${env.airtableBaseId}/tables`;
const dataUrl = () => `https://api.airtable.com/v0/${env.airtableBaseId}/${encodeURIComponent(TABLE)}`;
const authHeaders = () => ({ Authorization: `Bearer ${env.airtablePat}` });

let tableReady = false;

async function ensureTable(): Promise<boolean> {
  if (tableReady) return true;
  try {
    const res = await fetch(metaTablesUrl(), { headers: authHeaders(), cache: "no-store" });
    if (!res.ok) return false;
    const data = (await res.json()) as { tables: Array<{ name: string }> };
    if (data.tables.some((t) => t.name === TABLE)) {
      tableReady = true;
      return true;
    }
    const create = await fetch(metaTablesUrl(), {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        name: TABLE,
        description:
          "Editable tracking for the monthly-closing dashboard (per-line notes + month status). Derived figures are not stored here.",
        fields: [
          { name: F.rowKey, type: "singleLineText" },
          { name: F.month, type: "singleLineText" },
          { name: F.memberCode, type: "singleLineText" },
          { name: F.projectCode, type: "singleLineText" },
          { name: F.comment, type: "multilineText" },
          { name: F.lastReminderDate, type: "singleLineText" },
          { name: F.monthStatus, type: "singleLineText" },
          { name: F.statusComment, type: "multilineText" },
          { name: F.updatedAt, type: "singleLineText" },
        ],
      }),
    });
    if (create.ok) tableReady = true;
    else console.error("ensure Monthly Close table failed:", create.status, await create.text().catch(() => ""));
    return tableReady;
  } catch (e) {
    console.error("ensure Monthly Close table error:", e);
    return false;
  }
}

type Rec = { id: string; fields: Record<string, unknown> };

async function fetchMonthRecords(month: string): Promise<Rec[]> {
  const out: Rec[] = [];
  let offset: string | undefined;
  try {
    do {
      const url = new URL(dataUrl());
      url.searchParams.set("filterByFormula", `{${F.month}} = '${month.replace(/'/g, "")}'`);
      if (offset) url.searchParams.set("offset", offset);
      const res = await fetch(url, { headers: authHeaders(), cache: "no-store" });
      if (!res.ok) break;
      const data = (await res.json()) as { records: Rec[]; offset?: string };
      out.push(...data.records);
      offset = data.offset;
    } while (offset);
  } catch (e) {
    console.error("fetchMonthRecords error:", e);
  }
  return out;
}

// Everything the dashboard needs for a month: per-line notes (keyed project__member)
// + the month's close status.
export async function loadClosingTracking(
  month: string,
): Promise<{ lines: Map<string, ClosingLine>; status: MonthStatus }> {
  const lines = new Map<string, ClosingLine>();
  let status: MonthStatus = { status: "", comment: "" };
  if (!(await ensureTable())) return { lines, status };
  const records = await fetchMonthRecords(month);
  for (const r of records) {
    const f = r.fields;
    const key = String(f[F.rowKey] ?? "");
    if (key.endsWith(STATUS_SUFFIX)) {
      status = {
        status: (String(f[F.monthStatus] ?? "") as MonthStatus["status"]) || "",
        comment: String(f[F.statusComment] ?? ""),
      };
      continue;
    }
    const projectCode = String(f[F.projectCode] ?? "");
    const memberCode = String(f[F.memberCode] ?? "");
    if (!projectCode && !memberCode) continue;
    lines.set(modelKey(projectCode, memberCode), {
      comment: String(f[F.comment] ?? ""),
      lastReminderDate: String(f[F.lastReminderDate] ?? "") || null,
    });
  }
  return { lines, status };
}

// Find the record id for a given row key (so we update instead of duplicating).
async function findRecordId(rowKey: string): Promise<string | null> {
  try {
    const url = new URL(dataUrl());
    url.searchParams.set("filterByFormula", `{${F.rowKey}} = '${rowKey.replace(/'/g, "")}'`);
    url.searchParams.set("maxRecords", "1");
    const res = await fetch(url, { headers: authHeaders(), cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { records: { id: string }[] };
    return data.records[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function upsert(rowKey: string, fields: Record<string, unknown>): Promise<void> {
  if (!(await ensureTable())) throw new Error("Could not prepare the closing store.");
  const id = await findRecordId(rowKey);
  const body = JSON.stringify({
    fields: { [F.rowKey]: rowKey, ...fields, [F.updatedAt]: new Date().toISOString() },
    typecast: true,
  });
  const res = id
    ? await fetch(`${dataUrl()}/${id}`, { method: "PATCH", headers: { ...authHeaders(), "Content-Type": "application/json" }, body })
    : await fetch(dataUrl(), { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Could not save closing data (${res.status}). ${t}`);
  }
}

export async function saveClosingLine(
  month: string,
  projectCode: string,
  memberCode: string,
  line: ClosingLine,
): Promise<void> {
  await upsert(lineKey(month, projectCode, memberCode), {
    [F.month]: month,
    [F.projectCode]: projectCode,
    [F.memberCode]: memberCode,
    [F.comment]: line.comment,
    [F.lastReminderDate]: line.lastReminderDate ?? "",
  });
}

export async function saveMonthStatus(month: string, status: MonthStatus): Promise<void> {
  await upsert(statusKey(month), {
    [F.month]: month,
    [F.monthStatus]: status.status,
    [F.statusComment]: status.comment,
  });
}
