-- ============================================================================
-- Ops automations: lead extras, candidate screening, client/VA check-ins,
-- payment reminders and the manager daily report.
--
-- Everything here is additive (new types, tables and nullable columns), so it
-- can be applied to a live database without touching existing data.
-- Remove with: drop the tables/types below and the added lead/client columns.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Leads: Premium VA type + the fields France fills in the sheet
-- (ADD VALUE is not used anywhere else in this file, so it is safe in one run)
-- ---------------------------------------------------------------------------
alter type lead_service add value if not exists 'premium';

alter table leads
  add column if not exists country           text,   -- from the phone prefix
  add column if not exists ad_name           text,   -- "Name of Ads" (manual)
  add column if not exists ad_code           text,   -- "Code" e.g. BOFU-PRA-LM-1800 (manual)
  add column if not exists intake_form       text,   -- Client AI Intake Form (from GHL)
  add column if not exists call_notes        text,   -- Peter's call result (from GHL)
  add column if not exists extras_synced_at  timestamptz;

-- ---------------------------------------------------------------------------
-- Candidates (PIT form -> AI screening -> role recommendation)
-- ---------------------------------------------------------------------------
create type candidate_status as enum ('new', 'screened', 'shortlisted', 'interview', 'hired', 'rejected');

create table candidates (
  id                   uuid primary key default gen_random_uuid(),
  external_key         text unique,          -- GHL contact id or form submission id (dedupe)
  full_name            text not null default '',
  email                text,
  phone                text,
  country              text,
  source               text,                 -- job platform they applied through
  applied_role         text,
  experience           text,
  hourly_rate          text,
  availability         text,                 -- part time / full time
  cv_url               text,
  portfolio_url        text,
  answers              jsonb not null default '{}',  -- every PIT form answer, as received
  ai_score             int check (ai_score between 0 and 100),
  ai_recommended_role  text,
  ai_alt_roles         text[] not null default '{}',
  ai_summary           text,
  ai_strengths         text[] not null default '{}',
  ai_concerns          text[] not null default '{}',
  ai_screened_at       timestamptz,
  ai_error             text,
  status               candidate_status not null default 'new',
  recommendation_sent_at timestamptz,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index candidates_status_idx  on candidates (status);
create index candidates_created_idx on candidates (created_at desc);
create trigger candidates_touch before update on candidates
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Check-ins (clients and placed VAs)
-- ---------------------------------------------------------------------------
create type checkin_kind   as enum ('client', 'va');
create type checkin_status as enum ('due', 'sent', 'replied', 'done', 'skipped');
create type checkin_mood   as enum ('good', 'neutral', 'at_risk');

alter table clients
  add column if not exists checkin_every_days int not null default 14 check (checkin_every_days between 3 and 90),
  add column if not exists checkin_paused     boolean not null default false;

alter table va_placements
  add column if not exists checkin_every_days int not null default 14 check (checkin_every_days between 3 and 90),
  add column if not exists checkin_paused     boolean not null default false,
  add column if not exists va_phone           text;

create table checkins (
  id            uuid primary key default gen_random_uuid(),
  kind          checkin_kind not null,
  client_id     uuid not null references clients(id) on delete cascade,
  placement_id  uuid references va_placements(id) on delete cascade,   -- set for VA check-ins
  subject_key   uuid generated always as (coalesce(placement_id, client_id)) stored,
  due_on        date not null,
  contact_name  text,
  contact_email text,
  contact_phone text,
  channel       text not null default 'email' check (channel in ('email', 'whatsapp', 'call')),
  status        checkin_status not null default 'due',
  subject       text,
  message       text,                 -- AI-drafted, editable before sending
  sent_at       timestamptz,
  sent_by       uuid references profiles(id) on delete set null,
  reply         text,                 -- pasted/typed reply from the client or VA
  mood          checkin_mood,
  ai_summary    text,
  follow_up     text,                 -- suggested next step
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (kind, subject_key, due_on)
);
create index checkins_status_idx on checkins (status, due_on);
create index checkins_client_idx on checkins (client_id);
create trigger checkins_touch before update on checkins
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Invoices + payment reminders
-- ---------------------------------------------------------------------------
create type invoice_status as enum ('open', 'paid', 'void');

create table invoices (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  number        text not null unique,
  description   text,
  amount        numeric(12,2) not null check (amount >= 0),
  currency      text not null default 'GBP' check (currency in ('GBP', 'EUR', 'NZD', 'AUD', 'CAD', 'USD')),
  issued_on     date not null default current_date,
  due_on        date not null,
  status        invoice_status not null default 'open',
  paid_on       date,
  bill_to_email text,                 -- falls back to the client's contact email
  notes         text,
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (due_on >= issued_on)
);
create index invoices_status_due_idx on invoices (status, due_on);
create index invoices_client_idx     on invoices (client_id);
create trigger invoices_touch before update on invoices
  for each row execute function public.touch_updated_at();

create table payment_reminders (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references invoices(id) on delete cascade,
  stage       text not null check (stage in ('before_due', 'due_today', 'overdue_3', 'overdue_7', 'overdue_14', 'manual')),
  subject     text not null,
  body        text not null,
  status      text not null default 'draft' check (status in ('draft', 'sent', 'skipped')),
  sent_at     timestamptz,
  sent_by     uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index payment_reminders_one_per_stage
  on payment_reminders (invoice_id, stage) where stage <> 'manual';
create index payment_reminders_invoice_idx on payment_reminders (invoice_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Manager daily report (one row per Dublin calendar day)
-- ---------------------------------------------------------------------------
create table daily_reports (
  id           uuid primary key default gen_random_uuid(),
  report_date  date not null unique,
  metrics      jsonb not null,
  summary      text,
  emailed_at   timestamptz,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS — same model as the rest of the app. Money and the daily report are
-- readable by everyone on the team; only managers/admins change invoices.
-- ---------------------------------------------------------------------------
alter table candidates        enable row level security;
alter table checkins          enable row level security;
alter table invoices          enable row level security;
alter table payment_reminders enable row level security;
alter table daily_reports     enable row level security;

create policy candidates_select on candidates for select using (public.is_active_member());
create policy candidates_write  on candidates for all
  using (public.is_active_member()) with check (public.is_active_member());

create policy checkins_select on checkins for select using (public.is_active_member());
create policy checkins_write  on checkins for all
  using (public.is_active_member()) with check (public.is_active_member());

create policy invoices_select on invoices for select using (public.is_active_member());
create policy invoices_write  on invoices for all
  using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

create policy reminders_select on payment_reminders for select using (public.is_active_member());
create policy reminders_write  on payment_reminders for all
  using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

create policy daily_reports_select on daily_reports for select using (public.is_active_member());

grant select, insert, update, delete on candidates, checkins, invoices, payment_reminders to authenticated;
grant select on daily_reports to authenticated;

-- Live sync for the new tables
alter publication supabase_realtime add table candidates;
alter publication supabase_realtime add table checkins;
alter publication supabase_realtime add table invoices;
alter publication supabase_realtime add table payment_reminders;
