-- ---------------------------------------------------------------------------
-- VA Managers + Recruitment as CRM records (replacing the sheet copies).
--   VA Managers: VA placements get the Masterlist fields; clients get their
--     monthly check-in day; red flags; replacements & cancellations.
--   Recruitment: client requests (va_roles) get Roel's Openings fields and
--     endorsement stage; onboarding (closed sales) with hiring fees.
-- History is loaded once from the team's sheets (source_key keeps that
-- idempotent); from then on the team works here only.
-- Access: VA Managers records need the Clients area; Recruitment records the
-- Candidates area (Clients can read them too; Payments can read hiring fees).
-- ---------------------------------------------------------------------------

-- clients: monthly check-in day and the person who does it
alter table clients
  add column if not exists checkin_day int check (checkin_day between 1 and 31),
  add column if not exists csm_name    text,
  add column if not exists phone       text,
  add column if not exists ghl_url     text;

-- VA placements: the VA Masterlist fields
alter table va_placements
  add column if not exists manager_name    text,
  add column if not exists client_email    text,
  add column if not exists country         text,
  add column if not exists daily_hours     numeric(5,2),
  add column if not exists va_pay          numeric(10,2),
  add column if not exists client_pay_gbp  numeric(10,2),
  add column if not exists client_pay_usd  numeric(10,2),
  add column if not exists profit_per_hour numeric(10,2),
  add column if not exists monthly_profit  numeric(12,2),
  add column if not exists removed_on      date,
  add column if not exists on_pause        boolean not null default false,
  add column if not exists source_key      text unique;

