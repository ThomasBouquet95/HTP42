"use client";

import { Tooltip } from "@/components/tooltip";
import type { NetworkLevel } from "@/lib/airtable";

// What each tier means, surfaced on hover so an admin can understand the ramp
// without leaving the page. Kept here (next to the colours) so the badge, the
// edit select and any legend stay in sync.
export const NETWORK_LEVEL_DESCRIPTIONS: Record<NetworkLevel, string> = {
  Guest:
    "Community member with access to the HTP42 network and community activities, but no contractual engagement yet.",
  Bronze:
    "Fully onboarded network member with an MSA signed and eligible to work on HTP42 engagements.",
  Silver:
    "Network member actively engaged on an HTP42 client project under a signed Statement of Work, whether T&M or fixed price.",
  Gold:
    "Network member with deeper project involvement, typically fixed-price delivery requiring more than 5 days of effort and access to additional HTP42 tools where needed.",
  Platinum:
    "Strategic/high-performing network member generating at least €100,000 in annual revenue from HTP42 engagements, with yearly access to the full HTP42 toolset.",
};

// One distinct, metallic-leaning treatment per tier. Guest is flat neutral;
// the earned tiers get a subtle gradient + a coloured "coin" dot so they read
// as a ramp (bronze → silver → gold → platinum) at a glance.
const LEVEL_PILL: Record<NetworkLevel, string> = {
  Guest: "border-slate-300 bg-slate-100 text-slate-700",
  Bronze: "border-amber-300 bg-amber-100 text-amber-900",
  Silver: "border-slate-300 bg-gradient-to-r from-slate-100 to-slate-200 text-slate-700",
  Gold: "border-yellow-400 bg-gradient-to-r from-yellow-100 to-amber-200 text-amber-900",
  Platinum: "border-indigo-300 bg-gradient-to-r from-violet-100 to-indigo-200 text-indigo-900",
};

const LEVEL_DOT: Record<NetworkLevel, string> = {
  Guest: "bg-slate-400",
  Bronze: "bg-amber-600",
  Silver: "bg-slate-500",
  Gold: "bg-yellow-500",
  Platinum: "bg-gradient-to-br from-violet-500 to-indigo-600",
};

export function NetworkLevelBadge({
  level,
  withTooltip = true,
  className,
}: {
  level: NetworkLevel;
  withTooltip?: boolean;
  className?: string;
}) {
  const pill = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${LEVEL_PILL[level]} ${withTooltip ? "" : (className ?? "")}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${LEVEL_DOT[level]}`} aria-hidden />
      {level}
    </span>
  );
  if (!withTooltip) return pill;
  return (
    <Tooltip
      className={className}
      content={
        <div>
          <div className="font-semibold text-white">{level}</div>
          <div className="mt-0.5 text-slate-200">{NETWORK_LEVEL_DESCRIPTIONS[level]}</div>
        </div>
      }
    >
      {pill}
    </Tooltip>
  );
}
