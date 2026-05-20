"use client";

import { useState } from "react";
import type { MonthBucket } from "@/lib/earnings";

// Bar chart for the consultant's last 12 months of earnings. Pure SVG so we
// stay zero-dependency. Bars are stacked: solid brand for paid, lighter wash
// for pending. Hover (or focus) any bar to see the project-level breakdown.
export function EarningsChart({
  months,
  current,
}: {
  months: MonthBucket[];
  // Highlight the current month with a different stroke.
  current: string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Round the y-axis to a clean number above the tallest bar so the bars
  // don't fill the entire frame.
  const maxRaw = Math.max(
    1,
    ...months.map((m) => m.paidEur + m.pendingEur),
  );
  const max = niceCeiling(maxRaw);

  // SVG layout. Scales to its container via viewBox.
  // Tight aspect ratio so the card doesn't dominate the page height —
  // height matches roughly one stat-card row.
  const W = 720;
  const H = 150;
  const padLeft = 42;
  const padRight = 8;
  const padTop = 10;
  const padBottom = 22;
  const innerW = W - padLeft - padRight;
  const innerH = H - padTop - padBottom;
  const slot = innerW / months.length;
  const barW = Math.min(36, slot * 0.62);

  const yFor = (v: number) => padTop + innerH - (v / max) * innerH;

  // Gridlines at 0, 25, 50, 75, 100% of max.
  const gridSteps = [0, 0.25, 0.5, 0.75, 1];

  const hovered = hoverIdx != null ? months[hoverIdx] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full h-auto"
        role="img"
        aria-label="Monthly earnings over the last 12 months"
      >
        <defs>
          <pattern
            id="pendingHatch"
            patternUnits="userSpaceOnUse"
            width="6"
            height="6"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" fill="#dbeafe" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#93c5fd" strokeWidth="2" />
          </pattern>
        </defs>

        {/* Gridlines + y labels */}
        {gridSteps.map((s) => {
          const v = max * s;
          const y = yFor(v);
          return (
            <g key={s}>
              <line
                x1={padLeft}
                x2={W - padRight}
                y1={y}
                y2={y}
                stroke="#f1f5f9"
                strokeWidth="1"
              />
              <text
                x={padLeft - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-slate-400"
                fontSize="9"
              >
                {formatEurShort(v)}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {months.map((m, i) => {
          const x = padLeft + i * slot + (slot - barW) / 2;
          const paidH = (m.paidEur / max) * innerH;
          const pendingH = (m.pendingEur / max) * innerH;
          const yPending = yFor(m.paidEur + m.pendingEur);
          const yPaid = yFor(m.paidEur);
          const isCurrent = m.key === current;
          const isHover = hoverIdx === i;
          return (
            <g
              key={m.key}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx((h) => (h === i ? null : h))}
              onFocus={() => setHoverIdx(i)}
              onBlur={() => setHoverIdx((h) => (h === i ? null : h))}
              tabIndex={0}
              role="button"
              aria-label={`${m.label}: ${formatEur(m.paidEur + m.pendingEur)} (paid ${formatEur(m.paidEur)}, pending ${formatEur(m.pendingEur)})`}
              className="outline-none"
            >
              {/* Hit area covers the full slot so hover is forgiving. */}
              <rect
                x={padLeft + i * slot}
                y={padTop}
                width={slot}
                height={innerH}
                fill="transparent"
              />
              {pendingH > 0 ? (
                <rect
                  x={x}
                  y={yPending}
                  width={barW}
                  height={pendingH}
                  fill="url(#pendingHatch)"
                  stroke={isHover ? "#1E91F9" : "transparent"}
                  strokeWidth="1.5"
                  rx="2"
                />
              ) : null}
              {paidH > 0 ? (
                <rect
                  x={x}
                  y={yPaid}
                  width={barW}
                  height={paidH}
                  fill={isCurrent ? "#1474d0" : "#1E91F9"}
                  stroke={isHover ? "#0d5ca6" : "transparent"}
                  strokeWidth="1.5"
                  rx="2"
                />
              ) : null}
              {/* Empty months still get a tiny baseline tick so the row
                  doesn't look broken. */}
              {paidH + pendingH === 0 ? (
                <rect
                  x={x}
                  y={padTop + innerH - 2}
                  width={barW}
                  height="2"
                  fill="#e2e8f0"
                  rx="1"
                />
              ) : null}
              <text
                x={x + barW / 2}
                y={H - 6}
                textAnchor="middle"
                fontSize="9"
                className={`fill-slate-${isCurrent ? "700" : "500"}`}
                fontWeight={isCurrent ? 600 : 400}
              >
                {m.label.split(" ")[0]}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip / breakdown card. Slides in above the hovered bar. */}
      {hovered ? (
        <div className="absolute right-0 top-0 z-10 max-w-xs rounded-lg border border-slate-200 bg-white p-3 shadow-md text-xs">
          <div className="font-semibold text-slate-900">{hovered.label}</div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="text-slate-500">Total</span>
            <span className="font-semibold tabular-nums text-slate-900">
              {formatEur(hovered.paidEur + hovered.pendingEur)}
            </span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="inline-block h-2 w-2 rounded-sm bg-brand-600" />
              Paid
            </span>
            <span className="tabular-nums">{formatEur(hovered.paidEur)}</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="inline-block h-2 w-2 rounded-sm bg-blue-200 ring-1 ring-blue-300" />
              Pending
            </span>
            <span className="tabular-nums">{formatEur(hovered.pendingEur)}</span>
          </div>
          {hovered.byProject.length > 0 ? (
            <div className="mt-2 border-t border-slate-100 pt-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">
                Top projects
              </div>
              <ul className="mt-1 space-y-0.5">
                {hovered.byProject.map((p, idx) => (
                  <li key={idx} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 truncate">
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${
                          p.status === "paid" ? "bg-brand-600" : "bg-blue-300"
                        }`}
                      />
                      <span className="font-mono text-[10px] text-slate-500">
                        {p.code}
                      </span>
                      <span className="truncate">{p.name}</span>
                    </span>
                    <span className="tabular-nums">{formatEur(p.eur)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Legend row below the chart, kept tight. */}
      <div className="mt-1 flex items-center gap-3 text-[10px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-brand-600" />
          Paid
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-blue-200 ring-1 ring-blue-300" />
          Pending
        </span>
        <span className="ml-auto text-[10px] text-slate-400">
          Hover a bar for project breakdown
        </span>
      </div>
    </div>
  );
}

function niceCeiling(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  let step: number;
  if (norm <= 1) step = 1;
  else if (norm <= 2) step = 2;
  else if (norm <= 5) step = 5;
  else step = 10;
  return step * mag;
}

function formatEur(v: number): string {
  return `${v.toLocaleString("en-US", { maximumFractionDigits: 0 })} €`;
}

function formatEurShort(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(v >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(v));
}
