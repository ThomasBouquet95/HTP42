"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { IncomeFlow, FlowItem } from "./income-flow";

// A hand-rolled SVG Sankey ("income statement" flow), styled after the
// classic revenue -> gross -> cost-items infographic. Left column = revenue
// by client, center = gross-revenue trunk, right column = cost categories +
// net result. Each ribbon is a constant-thickness band; the trunk edges are
// tiled continuously while the side columns carry small gaps between nodes, so
// the ribbons fan out the way a Sankey should.
//
// Interactive: hovering any node or ribbon highlights that flow (dims the
// rest) and shows a floating tooltip; clicking pins the highlight so it
// survives on touch devices where there's no hover.

const CLIENT_COLORS = [
  "#1E91F9",
  "#0ea5e9",
  "#14b8a6",
  "#6366f1",
  "#8b5cf6",
  "#0891b2",
  "#3b82f6",
  "#a855f7",
];
const REVENUE_COLOR = "#1E91F9";
const REVENUE_KEY = "__revenue__";
const COST_COLORS: Record<string, string> = {
  consulting: "#f97316",
  expenses: "#f59e0b",
  other: "#ef4444",
};
const PROFIT_COLOR = "#16a34a";
const LOSS_COLOR = "#dc2626";

const NODE_W = 18;
const TRUNK_H = 420; // height of the continuous gross-revenue trunk
const GAP = 12; // vertical gap between stacked side nodes
const PAD_TOP = 46;
const PAD_BOTTOM = 26;
const LEFT_LABEL_W = 172;
const RIGHT_LABEL_W = 196;
const DIM = 0.18;

