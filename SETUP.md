# Provisioning & first deploy

All three remote projects are **new and separate** from the live client-portal.
Nothing in this process touches `aldrin-lang/client-portal`, `client-portal-pqb7`,
`portal.outsourceforce.ai`, or Supabase `cjaqdxfqjxnepjentgwb`.

## 0. What you need to generate (one-time)

| Token | Where | Scope |
|---|---|---|
| Supabase access token | supabase.com/dashboard/account/tokens | full (personal) |
| Vercel token | vercel.com/account/settings/tokens | scope: team **tools-software** |
| GitHub | create empty repo `aldrin-lang/ai-receptionist-ops` **or** a PAT with `repo` |

## 1. Supabase project (region: Singapore / ap-southeast-1)

```bash
export SUPABASE_ACCESS_TOKEN=<token>
supabase projects create ai-receptionist-ops \
  --org-id <your-org-id> --region ap-southeast-1 --db-password '<generated>'
```

Then link and push the schema:

```bash
supabase link --project-ref <new-project-ref>
supabase db push          # applies supabase/migrations/*.sql
```

Copy from the dashboard → Project Settings → API into `.env.local` and Vercel:

- `SUPABASE_URL` (Project URL)
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Auth → Providers → Email: **disable "Enable sign ups"** (invite-only).
Auth → URL Configuration: set Site URL to the Vercel production URL.

## 2. GitHub

```bash
git remote add origin git@github.com:aldrin-lang/ai-receptionist-ops.git
git push -u origin main
```

## 3. Vercel project (team: tools-software)

```bash
export VERCEL_TOKEN=<token>
vercel link --scope tools-software --project ai-receptionist-ops --yes
vercel env add SUPABASE_URL production            # repeat for each var below
vercel env add SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add RESEND_API_KEY production
vercel env add EMAIL_FROM production
vercel env add APP_URL production                 # https://<project>.vercel.app
vercel env add CRON_SECRET production             # random string
vercel --prod
```

> The daily cron in `vercel.json` runs `GET /api/cron/daily`; Vercel sends
> `Authorization: Bearer $CRON_SECRET` automatically.

### Hobby plan note
Usage caps (functions, image optimisation, cron) are **shared across the whole
Vercel account**, so this project's load counts against client-portal's headroom.
The cron is deliberately daily. If you hit limits, upgrade to Pro rather than
trimming features.

## 4. Seed from the spreadsheet

With `.env.local` pointing at the new Supabase project:

```bash
npx tsx scripts/import-xlsx.ts "/Users/donaldrin/Downloads/External Hires Update - Roel Gomez (2).xlsx"
```

Review `import-report.csv` for rows that need manual cleanup. Re-runnable.

## 5. First admin user

1. Sign up is disabled, so create the first user in Supabase → Auth → Users → "Add user"
   (send invite). Use your own email.
2. In Supabase SQL editor: `update profiles set role = 'admin' where email = '<you>';`
3. Log in, go to **Admin**, invite the rest of the team.

## 6. Leads hub (added Oct 2026)
1. Apply `supabase/migrations/20261005000001_leads.sql` (SQL editor or CLI).
2. In Vercel set `CRON_SECRET`, `GHL_WEBHOOK_SECRET`, `GHL_API_TOKEN`, `GHL_LOCATION_ID` (see `.env.example`) and redeploy.
3. Create the GHL workflow and (optionally) run "Sync now" — details in `HANDOVER.md`.
4. An admin presses **Start allocating from now** on the Leads page when the team is ready.
