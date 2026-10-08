@AGENTS.md

# Team Dashboard — notes for Claude

Read `HANDOVER.md` first (architecture, env vars, runbook).

## Rules
- Next.js 16 differs from older versions: `proxy.ts` replaces middleware; `params`/`searchParams` are Promises; read `node_modules/next/dist/docs/` before using an API you are unsure of.
- Never read or print `.env.local`; never put secrets in the repo, chat or commits.
- Anything live (applying a migration to Supabase, deploying, pushing, editing GHL workflows, running a backfill, switching on lead allocation) needs the owner's explicit "go" for that step.
- GHL access is read-only from this codebase (GET only).
- DB changes: new migration file only. Logic that must be correct under concurrency lives in SQL (`allocate_lead`, `convert_lead`, `hire_candidate`). Sending an email from a draft row goes through `claimSend`/`releaseSend` (`src/lib/server/send-claim.ts`).

## Map
- `src/lib/leads-core.ts` — pure parsing/classification/phone analysis (tested by `scripts/test-leads-core.mjs`).
- `src/lib/leads-ingest.ts` — idempotent ingest, GHL sync. `src/lib/server/leads.ts` — env wiring.
- `src/app/api/webhooks/ghl-lead/route.ts` — GHL webhook (fails closed). `src/app/api/health/route.ts`. `src/app/api/cron/daily/route.ts`.
- `src/app/(app)/leads/` — Leads UI + server actions. `src/proxy.ts` — auth guard (public paths listed there).
- `src/lib/ops-core.ts` — pure helpers for the ops automations: dates (Europe/Dublin), reminder stages, check-in cadence, templates, candidate parsing (tested by `scripts/test-ops-core.mjs`).
- `src/lib/server/ai.ts` — the only Anthropic call site (`aiText`, `aiJson`); callers fall back to templates when no key.
- `src/lib/server/{candidates,checkins,payments,daily-report}.ts` — server logic; pages in `src/app/(app)/{candidates,check-ins,payments,reports/daily}`.
- `src/app/api/webhooks/candidate/route.ts` — PIT form webhook (fails closed).
- `src/lib/areas.ts` + `getMyAreas`/`requireArea` (`src/lib/auth.ts`) + `requireActorArea` (`src/lib/server/rbac.ts`) — department access. Every new page/table must pick an area (RLS uses `public.has_area()`).
- `src/lib/server/sourci.ts` (tools/prompt) + `sourci-exec.ts` (confirmed changes) + `src/components/sourci.tsx` + `src/app/api/sourci/` — Donna, the voice assistant (files/routes still named `sourci`). Changes only via propose → user confirms → executeProposal.
- `src/lib/sheets.ts` + `src/app/(app)/sheets/` — Sheets (team trackers; RLS `sheet_access()`/`can_view_sheet()`, cell edits via `set_sheet_cell()`). `src/lib/server/staffing.ts` + `src/app/(app)/{roles,vas}/` — open roles, matching, hire → placement.
- Theme: tokens in `globals.css` (`html.dark` overrides). Use `bg-surface`/`text-ink`/`border-line`, not `bg-white`/slate, so dark mode works.
- `supabase/migrations/` — schema, RLS, `allocate_lead`. `supabase/demo_ops_*.sql` — demo data add/remove (not migrations).

## Check before saying done
`npx tsc --noEmit`, `npx eslint <files>`, `npm run build`, `node scripts/test-leads-core.mjs`, `node scripts/test-ops-core.mjs`, `node scripts/test-confirm-words.mjs`.
