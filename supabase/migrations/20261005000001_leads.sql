-- ============================================================================
-- Leads: every new GHL lead lands here and is allocated to a setter.
--
-- * Allocation = round-robin by "least recently assigned active setter",
--   done inside Postgres so two leads arriving at once never pick the same one.
-- * lead_settings.live_from is the on/off switch. While it is NULL the dashboard
--   only RECORDS leads (flagged historical); nothing is assigned. Setting it to
--   "now" makes every lead created from then on allocatable. This lets the
--   dashboard run next to the Make/Sheet flow until the team agrees to switch.
-- ============================================================================

create type lead_status  as enum ('new', 'contacted', 'call_booked', 'no_answer', 'not_interested', 'won', 'lost');
create type lead_service as enum ('ai', 'va', 'unknown');

-- ---------------------------------------------------------------------------
-- setters  (the people leads are allocated to; ghl_user_id = their GHL user)
-- ---------------------------------------------------------------------------
create table setters (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  ghl_user_id      text unique,
  email            text,
  profile_id       uuid references profiles(id) on delete set null,  -- optional dashboard login
  active           boolean not null default true,                     -- on/off switch for allocation
  last_assigned_at timestamptz,                                       -- for display
  last_assign_seq  bigint,                                            -- drives the rotation (never ties)
  created_at       timestamptz not null default now()
);

-- Rotation counter: strictly increasing, so two assignments can never tie the
-- way timestamps can.
create sequence setter_assign_seq;

-- Single-row settings table.
create table lead_settings (
  id         int primary key default 1 check (id = 1),
  live_from  timestamptz,
  updated_at timestamptz not null default now()
);
insert into lead_settings (id) values (1) on conflict do nothing;

-- ---------------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------------
create table leads (
  id                 uuid primary key default gen_random_uuid(),
  ghl_key            text not null unique,   -- GHL opportunity id, else 'contact:<id>'  (dedupe key)
  ghl_contact_id     text,
  ghl_opportunity_id text,
  ghl_assigned_to    text,                   -- GHL's own owner id for the opportunity (info only)
  name               text not null default '',
  email              text,
  phone_raw          text,                   -- exactly what GHL holds
  phone              text,
  phone_suggested    text,                   -- best guess when the number looks mis-coded
  phone_flag         text,                   -- likely_miscoded_353 | no_country_code
  source             text,
  service            lead_service not null default 'unknown',
  va_role            text,
  job_description    text,
  tags               text[] not null default '{}',
  custom             jsonb not null default '{}',
  status             lead_status not null default 'new',
  setter_id          uuid references setters(id) on delete set null,
  assigned_at        timestamptz,
  assigned_by        text,                   -- 'auto' or the person who re-assigned
  notes              text,
  historical         boolean not null default false,  -- created before live_from: recorded, never auto-assigned
  client_id          uuid references clients(id) on delete set null,   -- set when converted
  ghl_created_at     timestamptz,
  received_at        timestamptz not null default now(),
  last_synced_at     timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index leads_received_idx on leads (received_at desc);
create index leads_status_idx   on leads (status);
create index leads_setter_idx   on leads (setter_id);
create index leads_service_idx  on leads (service);

create trigger leads_touch before update on leads
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- lead_events  (history shown on the lead page)
-- ---------------------------------------------------------------------------
create table lead_events (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references leads(id) on delete cascade,
  kind       text not null,   -- received | assigned | reassigned | status | note | converted
  summary    text not null,
  detail     jsonb,
  actor_id   uuid references profiles(id) on delete set null,   -- null = system / webhook
  created_at timestamptz not null default now()
);
create index lead_events_lead_idx on lead_events (lead_id, created_at desc);

-- ---------------------------------------------------------------------------
-- allocate_lead: pick the least-recently-assigned ACTIVE setter. Idempotent:
-- a lead that already has a setter is returned untouched. Returns NULL when
-- nobody is active (the lead stays unassigned).
-- ---------------------------------------------------------------------------
create or replace function public.allocate_lead(p_lead_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_current uuid;
  v_setter  uuid;
  v_name    text;
begin
  select setter_id into v_current from leads where id = p_lead_id for update;
  if not found then return null; end if;
  if v_current is not null then return v_current; end if;

  -- skip locked: a concurrent allocation picks the next setter instead of waiting
  select id into v_setter from setters
   where active
   order by last_assign_seq asc nulls first, name asc
   for update skip locked
   limit 1;

  if v_setter is null then
    -- everyone is momentarily locked: wait for the first one
    select id into v_setter from setters
     where active
     order by last_assign_seq asc nulls first, name asc
     for update
     limit 1;
  end if;
  if v_setter is null then return null; end if;

  update setters set last_assigned_at = clock_timestamp(), last_assign_seq = nextval('setter_assign_seq') where id = v_setter;
  update leads
     set setter_id = v_setter, assigned_at = clock_timestamp(), assigned_by = 'auto'
   where id = p_lead_id;
  -- logged here (not by the caller) so exactly one event exists per real assignment
  select name into v_name from setters where id = v_setter;
  insert into lead_events (lead_id, kind, summary, created_at)
  values (p_lead_id, 'assigned', 'Auto-assigned to ' || coalesce(v_name, 'setter'), clock_timestamp());
  return v_setter;
end;
$$;

revoke all on sequence setter_assign_seq from public, anon, authenticated;

-- Only the server (service role) may allocate; users re-assign by editing the lead.
revoke all on function public.allocate_lead(uuid) from public, anon, authenticated;
grant execute on function public.allocate_lead(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- RLS — same model as the rest of the app: any active member reads + writes
-- operational data; setter list and the live switch need more.
-- ---------------------------------------------------------------------------
alter table setters       enable row level security;
alter table lead_settings enable row level security;
alter table leads         enable row level security;
alter table lead_events   enable row level security;

create policy setters_select on setters for select using (public.is_active_member());
create policy setters_write  on setters for all
  using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

create policy lead_settings_select on lead_settings for select using (public.is_active_member());
create policy lead_settings_update on lead_settings for update
  using (public.is_admin()) with check (public.is_admin());

create policy leads_select on leads for select using (public.is_active_member());
create policy leads_write  on leads for all
  using (public.is_active_member()) with check (public.is_active_member());

create policy lead_events_select on lead_events for select using (public.is_active_member());
create policy lead_events_insert on lead_events for insert with check (public.is_active_member());

-- Live sync for the new tables
alter publication supabase_realtime add table leads;
alter publication supabase_realtime add table lead_events;
alter publication supabase_realtime add table setters;

-- ---------------------------------------------------------------------------
-- Seed the three setters (GHL user ids from the OutsourceForce.ai location)
-- ---------------------------------------------------------------------------
insert into setters (name, ghl_user_id, email) values
  ('Dean Murie',  'S6RszMji0mXIBLUk4ucu', null),
  ('Scott',       'a0A6Fi8T9bz7bWrEwDL1', 'scott@outsourceforce.ai'),
  ('Jesse Maloy', 'B0dVfRGkCj3HeWjoebNl', null)
on conflict (ghl_user_id) do nothing;