-- red flags (VA Managers › Red flags)
create table red_flags (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  placement_id  uuid references va_placements(id) on delete set null,
  va_name       text,
  focus         text not null default 'client' check (focus in ('client', 'va')),
  manager_name  text,
  reason        text,
  rca           text,
  action_taken  text,
  status        text not null default 'open' check (status in ('open', 'resolved')),
  added_on      date not null default current_date,
  resolved_on   date,
  notes         text,
  source_key    text unique,
  created_by    uuid references profiles(id) on delete set null,
  updated_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index red_flags_status_idx on red_flags (status, added_on desc);
create index red_flags_client_idx on red_flags (client_id);
create trigger red_flags_touch before update on red_flags for each row execute function public.touch_updated_at();

-- replacements & cancellations (VA Managers)
create table va_changes (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('replacement', 'cancellation')),
  client_id        uuid not null references clients(id) on delete cascade,
  placement_id     uuid references va_placements(id) on delete set null,
  va_name          text,
  va_role          text,
  manager_name     text,
  reason_tag       text,          -- e.g. VA Resigned, Client Funds, VA Performance
  reason           text,
  rca              text,
  controllable     boolean,
  action_next      text,
  last_day         date,          -- the VA's last day / end of contract
  notified_on      date,
  started_on       date,          -- the campaign's start date
  initiated_by     text,
  assigned_to      text,
  status           text not null default 'in_progress' check (status in ('in_progress', 'replaced', 'cancelled', 'withdrawn')),
  status_detail    text,          -- e.g. CV Pooling, Interview Scheduled, Pending Decision
  monthly_profit   numeric(12,2),
  notes            text,
  source_key       text unique,
  created_by       uuid references profiles(id) on delete set null,
  updated_by       uuid references profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index va_changes_status_idx on va_changes (status, kind);
create index va_changes_client_idx on va_changes (client_id);
create trigger va_changes_touch before update on va_changes for each row execute function public.touch_updated_at();

-- client requests (Recruitment): Roel's Openings fields on va_roles
alter table va_roles
  add column if not exists requested_on        date,
  add column if not exists closed_on           date,
  add column if not exists manager_name        text,
  add column if not exists sdr                 text,
  add column if not exists hire_type           text,
  add column if not exists country             text,
  add column if not exists va_type             text,
  add column if not exists industry            text,
  add column if not exists work_arrangement    text,
  add column if not exists interview_schedule  text,
  add column if not exists stage               text check (stage in ('cv_pooling', 'ready', 'endorsed', 'interview', 'pending_decision', 'paused', 'live', 'withdrawn')),
  add column if not exists stage_detail        text,   -- Roel's label, e.g. "5 For Rescheduling"
  add column if not exists reengagement_status text,
  add column if not exists rework_reason       text,
  add column if not exists hiring_notes        text,
  add column if not exists notes               text,
  add column if not exists endorsed            jsonb not null default '[]'::jsonb,  -- [{name, email, cv, portfolio}]
  add column if not exists source_key          text unique;
create index if not exists va_roles_stage_idx on va_roles (stage, requested_on desc);

-- roles made before this (or by /roles and hire_candidate, which only set status) get a stage from status
create or replace function public.va_role_stage_from_status(s role_status) returns text language sql immutable as $$
  select case s
    when 'interviewing' then 'interview'
    when 'offer' then 'pending_decision'
    when 'filled' then 'live'
    when 'on_hold' then 'paused'
    when 'cancelled' then 'withdrawn'
    else 'cv_pooling' end
$$;
update va_roles set stage = public.va_role_stage_from_status(status) where stage is null;
create or replace function public.va_roles_sync_stage() returns trigger language plpgsql as $$
begin
  if new.stage is null
     or (tg_op = 'UPDATE' and new.status is distinct from old.status and new.stage is not distinct from old.stage) then
    new.stage := public.va_role_stage_from_status(new.status);
  end if;
  return new;
end $$;
create trigger va_roles_sync_stage before insert or update on va_roles for each row execute function public.va_roles_sync_stage();

-- onboarding (Recruitment): closed sales from the call to the VA going live, with the hiring fee
create table onboardings (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid not null references clients(id) on delete cascade,
  placement_id         uuid references va_placements(id) on delete set null,
  va_name              text,
  va_email             text,
  va_cv                text,
  role                 text,
  employment_type      text,
  sales_type           text,
  closed_on            date,
  closed_by            text,
  manager_name         text,
  contacted_by_am      text,
  ob_status            text not null default 'to_schedule' check (ob_status in ('to_schedule', 'scheduled', 'done', 'withdrawn')),
  ob_status_detail     text,   -- e.g. For Scheduling, Waiting for Availability, MIA
  ob_date              date,
  start_date           date,
  country              text,
  campaign_status      text,
  reengagement_status  text,
  fee_status           text not null default 'to_send' check (fee_status in ('to_send', 'charged', 'paid', 'na')),
  fee_status_detail    text,
  fee_invoice          text,
  fee_paid             text,
  notes                text,
  source_key           text unique,
  created_by           uuid references profiles(id) on delete set null,
  updated_by           uuid references profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index onboardings_status_idx on onboardings (ob_status, closed_on desc);
create index onboardings_fee_idx on onboardings (fee_status);
create index onboardings_client_idx on onboardings (client_id);
create trigger onboardings_touch before update on onboardings for each row execute function public.touch_updated_at();

alter table red_flags   enable row level security;
alter table va_changes  enable row level security;
alter table onboardings enable row level security;

create policy red_flags_select  on red_flags  for select using (public.has_area('clients'));
create policy red_flags_write   on red_flags  for all    using (public.has_area('clients')) with check (public.has_area('clients'));
create policy va_changes_select on va_changes for select using (public.has_area('clients'));
create policy va_changes_write  on va_changes for all    using (public.has_area('clients')) with check (public.has_area('clients'));
create policy onboardings_select on onboardings for select
  using (public.has_area('candidates') or public.has_area('clients') or public.has_area('payments'));
create policy onboardings_write  on onboardings for all
  using (public.has_area('candidates') or public.has_area('clients')) with check (public.has_area('candidates') or public.has_area('clients'));
grant select, insert, update, delete on red_flags, va_changes, onboardings to authenticated;

-- live sync
alter publication supabase_realtime add table red_flags;
alter publication supabase_realtime add table va_changes;
alter publication supabase_realtime add table onboardings;
