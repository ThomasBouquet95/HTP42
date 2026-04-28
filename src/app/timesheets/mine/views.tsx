"use client";

import { useState } from "react";
import type { TimesheetRecord } from "@/lib/airtable";
import { SummaryClient } from "@/app/summary/summary-client";
import { TimesheetsByWeekView } from "./by-week-view";

type View = "list" | "week";

type Props = {
  timesheets: TimesheetRecord[];
  memberLabel: string;
  memberCode: string;
};

export function MineViews({ timesheets, memberLabel, memberCode }: Props) {
  const [view, setView] = useState<View>("list");
  return (
    <div className="space-y-3">
      <ViewToggle value={view} onChange={setView} />
      {view === "list" ? (
        <SummaryClient
          timesheets={timesheets}
          memberLabel={memberLabel}
          memberCode={memberCode}
          editable
          defaultStatus="All"
          hideSummary
        />
      ) : (
        <TimesheetsByWeekView timesheets={timesheets} />
      )}
    </div>
  );
}

function ViewToggle({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  const tabs: { key: View; label: string }[] = [
    { key: "list", label: "By timesheet" },
    { key: "week", label: "By week" },
  ];
  return (
    <div className="inline-flex items-center rounded-md border border-slate-200 bg-white p-0.5 text-xs">
      {tabs.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            aria-pressed={active}
            className={`px-3 py-1 rounded font-medium transition-colors ${
              active
                ? "bg-brand-600 text-white"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
