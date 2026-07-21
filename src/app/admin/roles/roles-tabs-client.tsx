"use client";

import { useState, type ComponentProps } from "react";
import { SegmentedTabs } from "@/components/filters";
import { RolesClient } from "./roles-client";
import { RequestsView } from "./requests-view";
import type { SupportTicketRecord } from "@/lib/airtable";

type RolesProps = ComponentProps<typeof RolesClient>;
type Tab = "roles" | "requests";

export function RolesTabsClient({
  rolesProps,
  tickets,
  canEdit,
}: {
  rolesProps: RolesProps;
  tickets: SupportTicketRecord[];
  canEdit: boolean;
}) {
  const [tab, setTab] = useState<Tab>("roles");
  const openCount = tickets.filter((t) => t.status !== "Resolved" && t.status !== "Closed").length;

  return (
    <div className="space-y-4">
      <SegmentedTabs
        ariaLabel="Settings section"
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        options={[
          { value: "roles", label: "Roles & access" },
          {
            value: "requests",
            label: "Requests",
            badge: openCount ? (
              <span className="inline-flex items-center rounded-full bg-slate-200 px-1.5 text-[10px] font-semibold text-slate-600">
                {openCount}
              </span>
            ) : undefined,
          },
        ]}
      />
      {tab === "roles" ? (
        <RolesClient {...rolesProps} />
      ) : (
        <RequestsView tickets={tickets} canEdit={canEdit} />
      )}
    </div>
  );
}
