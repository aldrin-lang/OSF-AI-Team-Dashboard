@AGENTS.md

# Team Dashboard — notes for Claude

Read `HANDOVER.md` first (architecture, env vars, runbook).

## Rules
- Next.js 16 differs from older versions: `proxy.ts` replaces middleware; `params`/`searchParams` are Promises; read `node_modules/next/dist/docs/` before using an API you are unsure of.
- Never read or print `.env.local`; never put secrets in the repo, chat or commits.
- Anything live (applying a migration to Supabase, deploying, pushing, editing GHL workflows, running a backfill, switching on lead allocation) needs the owner's explicit "go" for that step.
- GHL access is read-only from this codebase (GET only).
- DB changes: new migration file only. Logic that must be correct under concurrency (e.g. lead allocation) lives in SQL (`allocate_lead`).

## Map
- `src/lib/leads-core.ts` — pure parsing/classification/phone analysis (tested by `scripts/test-leads-core.mjs`).
- `src/lib/leads-ingest.ts` — idempotent ingest, GHL sync. `src/lib/server/leads.ts` — env wiring.
- `src/app/api/webhooks/ghl-lead/route.ts` — GHL webhook (fails closed). `src/app/api/health/route.ts`. `src/app/api/cron/daily/route.ts`.
- `src/app/(app)/leads/` — Leads UI + server actions. `src/proxy.ts` — auth guard (public paths listed there).
- `supabase/migrations/` — schema, RLS, `allocate_lead`.

## Check before saying done
`npx tsc --noEmit`, `npx eslint <files>`, `npm run build`, `node scripts/test-leads-core.mjs`.
