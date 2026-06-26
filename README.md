# HTP42 Timesheets Portal

Internal portal for HTP42 consultants to log weekly timesheets against Airtable.

- **Framework:** Next.js 15 (App Router, React 19, TypeScript)
- **Styling:** Tailwind CSS
- **Auth:** Email magic link (custom, JWT session cookie — no extra database required)
- **Data:** Airtable REST API via the official `airtable` SDK, called exclusively from server routes
- **Deployment:** Vercel (recommended) or any Node.js host

## Features

- **Login:** Email-based magic link. The signup/login flow checks the `Network Members` table in Airtable — access is granted only if the email matches a record with `Status` = `Active` or `Partially Active`. Otherwise the user sees:
  > This email is not registered as a network member. Please contact your administrator.
- **Session:** The authenticated session is tied to the member's `Member Code` (used for all downstream queries).
- **Dashboard:** Lists all timesheets where `Member Code` matches the logged-in user, sorted by `Start Date` descending. Shows week range, staffing (code + project name), total hours, and status. Filters by status and project.
- **Timesheet creation:** The `Project Staffing` selector only shows staffings where `Member Code` matches the logged-in user, `Status` is `In Progress` or `Not Started`, and the selected week falls within the staffing's `Start/End Date` range. Duplicates for the same staffing + start date are rejected.
- **Five Mon–Fri paired fields:** hours (0–24, decimals) + task description. Save as Draft or Submit (Submit sets `Submission Date` = today).
- **Status transitions:** `Draft → Submitted`, `Draft → Deleted`, `Submitted → Deleted`. Drafts are editable, Submitted/Deleted are read-only, a Cancel button is offered on Submitted to move it to Deleted.

## Setup

### 1. Prerequisites

- Node.js 20+
- An Airtable Personal Access Token (PAT) with `data.records:read`, `data.records:write`, `schema.bases:read` scopes against the HTP42 Operations base.

### 2. Install

```bash
npm install
```

### 3. Environment variables

Copy `.env.example` to `.env.local` and fill in:

```
AIRTABLE_PAT=...
AIRTABLE_BASE_ID=appXXXXXXXXXXXXXX
AUTH_SECRET=<run: openssl rand -base64 48>
APP_URL=http://localhost:3000

# Required in production — leave empty in dev to log the magic link to the server console.
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM="HTP42 Timesheets <no-reply@htp42.example>"
```

The `AIRTABLE_PAT` is **never** exposed to the client — all Airtable calls go through `/api/*` route handlers running on the server.

### 4. Run locally

```bash
npm run dev
```

Visit <http://localhost:3000>. Log in with any email that is an `Active`/`Partially Active` Network Member. If SMTP is not configured, the magic link will appear in the terminal running `npm run dev`.

### 5. Typecheck and build

```bash
npm run typecheck
npm run build
```

## Deploying to Vercel

1. Push this repo to GitHub.
2. Import it in Vercel.
3. Add the environment variables from `.env.example` to the Vercel project settings (all as Production + Preview).
4. Set `APP_URL` to your production URL (e.g. `https://timesheets.htp42.example`).
5. Deploy.

## Airtable schema expectations

The code targets these exact field names in the configured base:

- **Network Members:** `Email`, `Member Code`, `Full Name`, `Status` (single-select: `Active` / `Partially Active` / `Inactive`)
- **Project Staffing:** `Staffing Code` (formula), `Project Code`, `Member Code` (linked), `Start Date`, `End Date`, `Status`
- **Projects:** `Project Code`, `Project Name`
- **Timesheets:** `Timesheet Code` (formula), `Member Code` (linked), `Project Staffing` (linked), `Start Date`, `End Date`, `Submission Date`, `Monday (hours)`, `Monday (task)`, ... `Friday (hours)`, `Friday (task)`, `Status`

The portal never writes to:

- `Timesheet Code` or `Staffing Code` (formulas — Airtable computes them)
- `Days Used` on Project Staffing (rollup — Airtable computes it)

## Scope & non-goals

- Weekend hours are not supported (the schema is Mon–Fri only).
- `Submit` is final — there is no approver step; the only way out of `Submitted` is `Deleted`.
- The portal is intended for consultants logging their own timesheets; there is no admin view.
