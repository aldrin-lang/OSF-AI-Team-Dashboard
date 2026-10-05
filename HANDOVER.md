# Handover — OutsourceForce Team Dashboard

Read this first if you are maintaining the app and the original builder is not around.
Stack: Next.js 16 (App Router) on Vercel + Supabase (Postgres, Auth, Realtime) + Resend (email).
Repo layout, deploy steps and first-time provisioning: `SETUP.md`. This file covers **how it runs and what to do when it breaks**.

## What it is
One place for the team to work: **Leads** (AI Receptionist + VA, from GHL, round-robin to setters) -> **Clients** (onboarding checklist, pipeline) -> **Concerns**, **Reports**. Everyone signed in sees and edits the same data live.

## Accounts you need
| Thing | Where | Who has it |
|---|---|---|
| Vercel project `osf-ai-team-dashboard` (team tools-software) | vercel.com | _fill in_ |
| Supabase project (Singapore) | supabase.com | _fill in_ |
| GitHub repo | _fill in_ | _fill in_ |
| GHL sub-account OutsourceForce.ai, location `3OCKmBzU7auXzRIFfHOv` | app.gohighlevel.com | _fill in_ |
| Resend (email) | resend.com | _fill in_ |

Secrets live ONLY in Vercel env vars (and a local `.env.local` for development). Never in the repo, chat or Make blueprints.

