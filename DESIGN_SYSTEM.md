# HTP42 Portal — Design System

The single source of truth for how the UI looks and behaves. **Before adding or
restyling any UI, reach for the shared component below instead of hand-rolling
markup.** If something you need isn't here, add it here first, then use it — do
not invent a one-off style at the call site. Consistency beats cleverness.

Everything is Tailwind + a small set of shared React components in
`src/components/`. There is no other CSS.

---

## 1. Color

The only brand color is a blue scale defined in `tailwind.config.ts` as
`brand.*` (brand-600 `#1E91F9` is the primary). Everything else is Tailwind
`slate` for neutrals. **Do not introduce raw `blue`, `sky`, `indigo`, `violet`,
`orange`, `teal`, etc. for UI chrome or status** — map onto the tokens below.

Semantic status color = one meaning, one color (see `Badge` tones):

| Meaning | Tone | Palette |
|---|---|---|
| Neutral / draft / not-started / inactive | `neutral` | slate-100 / slate-600 |
| Awaiting action / on hold / due / needs review | `warning` | amber-50 / amber-700 |
| In flight / active / scheduled / invoiced / in progress | `info` | brand-50 / brand-700 |
| Done / paid / won / completed / signed | `success` | emerald-100 / emerald-800 |
| Deleted / lost / failed / terminated / expired | `danger` | rose-50 / rose-700 |
| Cancelled / void | `cancelled` | slate + line-through |

Never show the same status word in two colors on two pages. Extend the map in
`src/components/badge.tsx` (`statusTone`) rather than coloring at the call site.

---

## 2. Typography & casing

- Base text is `text-slate-900` on `bg-slate-50` (set globally).
- **Page title (`h1`)**: `text-base sm:text-lg font-semibold` — via `<PageHeader>`.
- **Body / table**: `text-xs` in dense tables, `text-sm` in modals/forms.
- **Field labels & filter labels**: `text-[11px] uppercase tracking-wide font-medium text-slate-500`. This uppercase micro-label is the ONE label style — used by form inputs, filter dropdowns, and detail `<dt>`s.
- **Table headers (`thead`)**: `bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500`.
- **Muted / secondary copy**: `text-slate-500` (or `text-slate-400` for hints).
- **Sentence case** for buttons, options, and prose ("New payment", "Needs review") — NOT Title Case. Uppercase is reserved for the micro-labels above.
- Ban the em-dash in prose. Money is `toLocaleString("en-US", { maximumFractionDigits: 2 })` + currency.

---

## 3. Shape, spacing, elevation

- **Radius**: `rounded-md` for controls (inputs, buttons, chips); `rounded-lg`
  for cards/panels/table wrappers; `rounded-full` only for pills/badges and
  avatars. Never `rounded-xl`/`rounded-2xl` for app panels (modals may use
  `rounded-lg`).
- **Cards / table wrappers**: `rounded-lg border border-slate-200 bg-white`.
  Shadows are rare — reserve `shadow-sm` for the active segmented pill and
  popovers (`shadow-xl`). Panels do not carry shadows.
- **Page shell**: `<main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">`
  (detail/form pages may use `max-w-4xl`/`max-w-3xl`).

---

## 4. Buttons — `@/components/form-controls`

Use `<Button>` (renders `<button>`) or `<ButtonLink>` (renders `<a>`, same
look) — never hand-roll a `<button className="bg-brand-600 …">`.

- Tones: `primary` (brand-600 fill), `secondary` (white + slate border),
  `danger` (red outline), `ghost` (text only).
- Sizes: `sm` (`px-2.5 py-1 text-xs`), `md` (`px-3 py-1.5 text-sm`).
- Leading icons are children; icons come from `@/components/admin-icons`
  (`EditIcon`, `TrashIcon`, …) — do not redefine icon SVGs locally.
- Primary "New/Add" actions are `<Button tone="primary" size="sm">` with a `+`
  icon. No pill/`rounded-full`/`shadow` button variants.

---

## 5. Tabs & segmented controls

- **Admin section nav**: `<AdminTabs>` (two-level category → sub-page). Don't
  build page-level nav by hand.
- **In-page hub toggle / mutually-exclusive views** (e.g. Payments ↔ Review,
  Member ↔ Automated invoices, Inflow/Outflow/All): `<SegmentedTabs>` from
  `@/components/filters` — one slate `rounded-lg` track, active pill white with
  `shadow-sm`. Optional trailing `badge` (e.g. an amber count).