function useContainerWidth(initial = 760): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setWidth(Math.floor(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function eur(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `€${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `€${(n / 1_000).toFixed(1)}k`;
  return `€${n.toFixed(0)}`;
}

// A constant-thickness bezier band between two vertical edges.
function ribbonPath(x0: number, yTop0: number, x1: number, yTop1: number, thick: number): string {
  const yBot0 = yTop0 + thick;
  const yBot1 = yTop1 + thick;
  const cx = (x0 + x1) / 2;
  return [
    `M ${x0} ${yTop0}`,
    `C ${cx} ${yTop0}, ${cx} ${yTop1}, ${x1} ${yTop1}`,
    `L ${x1} ${yBot1}`,
    `C ${cx} ${yBot1}, ${cx} ${yBot0}, ${x0} ${yBot0}`,
    "Z",
  ].join(" ");
}

type LaidNode = FlowItem & {
  y: number;
  h: number;
  color: string;
  tone?: "profit" | "loss";
};

type TipInfo = {
  title: string;
  kind: string;
  value: number;
  meta: string;
  color: string;
  tone?: "profit" | "loss";
};

export function IncomeSankey({ flow }: { flow: IncomeFlow }) {
  const [ref, width] = useContainerWidth();
  // Hovered flow key (drives the tooltip); pinned survives mouse-out / touch.
  const [active, setActive] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);

  const model = useMemo(() => {
    const { revenue, clients, costs, net } = flow;
    if (revenue <= 0 && costs.length === 0) return null;

    const leftScale = revenue > 0 ? TRUNK_H / revenue : 0;

    // Right column = cost categories + a net node. Heights use |value| and are
    // scaled to also fill the trunk, so the picture always balances visually
    // even when running at a loss (exact € live in the labels).
    type RightRaw = {
      key: string;
      label: string;
      value: number;
      absv: number;
      color: string;
      tone?: "profit" | "loss";
    };
    const rightRaw: RightRaw[] = [
      ...costs.map((c) => ({
        key: c.key,
        label: c.label,
        value: c.value,
        absv: c.value,
        color: COST_COLORS[c.key] ?? "#ef4444",
      })),
      {
        key: "__net__",
        label: net >= 0 ? "Net profit" : "Net loss",
        value: net,
        absv: Math.abs(net),
        color: net >= 0 ? PROFIT_COLOR : LOSS_COLOR,
        tone: net >= 0 ? "profit" : "loss",
      },
    ];
    const rightSum = rightRaw.reduce((s, r) => s + r.absv, 0) || 1;
    const rightScale = TRUNK_H / rightSum;

    // Side columns are TRUNK_H of node plus the gaps between them; center each
    // column (and the trunk) on the same vertical midline.
    const leftColH = TRUNK_H + Math.max(0, clients.length - 1) * GAP;
    const rightColH = TRUNK_H + Math.max(0, rightRaw.length - 1) * GAP;
    const maxColH = Math.max(TRUNK_H, leftColH, rightColH);
    const centerY = PAD_TOP + maxColH / 2;
    const trunkTop = centerY - TRUNK_H / 2;

    const clientNodes: LaidNode[] = [];
    let cy = centerY - leftColH / 2;
    clients.forEach((c, i) => {
      const h = c.value * leftScale;
      clientNodes.push({ ...c, y: cy, h, color: CLIENT_COLORS[i % CLIENT_COLORS.length] });
      cy += h + GAP;
    });

    const rightNodes: LaidNode[] = [];
    let ry = centerY - rightColH / 2;
    rightRaw.forEach((r) => {
      const h = r.absv * rightScale;
      rightNodes.push({ key: r.key, label: r.label, value: r.value, y: ry, h, color: r.color, tone: r.tone });
      ry += h + GAP;
    });

    const svgH = PAD_TOP + maxColH + PAD_BOTTOM;
    return { clientNodes, rightNodes, revenue, net, trunkTop, svgH };
  }, [flow]);

  if (!model) {
    return (
      <div ref={ref} className="w-full">
        <div className="py-12 text-center text-sm text-slate-500">
          No revenue recorded for this scope yet.
        </div>
      </div>
    );
  }

  const { clientNodes, rightNodes, revenue, net, trunkTop, svgH } = model;
  const chartW = Math.max(600, width);

  const leftX = LEFT_LABEL_W;
  const revX = Math.round((chartW - NODE_W) / 2);
  const rightX = chartW - RIGHT_LABEL_W - NODE_W;

  const pct = (v: number) => (revenue > 0 ? `${Math.round((Math.abs(v) / revenue) * 100)}%` : "—");
  const marginPct = revenue > 0 ? Math.round((net / revenue) * 100) : 0;

  // Focus = pinned selection, else whatever's hovered. Nothing focused (or the
  // trunk focused) => the whole picture stays lit.
  const focus = pinned ?? active;
  const isDim = (key: string) => focus != null && focus !== key && focus !== REVENUE_KEY;

  // Tooltip content for the hovered element (hover only — pin just highlights).
  // Cheap lookup over small arrays; kept as a plain value so it isn't a hook
  // after the early return above.
  const tipInfo: TipInfo | null = (() => {
    if (!active) return null;
    if (active === REVENUE_KEY) {
      return {
        title: "Gross revenue",
        kind: "Total inflows",
        value: revenue,
        meta: `Net ${net >= 0 ? "profit" : "loss"} margin ${marginPct}%`,
        color: REVENUE_COLOR,
      };
    }
    const c = clientNodes.find((n) => n.key === active);
    if (c) {
      return { title: c.label, kind: "Client revenue", value: c.value, meta: `${pct(c.value)} of revenue`, color: c.color };
    }
    const r = rightNodes.find((n) => n.key === active);
    if (r) {
      return {
        title: r.label,
        kind: r.tone ? "Result" : "Cost",
        value: r.value,
        meta: r.tone ? `${marginPct}% margin` : `${pct(r.value)} of revenue`,
        color: r.color,
        tone: r.tone,
      };
    }
    return null;
  })();

  const hoverProps = (key: string) => ({
    onMouseEnter: () => setActive(key),
    onClick: () => setPinned((p) => (p === key ? null : key)),
    style: { cursor: "pointer" as const },
  });

  // Trunk edges are tiled continuously in node order; the side ends sit at each
  // node's own (gapped) vertical position, so the ribbons fan.
  let leftEdge = trunkTop;
  const clientRibbons = clientNodes.map((n) => {
    const seg = { key: n.key, yTop0: n.y, yTop1: leftEdge, thick: n.h, color: n.color };
    leftEdge += n.h;
    return seg;
  });
  let rightEdge = trunkTop;
  const rightRibbons = rightNodes.map((n) => {
    const seg = { key: n.key, yTop0: rightEdge, yTop1: n.y, thick: n.h, color: n.color };
    rightEdge += n.h;
    return seg;
  });

  return (
    <div ref={ref} className="relative w-full">
      <div
        className="w-full overflow-x-auto"
        onMouseMove={(e) => {
          const el = ref.current;
          if (!el) return;
          const rect = el.getBoundingClientRect();
          setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        }}
        onMouseLeave={() => {
          setActive(null);
          setTip(null);
        }}
      >
        <svg
          width={chartW}
          height={svgH}
          role="img"
          aria-label="Income statement flow: revenue by client to net result"
          style={{ display: "block" }}
        >
          <defs>
            {clientRibbons.map((r, i) => (
              <linearGradient key={`lg-c-${i}`} id={`grad-c-${i}`} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor={r.color} stopOpacity="0.55" />
                <stop offset="100%" stopColor={REVENUE_COLOR} stopOpacity="0.4" />
              </linearGradient>
            ))}
            {rightRibbons.map((r, i) => (
              <linearGradient key={`lg-r-${i}`} id={`grad-r-${i}`} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor={REVENUE_COLOR} stopOpacity="0.4" />
                <stop offset="100%" stopColor={r.color} stopOpacity="0.55" />
              </linearGradient>
            ))}
          </defs>

          {/* Background: clicking empty space clears a pin, entering it clears hover. */}
          <rect
            x={0}
            y={0}
            width={chartW}
            height={svgH}
            fill="transparent"
            onMouseEnter={() => setActive(null)}
            onClick={() => setPinned(null)}
          />

          {/* Ribbons: clients -> revenue */}
          {clientRibbons.map((r, i) => (
            <path
              key={`c-${i}`}
              d={ribbonPath(leftX + NODE_W, r.yTop0, revX, r.yTop1, r.thick)}
              fill={`url(#grad-c-${i})`}
              opacity={isDim(r.key) ? DIM : 1}
              {...hoverProps(r.key)}
            />
          ))}
          {/* Ribbons: revenue -> right */}
          {rightRibbons.map((r, i) => (
            <path
              key={`r-${i}`}
              d={ribbonPath(revX + NODE_W, r.yTop0, rightX, r.yTop1, r.thick)}
              fill={`url(#grad-r-${i})`}
              opacity={isDim(r.key) ? DIM : 1}
              {...hoverProps(r.key)}
            />
          ))}

          {/* Revenue trunk node (never dims — the flow runs through it) */}
          <g {...hoverProps(REVENUE_KEY)}>
            <rect x={revX} y={trunkTop} width={NODE_W} height={TRUNK_H} rx={3} fill={REVENUE_COLOR} />
            <text x={revX + NODE_W / 2} y={trunkTop - 24} textAnchor="middle" fontSize="13" fontWeight="700" fill="#0f172a">
              Gross revenue
            </text>
            <text
              x={revX + NODE_W / 2}
              y={trunkTop - 8}
              textAnchor="middle"
              fontSize="13"
              fontWeight="700"
              fill={REVENUE_COLOR}
              className="tabular-nums"
            >
              {eur(revenue)}
            </text>
          </g>

          {/* Client nodes + labels (left) */}
          {clientNodes.map((n) => {
            const mid = n.y + n.h / 2;
            const showValue = n.h >= 20;
            return (
              <g key={n.key} opacity={isDim(n.key) ? DIM : 1} {...hoverProps(n.key)}>
                <rect x={leftX} y={n.y} width={NODE_W} height={Math.max(1, n.h)} rx={3} fill={n.color} />
                <text x={leftX - 10} y={showValue ? mid - 3 : mid + 3.5} textAnchor="end" fontSize="12" fontWeight="600" fill="#334155">
                  {truncate(n.label, 22)}
                </text>
                {showValue ? (
                  <text x={leftX - 10} y={mid + 12} textAnchor="end" fontSize="11" fill="#64748b" className="tabular-nums">
                    {eur(n.value)} · {pct(n.value)}
                  </text>
                ) : null}
              </g>
            );
          })}

          {/* Right nodes + labels (costs + net) */}
          {rightNodes.map((n) => {
            const mid = n.y + n.h / 2;
            const showValue = n.h >= 20;
            const labelColor = n.tone === "profit" ? PROFIT_COLOR : n.tone === "loss" ? LOSS_COLOR : "#334155";
            return (
              <g key={n.key} opacity={isDim(n.key) ? DIM : 1} {...hoverProps(n.key)}>
                <rect x={rightX} y={n.y} width={NODE_W} height={Math.max(1, n.h)} rx={3} fill={n.color} />
                <text
                  x={rightX + NODE_W + 10}
                  y={showValue ? mid - 3 : mid + 3.5}
                  textAnchor="start"
                  fontSize="12"
                  fontWeight={n.tone ? "700" : "600"}
                  fill={labelColor}
                >
                  {truncate(n.label, 30)}
                </text>
                {showValue ? (
                  <text
                    x={rightX + NODE_W + 10}
                    y={mid + 12}
                    textAnchor="start"
                    fontSize="11"
                    fill={n.tone ? labelColor : "#64748b"}
                    className="tabular-nums"
                  >
                    {n.tone === "loss" ? `(${eur(Math.abs(n.value))})` : eur(n.value)} · {pct(n.value)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Floating tooltip (follows the cursor, clamped inside the card) */}
      {tipInfo && tip ? (
        <div
          className="pointer-events-none absolute z-10 w-max max-w-[240px] rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg"
          style={{
            left: Math.min(tip.x + 14, chartW - 180),
            top: Math.max(tip.y - 12, 0),
          }}
        >
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: tipInfo.color }} />
            <span className="text-xs font-semibold text-slate-800">{tipInfo.title}</span>
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">{tipInfo.kind}</div>
          <div
            className={`mt-1 text-sm font-semibold tabular-nums ${
              tipInfo.tone === "profit"
                ? "text-green-700"
                : tipInfo.tone === "loss"
                  ? "text-red-700"
                  : "text-slate-900"
            }`}
          >
            {tipInfo.tone === "loss" ? `(${eur(Math.abs(tipInfo.value))})` : eur(tipInfo.value)}
          </div>
          <div className="text-[11px] text-slate-500">{tipInfo.meta}</div>
        </div>
      ) : null}

      <p className="mt-1 px-1 text-[11px] text-slate-400">
        Hover a client, cost or the trunk to highlight its flow; click to pin. Net {net >= 0 ? "profit" : "loss"}{" "}
        margin:{" "}
        <span className={net >= 0 ? "text-green-700" : "text-red-700"}>
          {revenue > 0 ? `${marginPct}%` : "—"}
        </span>
        .
      </p>
    </div>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