## Environment variables (Vercel -> Settings -> Environment Variables)
See `.env.example` for the full list. After changing any, **redeploy**.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — database.
- `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL` — email links.
- `CRON_SECRET` — **required**. The daily job refuses to run without it. Vercel sends it automatically as `Authorization: Bearer`.
- `GHL_WEBHOOK_SECRET` — **required for leads**. Webhook refuses (503) without it.
- `GHL_API_TOKEN`, `GHL_LOCATION_ID`, `GHL_PIPELINE_ID` — read-only GHL access for "Sync now". Token needs `opportunities.readonly` and `contacts.readonly` only.
- `GOOGLE_CHAT_WEBHOOK_URL` — optional extra alert channel.
- `ANTHROPIC_API_KEY` — optional. Turns on the AI parts (candidate screening, check-in drafts and reply reading, daily report summary). Without it everything still works with plain templates. `AI_MODEL` overrides the model (default `claude-opus-5-5`, with Anthropic's server-side refusal fallback on).
- `EMAIL_REPLY_TO` — optional. Inbox that receives replies to check-ins and payment reminders (e.g. accounts@…). Set it, otherwise replies go to the `EMAIL_FROM` address.

## Leads: how it works
```
GHL (Opportunity created in "ALatest Leads")
   -> Workflow "Leads -> Dashboard" -> Webhook POST
   -> /api/webhooks/ghl-lead        (checks secret, parses, stores)
   -> allocate_lead() in Postgres   (round-robin: least-recently-assigned ACTIVE setter)
   -> Leads page + notification to that setter
Safety nets: "Sync now" button (read-only pull from GHL), daily heartbeat alert, /api/health.
```
- Each lead is keyed on the GHL opportunity id (or `contact:<id>`), so re-deliveries only refresh details — status, setter and notes are never overwritten.
- **Allocation switch** (`lead_settings.live_from`): while empty, leads are stored as *history* and nobody is assigned. An admin presses **Start allocating from now** on the Leads page; only leads created after that are auto-assigned.
- Setters are the `setters` table (Dean Murie, Scott, Jesse Maloy). Turn someone off (holiday) with the toggle on the Leads page; their leads stay theirs, new ones skip them. Link a setter to a dashboard login via `setters.profile_id` to get notifications.
- Service (AI / VA) is guessed from GHL tags (`ai…recept…` = AI; `va`, `appointment setter`, `premiumqs` = VA). Unknown ones show as "Unknown" — set manually.
- Phone numbers are shown as received. If a number looks wrongly coded (+353 followed by a long non-Irish number, e.g. a Philippine number) it is flagged with the suggested fix; it is never silently rewritten.

### The GHL workflow (create as a NEW draft; do not touch the live workflows or Make scenarios)
- Trigger: Opportunity Created, pipeline "ALatest Leads".
- Action: Webhook, POST, URL `https://<app-domain>/api/webhooks/ghl-lead`, header `x-webhook-secret: <GHL_WEBHOOK_SECRET>`.
- Custom data (key -> merge field): `contact_id` {{contact.id}}, `opportunity_id` {{opportunity.id}}, `name` {{contact.name}}, `email` {{contact.email}}, `phone` {{contact.phone}}, `source` {{contact.source}}, `tags` {{contact.tags}}, `va_role` (custom field), `job_description` (custom field), `assigned_to` {{opportunity.assigned_to}}, `created_at` {{opportunity.date_created}}.
- Test with one real lead; the response JSON shows `{ok, lead_id, created, historical, setter}`. The merge-field names above must be checked in the GHL picker — they are the part most likely to be slightly different.

## Ops automations (Candidates, Check-ins, Payments, Daily report)
Migration `20261006000001_ops_automations.sql` (additive). Demo data: `supabase/demo_ops_seed.sql`, removed by `supabase/demo_ops_remove.sql`.

**Candidates** (`/candidates`). GHL PIT form → workflow Webhook action → `POST /api/webhooks/candidate` (same `x-webhook-secret` as leads; send the form fields as custom data, or the full contact). The candidate is stored (keyed on GHL contact id, else email), screened by AI against the fixed role list (`VA_ROLES` in `src/lib/ops-core.ts`), and the recommendation goes to every manager/admin in-app and by email. Re-screen / send again / status from the candidate page. Manual add is on the list page.

**Check-ins** (`/check-ins`). Every morning, each live client (onboarding ones start once live) and each active VA placement whose cadence is up (default every 14 days, set per client/VA on the Schedule tab) gets a drafted check-in (AI-written if the key is set, max 10 per day, otherwise template). Nothing is sent automatically: someone edits and presses **Send email**, or **Open WhatsApp** (wa.me link with the message pre-filled, no WhatsApp API) then **I sent it on WhatsApp**. Paste the reply in; AI sets mood + summary + next step. "At risk" notifies managers and the client's manager. Client contact name/phone come from the lead the client was converted from.

**Payments** (`/payments`). Managers add invoices per client. Every morning a reminder is drafted for open invoices at: 3 days before due, due day, 3 / 7 / 14 days overdue (one per stage). Managers get one notification "N reminders ready", review, edit and send. Mark paid / void stops further reminders. Members can view; only managers/admins change invoices.

**Daily report** (`/reports/daily`). Built every morning for yesterday (Irish time): leads by service/source/setter, open/untouched/unassigned, clients, concerns, tasks, candidates, check-ins, payments. AI writes a short summary with "Needs attention"; emailed to managers/admins once per day. Managers can rebuild any day.

**Lead page extras.** Country (from phone prefix), Name of Ads / Code (typed in), and the GHL intake form + Peter's AI call notes (read-only GET from GHL, cached 15 min, "Refresh from GHL" button). Premium VA is its own service type (tag contains "premium").

## Departments (who sees what)
Migration `20261007000001_departments.sql`. Each person belongs to one or more departments (Sales, Marketing, Client Success, Operations, Recruitment, Accounts). Each department is given areas: Leads, Clients (Clients + Pipeline + Concerns), Check-ins, Candidates, Payments, Reports (Reports + Daily report). **Admins see everything.**
- Enforced in the database (`has_area()` in every RLS policy), in each page (`requireArea`) and in server actions that use the service role (`requireActorArea`). The menu only shows allowed tabs.
- **Admin page:** invite someone with a role + departments (they set their own password from the email); change anyone's departments; tick which areas each department sees.
- Roles inside a department: **member** works items; **manager** = department head (e.g. only managers in Accounts can add invoices / send reminders / mark paid).
- Alerts follow departments: payment reminders → Accounts, candidate recommendations → Recruitment, at-risk check-ins → Check-ins people + the client's manager, daily report → anyone with Reports (admins by default).
- Someone with no department sees a "not added to a department yet" page.

## Daily job
`/api/cron/daily` (Vercel cron, 07:00 UTC): stale-client nudges, **lead feed heartbeat** (alerts managers/admins if the webhook worked before but nothing arrived in 24h), check-ins due, payment reminder drafts, and yesterday's daily report email. Each step is isolated; the JSON response shows what each did. Vercel Hobby only allows daily crons.

## Runbook
| Symptom | Do this |
|---|---|
| New GHL leads not showing | Leads page -> **Sync now** (pulls last days from GHL). Then check the GHL workflow ran (Workflow -> Execution logs) and that `GHL_WEBHOOK_SECRET` matches the header. |
| Webhook returns 503 | `GHL_WEBHOOK_SECRET` not set in Vercel; set it and redeploy. |
| Webhook returns 401 | Secret in GHL differs from Vercel. |
| Webhook returns 422 | Payload had no contact/opportunity id — fix the merge fields in the GHL webhook action. |
| Leads not being assigned | Is allocation started (banner on Leads page)? Is at least one setter on? Press **Assign waiting leads**. |
| Wrong person got a lead | Change the setter on the lead (dropdown). Nothing else needed. |
| Site broken after a deploy | Vercel -> Deployments -> previous good one -> **Promote / Redeploy**. Then look at the failing commit. |
| No emails | Check `RESEND_API_KEY`, sender domain verified in Resend. |
| Candidate not appearing | GHL workflow execution log → webhook response. 401 = secret, 422 = no contact id/email/name in the payload. |
| AI parts say "not switched on" | Set `ANTHROPIC_API_KEY` in Vercel and redeploy. |
| Check-in / reminder "Send" fails | Resend not configured, or no email on the client/invoice. Use WhatsApp for check-ins. |
| "Is it alive?" | Open `/api/health` (should show `{ok:true}`). With `?key=<CRON_SECRET>` it also shows last webhook time and unassigned count. Point an uptime monitor at it. |

## Making changes safely
1. `npm install`, copy `.env.example` to `.env.local` (ask the owner for dev keys), `npm run dev`.
2. Before pushing: `npx tsc --noEmit`, `npx eslint <changed files>`, `npm run build`, `node scripts/test-leads-core.mjs`, `node scripts/test-ops-core.mjs`.
3. Database changes = a NEW file in `supabase/migrations/` (never edit applied ones); apply in Supabase SQL editor or CLI.
4. Push to `main` -> Vercel deploys. Claude Code can maintain this repo: open it in the folder and read `CLAUDE.md`.

## Known limits
- The dashboard's setter allocation and the Google Sheet column E rotation are separate until the sheet is fed from the dashboard (planned next integration).
- GHL's own opportunity "assigned to" is shown for information only.