---

## 6. Filters — `@/components/filters`

Every filter section uses the same building blocks, laid out in a `<FilterBar>`:

- **`<SearchInput>`** (`@/components/search-input`) — the one search box:
  `rounded-md border-slate-300 pl-8 text-xs`, leading magnifier. Never a bespoke
  pill/`rounded-full`/`text-sm` search field.
- **`<FilterSelect label value onChange options allLabel>`** — labeled facet
  dropdown (status, kind, project, …). Uppercase micro-label + compact select;
  brand-tinted when active. Value `"All"` = no filter.
- **`<FilterDateRange label from to onFrom onTo>`** — calendar-backed date range.
- **`<SegmentedTabs>`** — for a small set of exclusive views (see §5).
- A **Reset** button (`<Button tone="secondary" size="sm">`) clears all filters,
  disabled when nothing is active.

Do NOT put facet filters as bespoke dropdowns inside `<thead>` cells, and do NOT
mix uppercase and sentence-case labels. One filter bar, one label style.

---

## 7. Calendar / dates — `@/components/date-picker` & `@/components/calendar-range`

- **Single date field** (forms/modals): `<DateField label value onChange>` — the
  app calendar popover. Never a raw `<input type="date">`.
- **Date range** (filters): `<FilterDateRange>` / `<CalendarRange>`.
- Display dates as `8 Jul 2026` (`toLocaleDateString("en-GB", { day:"numeric",
  month:"short", year:"numeric" })`).

---

## 8. Tables

- `<table className="w-full text-xs">` inside `rounded-lg border border-slate-200 bg-white` (+ `overflow-x-auto`).
- `<thead>`: `bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500`.
- Cells: `px-2 py-1.5` (keep `text-right`/`text-center` as needed).
- Rows: `border-t border-slate-100 hover:bg-slate-50`.
- **Expandable row pattern** (payments, invoices): leading chevron cell that
  rotates; row `onClick` toggles; expanded row shows a **read-only** `<dl>`
  detail panel. Interactive cells (chips, selects, action buttons) call
  `e.stopPropagation()`.
- **Row actions**: a document `<DownloadChip>` and a pencil `<EditIcon>` button
  on the right. **Edit opens a `<Modal>`; the modal footer has Delete pinned
  bottom-left (via `mr-auto`) and Cancel + Save on the right; Delete goes
  through `<ConfirmDialog>`.** Rows never carry a bare delete button.
- Empty state: `<td colSpan={N} className="text-center text-slate-500 py-10">`.

---

## 9. Badges — `@/components/badge`

`<Badge tone=…>` or `<StatusPill status="…">` (auto-tones from the text via
`statusTone`). Shape is `rounded-full border px-2 py-0.5 text-xs font-medium`.
Domain taxonomies that genuinely need more than the six tones (e.g. the
contract Side/Type/Stage/RAG pills) are the documented exception.

---

## 10. Modals — `@/components/modal`

`<Modal open onClose title size footer>` for edit/create; `<ConfirmDialog>` for
destructive confirms. Body is `text-sm`; footer is right-aligned actions with
Delete pinned left when present. Sizes `sm|md|lg|xl`.

---

## 11. Demo mode & privacy

Wrap sensitive values (names, amounts, rates, emails) in `className="demo-blur"`
so the admin demo toggle can blur them.

---

## Shared component index

| Need | Component | File |
|---|---|---|
| Page title + count | `PageHeader` | `page-header.tsx` |
| Section nav | `AdminTabs` | `admin-tabs.tsx` |
| View toggle | `SegmentedTabs` | `filters.tsx` |
| Search box | `SearchInput` | `search-input.tsx` |
| Facet dropdown | `FilterSelect` | `filters.tsx` |
| Date-range filter | `FilterDateRange` | `filters.tsx` |
| Filter row wrapper | `FilterBar` | `filters.tsx` |
| Button / link-button | `Button`, `ButtonLink` | `form-controls.tsx` |
| Text/select/textarea | `FormField`, `FormSelect`, `FormTextarea` | `form-controls.tsx` |
| Single date field | `DateField` | `date-picker.tsx` |
| Status pill | `Badge`, `StatusPill` | `badge.tsx` |
| Document open/download | `DownloadChip` | `download-chip.tsx` |
| Modal / confirm | `Modal`, `ConfirmDialog` | `modal.tsx` |
| Icons | `EditIcon`, `TrashIcon`, … | `admin-icons.tsx` |
