// Single source of truth for the look of every printable / Save-as-PDF report
// in the app (staffing timesheets, the filtered timesheets export, the member
// summary, and the team summary). Each print page renders
// <style>{PRINT_CSS}</style> so they all share the exact same chrome — brand
// header, total/stat boxes, tables, per-day timesheet blocks, status pills and
// print rules — instead of each keeping its own drifting copy.
export const PRINT_CSS = `
  :root { color-scheme: light; }
  body { margin: 0; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #0f172a; }
  .page { max-width: 1040px; margin: 0 auto; padding: 32px; background: white; }

  /* Header */
  .report-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; }
  .brand { font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #64748b; }
  h1 { font-size: 24px; margin: 4px 0 12px; }
  .meta { font-size: 12px; color: #334155; line-height: 1.6; }

  /* Totals + stat boxes */
  .total-box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 16px; text-align: right; min-width: 160px; }
  .total-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; }
  .total-value { font-size: 28px; font-weight: 700; color: #1d4ed8; margin-top: 2px; }
  .total-sub { font-size: 12px; color: #64748b; }
  .summary-boxes { display: flex; gap: 10px; flex-shrink: 0; }
  .stat-box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; text-align: center; min-width: 72px; }
  .stat-box.accent { background: #eff8ff; border-color: #bae0fd; }
  .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; }
  .stat-value { font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 2px; }
  .stat-value.warn { color: #b45309; }

  /* Progress bar (team summary) */
  .progress-bar-wrap { margin-bottom: 20px; }
  .progress-bar-labels { display: flex; justify-content: space-between; font-size: 11px; color: #64748b; margin-bottom: 4px; }
  .progress-bar-track { height: 6px; border-radius: 999px; background: #e2e8f0; overflow: hidden; }
  .progress-bar-fill { height: 100%; background: #1e91f9; border-radius: 999px; }
  .progress-bar-fill.over { background: #f59e0b; }

  /* Panels + section titles (member summary) */
  .breakdowns { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
  .panel { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; }
  .panel h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #334155; margin: 0 0 8px; }
  .section-title { font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; color: #334155; margin: 0 0 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  table.small, table.ts-table, table.list { font-size: 12px; }
  th, td { padding: 6px 8px; text-align: left; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  th { font-weight: 600; color: #475569; background: #f8fafc; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .bold, .strong { font-weight: 700; }
  .total-row td { border-top: 1px solid #cbd5e1; font-weight: 600; background: #f8fafc; }

  /* Per-timesheet blocks (staffing + filtered export) */
  .timesheet { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 14px; page-break-inside: avoid; }
  .ts-head, .ts-header { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; margin-bottom: 8px; }
  .ts-title { font-weight: 600; font-size: 14px; }
  .ts-member { font-weight: 600; font-size: 14px; }
  .ts-sub { font-size: 11px; color: #64748b; }
  .ts-week { font-size: 12px; color: #334155; white-space: nowrap; }
  .ts-table th { background: transparent; border-bottom: 1px solid #e2e8f0; }
  .day-cell { color: #475569; font-size: 11px; white-space: nowrap; }

  /* Member grouping (team summary) */
  .member-section { margin-bottom: 20px; page-break-inside: avoid; }
  .member-header { font-size: 13px; font-weight: 600; color: #1e3a5f; border-left: 3px solid #1e91f9; padding: 4px 8px; background: #f0f9ff; margin-bottom: 8px; }

  /* Status pills */
  .status { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; border: 1px solid; white-space: nowrap; }
  .status-draft { background: #f1f5f9; color: #334155; border-color: #cbd5e1; }
  .status-submitted { background: #fffbeb; color: #b45309; border-color: #fde68a; }
  .status-invoiced { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
  .status-paid { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
  .status-cancelled { background: #f1f5f9; color: #64748b; border-color: #cbd5e1; }
  .status-deleted { background: #fff7ed; color: #c2410c; border-color: #fed7aa; }

  /* Misc */
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: #475569; }
  .muted { color: #94a3b8; }
  .warn { color: #b45309; }
  .nowrap { white-space: nowrap; }
  .empty { font-size: 13px; color: #64748b; padding: 24px 0; text-align: center; }
  .report-footer { margin-top: 32px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; }

  @page { margin: 14mm; }
  @media print {
    body { background: white; }
    .no-print { display: none !important; }
    .page { max-width: none; padding: 0; }
    tr { page-break-inside: avoid; }
    thead { display: table-header-group; }
  }
`;
