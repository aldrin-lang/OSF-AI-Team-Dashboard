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

## Service switch: VA first, AI on the side
The dashboard is VA-outsourcing first; AI receptionist is the smaller side. A switch under the logo (**VA · AI · All**, cookie `osf-service`, default VA) filters every page: Leads (service va/premium or ai; unknown shows on both), Clients, Pipeline (one board per pipeline), Concerns, Check-ins, Payments (invoices via the client's pipeline), Reports, My desk, and Donna (prompt + recommendations). VA side = full menu and a violet accent; AI side = Leads, Clients, Pipeline, Payments. View filter only (no access change). Code: `src/lib/service.ts`, `src/lib/server/service.ts` (`getService`, `scopeClientIds`), `src/components/service-switch.tsx`, `[data-service="va"]` in globals.css.
- VA client pipeline restored by migration `20261009000001_va_pipeline.sql` (stages Sale closed → Interview scheduled → VA matched → Start scheduled → Active/Inactive, VA checklist, gate on "VA matched"). Gates only apply within their own pipeline; moving a client into the other pipeline's stage is refused. VA/Premium leads convert into VA clients. VA client pages show open roles + placements instead of phone lines.

## Sheets (team trackers inside the CRM)
Migration `20261008000001_sheets_and_staffing.sql`. **Sheets** in the menu (everyone). Like a shared Google Sheet: pick a template (Daily KPIs, Experiments, Content calendar, Ad spend & leads, VA hours log, Blank), then edit in place.
- Column types: text, number, money (per-column currency), date, dropdown (coloured choices), checkbox, person (team member), link. Footer shows sums/averages, % ticked, top dropdown values.
- Keyboard like Sheets: click + type, Enter/F2 edit, Tab/arrows move, Delete clears, Cmd/Ctrl+C copies, **paste a block from Google Sheets/Excel** (adds rows as needed). Sort, search, resize/move/rename/retype columns, delete rows, CSV export, duplicate, archive.
- **Live:** teammates' edits appear instantly and you see who's in the sheet and which cell they're on (Supabase Realtime presence). Single-cell edits go through `set_sheet_cell()` so two people editing the same row don't overwrite each other.
- **Sharing:** Only me / Whole team / Departments / Specific people. Anyone it's shared with can edit rows and columns; only the owner (or an admin) can rename, share, archive or delete. Enforced by RLS (`sheet_access()`, `can_view_sheet()`), not just the UI.
- Code: `src/lib/sheets.ts` (types, parsing, templates), `src/lib/server/sheets.ts` (create from template), `src/app/(app)/sheets/` (list, `[id]/grid.tsx` editor; the grid writes with the browser Supabase client under RLS).

## VA staffing (Open roles + VAs)
- **Open roles** (`/roles`, Recruitment's Candidates area; the Clients area can view): a client's request to hire (role, how many, type, hours, budget, start-by, priority, recruiter, requirements). Each role has a board: Shortlisted → Interview → Offered → Hired, plus **best matches** from the candidate pool (AI recommended role + AI score + keyword fit, `fitScore()` in `src/lib/server/staffing.ts`).
- **Hire** creates the VA placement on the client (name, email, phone, CV, role, start date, rate, hours), marks the candidate hired, sets the role to Filled when every seat is taken, logs it on the client and notifies the Clients team. VA check-ins then start on their own.
- **VAs** (`/vas`, Clients area): every placed VA across clients with start date/tenure, rate, hours, last check-in mood and next check-in; edit details inline. Placements gained `candidate_id, role_id, start_date, end_date, hourly_rate, rate_currency, hours_per_week, notes`.
- Recruitment can't read the clients table, so client names on roles come from the service role (`clientNames()`), only after the area check.

## Dark mode
Sidebar: the icon next to the logo (or ⌘\) collapses the menu to an icon rail (remembered per browser, `osf-sidebar`). Header button cycles Light → Dark → Match my device (remembered per browser, `localStorage osf-theme`). Set before first paint by the inline script in `src/app/layout.tsx` (`src/lib/theme.ts`). Colours are tokens in `globals.css` (`html.dark` overrides `--color-bg/surface/ink/line…`); use `bg-surface`, `text-ink`, `border-line` etc. in new UI rather than `bg-white`/slate. The login page stays light.

## Donna (voice assistant; code name `sourci`)
A glowing **orb** bottom-right for **admins only**. Click it or press **Option/Alt+S** to switch Donna **on**: it then keeps listening (between answers, while dashboards are open, through silence) until you click again, press Esc twice or say "that's all" (auto-off after 10 min of silence; a green dot shows it's on). **Interrupt** by talking over it or clicking the orb while it speaks (`isUserSpeech()` tells your voice from its own echo). Voice mode shows no captions; text appears only when typing, muted or on errors. The orb glows/pulses while listening, spins while working, ripples while speaking. Short answers appear in a bubble; dashboards (payments, leads, check-ins, candidates, clients), charts, briefs, the pipeline and confirmations pop up in a **window in the middle of the page** with clickable rows. **Conversation mode:** after answering a spoken question it listens again; "thanks"/"stop", silence, Esc or clicking the orb ends it. Thinking level: `OPENAI_REASONING` (minimal|low|medium|high, default low); model: `OPENAI_MODEL` (default gpt-5-mini) and a fast path (tools return a ready `say` sentence, so most questions need one AI round). Keyboard icon = type instead. Esc closes.
- `POST /api/sourci`: OpenAI (`OPENAI_API_KEY`, `OPENAI_MODEL`, default gpt-5-mini) with tools. **Reads** go through the signed-in user's Supabase client (RLS + departments). It can open pages, draw charts, show cards (meeting brief), show the pipeline.
- **Changes are proposals only.** `propose_*` tools build a confirmation card; nothing is written until the user says/clicks "yes", which calls `POST /api/sourci/confirm` → `executeProposal()` in `src/lib/server/sourci-exec.ts` (re-validates everything, writes with the user's own permissions). Supported: update lead (status/setter/note), create client, client note, task, invoice paid/void (managers), candidate status, send email (Resend), team reminder (notifications + email). No deletes, no money movement.
- Voice: `POST /api/sourci/speak` streams ElevenLabs (`ELEVENLABS_API_KEY`; model `ELEVENLABS_MODEL` default eleven_flash_v2_5). Female voices chosen from the orb's voice picker (Lily default, Sarah, Alice, Matilda, Jessica, Laura; `src/lib/sourci-voices.ts`), looked up by name on the account; `ELEVENLABS_VOICE_ID` overrides with a fixed/custom voice. Playback starts on the first streamed chunk (MediaSource, `src/components/sourci-audio.ts`); the orb scales with her voice / your mic; soft chimes on on/off/done. Out of credit or no key → best female browser voice. Free plan = 10k credits/month (~100-200 replies), Starter ~$5/month = 30k.
- **Feel:** if an answer takes >0.7 s she says a short cached acknowledgement ("On it.", recorded once per voice, kept in the browser cache: no credits after that); interrupted speech fades out and the history keeps only what was actually said; voice settings tuned for conversation (style 0). Big/outward changes (emails, invoices, reminders, hires, conversions, 20+ records) need "confirm" or a click, not just "yes".
- **Names:** the mic sends up to 3 alternative hearings; `resolve_name` fuzzy/sound-alike matches against clients, leads, candidates, VAs, team and setters (`src/lib/fuzzy.ts`) so misheard names get "Did you mean…?". **Memory:** "remember…" / "forget…" (per browser, `remember`/`forget` tools). Server logs `[sourci] … in Nms, tools: …` per turn for latency checks.
- **Greeting + recommendations:** first switch-on each day says hello with the top priorities (`__hello__` → `sourciHello()`, no AI call). `recommendations` ranks what needs attention across the user's areas with a suggested action each (`recommend()` in sourci.ts).
- **General engine** (`src/lib/server/sourci-records.ts`): `search_records` and `propose_bulk_update` work on leads, clients, invoices, candidates, check-ins, concerns and tasks via a field registry (`ENTITIES`: filterable + editable fields, side effects, logging). To expose a new field, add it to the registry. Specific multi-step jobs: move stage (uses the normal stage-gate rules), convert lead, create invoice/concern, send all reminder drafts / due check-ins (max 25), today's briefing, daily report, and `log_wish` (unknown requests are sent to admins as a notification).
- **Bulk actions** (all confirm first, show the count, max 1,000 records; "all"/"every" works without a filter via `all_records`): change any editable field on leads, clients, invoices, candidates, check-ins, concerns, tasks, VAs, roles, role candidates (`propose_bulk_update`; field lists are generated from the registry); share records out evenly between people (`propose_distribute`); one task per record, assigned to each record's owner (`propose_bulk_tasks`); personalised group email, max 50 (`propose_bulk_email`); invoices for a group of clients, fixed amount or daily rate × days (`propose_bulk_invoices`, managers); convert won AI leads (`propose_bulk_convert`); re-screen candidates (`propose_bulk_rescreen`); several sheet rows; mark notifications read. **Undo:** every bulk change snapshots the old values; say "undo" or press Undo on the done card (`restore` proposal, limited to the entity's editable columns, same permissions).
- Sheets + staffing: `sheets_overview`, `read_sheet`, `propose_sheet_row` ("log 40 calls and 3 bookings for me today in Daily KPIs"), `propose_create_sheet`, `roles_summary`, `role_matches`, `vas_summary`, `propose_open_role`, `propose_shortlist`, `propose_hire`.
- Add an ability: a tool in `TOOLS` + a case in `runTool` (`src/lib/server/sourci.ts`); for a change, also a `SourciProposal` kind + a case in `executeProposal`.

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
