# AI Receptionist Ops

Internal team dashboard for running AI receptionist **and** virtual-assistant client
onboarding, plus post-go-live client concerns. Staff only — this is **not** the
client-facing portal.

Replaces the "AI Closed Sales / Onboarding Cal" spreadsheet tab.

## Stack

- Next.js 16 (App Router, Server Components + Server Actions)
- Supabase — Postgres, Auth (email + password, invite-only), RLS
- Resend — notification + digest email
- Vercel — hosting + one daily cron
- Tailwind CSS

This is a **brand-new project**, completely separate from `client-portal` /
`client-portal-pqb7` / Supabase `cjaqdxfqjxnepjentgwb`. Nothing here touches those.

## Features

| Area | What |
|---|---|
| My Desk | Your clients, tasks, past-SLA + stale flags, this week's go-lives |
| Pipeline | Kanban board, drag between stages, stage gates enforced |
| Clients | Filterable table + full detail page (systems, build checklist, commercials, updates feed) |
| Concerns | Post-go-live issue tracker with severity, owner, resolution, discussion |
| Reports | Stage timing, bottlenecks, go-lives/month, manager load, fees |
| Admin | Team + roles, pipeline stages & SLAs, dropdown options, audit log |
| Settings | Per-user notification preferences (in-app / email / digest cadence) |

## Local development

1. `npm install`
2. Create `.env.local` from `.env.example` and fill in the **new** Supabase project keys.
3. Apply the schema (see `SETUP.md`).
4. `npm run dev` → http://localhost:3000

## Key conventions

- **Runtime config**: the browser Supabase client reads its URL/key from
  `GET /api/public-config` at runtime, not from build-time `NEXT_PUBLIC_` inlining
  (unreliable on this Vercel account).
- **Audit trail**: every mutating Server Action calls `logActivity()`
  (`src/lib/server/activity.ts`) → `activity_log`, which powers the per-client and
  global updates feeds.
- **Stage gates**: `src/lib/server/gates.ts` blocks a client from moving past a stage
  until the required checklist items are `done`. Configure in Admin.
- **Auth guard**: `src/proxy.ts` (Next 16's renamed middleware).

See `SETUP.md` for provisioning the remote Supabase / GitHub / Vercel projects and
importing the spreadsheet.
