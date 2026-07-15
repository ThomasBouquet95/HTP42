"use client";

import { useRouter } from "next/navigation";
import type { LeaderProjectInfo } from "@/lib/airtable";

type Props = {
  projects: LeaderProjectInfo[];
  activeCode: string | null;
};

export function ProjectSelector({ projects, activeCode }: Props) {
  const router = useRouter();
  return (
    <label className="block max-w-md">
      <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">Project</span>
      <select
        value={activeCode ?? ""}
        onChange={(e) => {
          const code = e.target.value;
          router.push(code ? `/timesheets/team?project=${encodeURIComponent(code)}` : "/timesheets/team");
        }}
        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
      >
        <option value="">Select a project</option>
        {projects.map((p) => (
          <option key={p.projectCode} value={p.projectCode}>
            {p.projectCode}
            {p.projectName ? `: ${p.projectName}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
