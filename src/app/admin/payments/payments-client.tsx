"use client";

import { useMemo, useState } from "react";
import type { PaymentRecord } from "@/lib/airtable";

type Filters = {
  direction: "All" | "Inflow" | "Outflow";
  status: string;
  currency: string;
  from: string;
  to: string;
};

const DEFAULT_FILTERS: Filters = {
  direction: "All",
  status: "All",
  currency: "All",
  from: "",
  to: "",
};

type Props = {
  payments: PaymentRecord[];
};

function formatMoney(value: number | null, currency: string): string {
  if (value == null) return "—";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}${
    currency ? " " + currency : ""
  }`;
}

export function PaymentsClient({ payments }: Props) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of payments) if (p.paymentStatus) set.add(p.paymentStatus);
    return [...set].sort();
  }, [payments]);

  const currencyOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of payments) if (p.invoiceCurrency) set.add(p.invoiceCurrency);
    return [...set].sort();
  }, [payments]);

  const filtered = useMemo(() => {
    return payments.filter((p) => {
      if (filters.direction !== "All" && p.direction !== filters.direction) return false;
      if (filters.status !== "All" && p.paymentStatus !== filters.status) return false;
      if (filters.currency !== "All" && p.invoiceCurrency !== filters.currency) return false;
      if (filters.from && (p.invoiceDate ?? "") < filters.from) return false;
      if (filters.to && (p.invoiceDate ?? "") > filters.to) return false;
      return true;
    });
  }, [payments, filters]);

  const totals = useMemo(() => {
    let inflowEur = 0;
    let outflowEur = 0;
    const inflowByCcy = new Map<string, number>();
    const outflowByCcy = new Map<string, number>();
    for (const p of filtered) {
      const amount = p.invoiceValue ?? 0;
      const eur = p.invoiceValueEur ?? 0;
      if (p.direction === "Inflow") {
        inflowEur += eur;
        inflowByCcy.set(
          p.invoiceCurrency || "—",
          (inflowByCcy.get(p.invoiceCurrency || "—") ?? 0) + amount,
        );
      } else if (p.direction === "Outflow") {
        outflowEur += eur;
        outflowByCcy.set(
          p.invoiceCurrency || "—",
          (outflowByCcy.get(p.invoiceCurrency || "—") ?? 0) + amount,
        );
      }
    }
    return {
      inflowEur,
      outflowEur,
      netEur: inflowEur - outflowEur,
      inflowByCcy: [...inflowByCcy.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      outflowByCcy: [...outflowByCcy.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    };
  }, [filtered]);

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function exportCsv() {
    const header = [
      "Payment Code",
      "Direction",
      "Type",
      "Project",
      "Client",
      "Member",
      "Invoice Date",
      "Invoice Reference",
      "Currency",
      "Invoice Value",
      "Invoice Value EUR",
      "Payment Terms",
      "Payment Status",
      "Payment Date",
      "Beneficiary",
      "Comment",
    ];
    const out: string[][] = [header];
    for (const p of filtered) {
      out.push([
        p.paymentCode,
        p.direction,
        p.type,
        p.projectCodes.join("; "),
        p.clientCodes.join("; "),
        p.memberCodes.join("; "),
        p.invoiceDate ?? "",
        p.invoiceReference,
        p.invoiceCurrency,
        p.invoiceValue == null ? "" : String(p.invoiceValue),
        p.invoiceValueEur == null ? "" : p.invoiceValueEur.toFixed(2),
        p.paymentTerms,
        p.paymentStatus,
        p.paymentDate ?? "",
        p.beneficiary,
        p.comment,
      ]);
    }
    const csv = out.map((r) => r.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `htp42-payments-${todayStamp()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Select
            label="Direction"
            value={filters.direction}
            onChange={(v) => update("direction", v as Filters["direction"])}
            options={[
              { value: "All", label: "All" },
              { value: "Inflow", label: "Inflow" },
              { value: "Outflow", label: "Outflow" },
            ]}
          />
          <Select
            label="Status"
            value={filters.status}
            onChange={(v) => update("status", v)}
            options={[
              { value: "All", label: "All statuses" },
              ...statusOptions.map((s) => ({ value: s, label: s })),
            ]}
          />
          <Select
            label="Currency"
            value={filters.currency}
            onChange={(v) => update("currency", v)}
            options={[
              { value: "All", label: "All currencies" },
              ...currencyOptions.map((c) => ({ value: c, label: c })),
            ]}
          />
          <DateInput label="From" value={filters.from} onChange={(v) => update("from", v)} />
          <DateInput label="To" value={filters.to} onChange={(v) => update("to", v)} />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="text-sm text-slate-600">
            {filtered.length} payment{filtered.length === 1 ? "" : "s"}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={filtered.length === 0}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Inflow (EUR)"
          value={totals.inflowEur.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          tone="positive"
        />
        <StatCard
          label="Outflow (EUR)"
          value={totals.outflowEur.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          tone="negative"
        />
        <StatCard
          label="Net (EUR)"
          value={totals.netEur.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          tone={totals.netEur >= 0 ? "positive" : "negative"}
          accent
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <BreakdownCard
          title="Inflow by currency"
          rows={totals.inflowByCcy.map(([ccy, amount]) => ({
            label: ccy,
            right: amount.toLocaleString("en-US", { maximumFractionDigits: 2 }),
          }))}
        />
        <BreakdownCard
          title="Outflow by currency"
          rows={totals.outflowByCcy.map(([ccy, amount]) => ({
            label: ccy,
            right: amount.toLocaleString("en-US", { maximumFractionDigits: 2 }),
          }))}
        />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Code</th>
              <th className="text-left px-4 py-2 font-medium">Direction</th>
              <th className="text-left px-4 py-2 font-medium">Type</th>
              <th className="text-left px-4 py-2 font-medium">Project</th>
              <th className="text-left px-4 py-2 font-medium">Counterparty</th>
              <th className="text-left px-4 py-2 font-medium">Invoice date</th>
              <th className="text-right px-4 py-2 font-medium">Amount</th>
              <th className="text-right px-4 py-2 font-medium">EUR</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="text-left px-4 py-2 font-medium">Paid on</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center text-slate-500 py-10">
                  No payments match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const counterparty =
                  p.direction === "Inflow"
                    ? p.clientCodes.join(", ") || "—"
                    : p.memberCodes.join(", ") || p.beneficiary || "—";
                return (
                  <tr key={p.id} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-2 font-mono text-xs">{p.paymentCode}</td>
                    <td className="px-4 py-2">
                      <DirectionPill direction={p.direction} />
                    </td>
                    <td className="px-4 py-2">{p.type || "—"}</td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {p.projectCodes.join(", ") || "—"}
                    </td>
                    <td className="px-4 py-2">{counterparty}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{p.invoiceDate ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatMoney(p.invoiceValue, p.invoiceCurrency)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {p.invoiceValueEur == null
                        ? "—"
                        : p.invoiceValueEur.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-2">{p.paymentStatus || "—"}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{p.paymentDate ?? "—"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DirectionPill({ direction }: { direction: string }) {
  if (!direction) return <span className="text-slate-400">—</span>;
  const cls =
    direction === "Inflow"
      ? "bg-green-50 text-green-700 border-green-200"
      : "bg-red-50 text-red-700 border-red-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {direction}
    </span>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block text-sm">
      <span className="block text-slate-600 mb-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="block text-slate-600 mb-1">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5"
      />
    </label>
  );
}

function StatCard({
  label,
  value,
  tone,
  accent,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
  accent?: boolean;
}) {
  const bg = accent
    ? "bg-brand-50 border-brand-200"
    : "bg-white border-slate-200";
  const valueColor =
    tone === "positive"
      ? "text-green-700"
      : tone === "negative"
      ? "text-red-700"
      : "text-slate-900";
  return (
    <div className={`rounded-lg border p-4 ${bg}`}>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueColor}`}>{value}</div>
    </div>
  );
}

function BreakdownCard({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; right: string }[];
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-2 text-sm font-semibold text-slate-800">
        {title}
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-slate-500">No data.</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center justify-between px-4 py-2 text-sm">
              <div className="font-medium text-slate-800">{r.label}</div>
              <div className="font-semibold tabular-nums text-slate-900">{r.right}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}
