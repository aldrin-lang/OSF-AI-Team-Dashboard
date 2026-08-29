-- ============================================================================
-- AI Receptionist Ops Dashboard — initial schema
-- Internal staff tool. Small trusted team: everyone can read everything,
-- writes are gated by role for admin/commercial data.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type user_role          as enum ('admin', 'manager', 'member');
create type pipeline_type      as enum ('ai', 'va');
create type client_status      as enum ('active', 'live', 'paused', 'withdrawn', 'rejected', 'churned');
create type rb_status          as enum ('not_started', 'docs_needed', 'submitted', 'approved', 'rejected');
create type build_status       as enum ('not_started', 'in_progress', 'submitted', 'approved', 'rejected');
create type checklist_status   as enum ('todo', 'doing', 'done', 'blocked', 'na');
create type task_status        as enum ('open', 'done');
create type concern_status     as enum ('open', 'in_progress', 'resolved');
create type concern_severity   as enum ('low', 'medium', 'high', 'urgent');
create type placement_status   as enum ('active', 'inactive_client_cancelled', 'inactive_campaign_cancelled', 'replaced');
create type hiring_fee_status  as enum ('not_applicable', 'pending', 'invoiced', 'paid');
create type digest_freq        as enum ('off', 'daily', 'weekly');
create type entity_type        as enum ('client', 'concern');

-- ---------------------------------------------------------------------------
-- profiles  (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  email       text not null default '',
  role        user_role not null default 'member',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Auto-create a profile row whenever a user is invited/created in auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Role helpers  (SECURITY DEFINER to avoid recursive RLS on profiles)
-- ---------------------------------------------------------------------------
create or replace function public.current_role_name()
returns user_role
language sql
stable
security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

create or replace function public.is_manager_or_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and role in ('manager', 'admin')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- option_lists  (editable dropdowns: sources, booking systems, concern types)
-- ---------------------------------------------------------------------------
create table option_lists (
  id        uuid primary key default gen_random_uuid(),
  kind      text not null check (kind in ('source', 'booking_system', 'concern_type', 'country', 'role')),
  value     text not null,
  position  int not null default 0,
  active    boolean not null default true,
  unique (kind, value)
);

-- ---------------------------------------------------------------------------
-- pipeline_stages  (configurable per pipeline)
-- ---------------------------------------------------------------------------
create table pipeline_stages (
  id          uuid primary key default gen_random_uuid(),
  pipeline    pipeline_type not null,
  name        text not null,
  position    int not null,
  is_terminal boolean not null default false,
  sla_days    int,                       -- staleness threshold; null = no SLA
  unique (pipeline, name)
);

-- ---------------------------------------------------------------------------
-- clients  (shared base for AI + VA pipelines)
-- ---------------------------------------------------------------------------
create table clients (
  id                 uuid primary key default gen_random_uuid(),
  pipeline           pipeline_type not null,
  name               text not null,
  industry           text,
  country            text,
  source             text,
  closed_by          text,
  manager_id         uuid references profiles(id) on delete set null,
  demo_call_date     date,
  start_date         date,
  stage_id           uuid references pipeline_stages(id) on delete set null,
  stage_entered_at   timestamptz not null default now(),
  status             client_status not null default 'active',
  -- commercials (guarded by trigger: manager/admin only)
  setup_fee          numeric(10,2),
  daily_rate         numeric(10,2),
  hiring_fee_status  hiring_fee_status not null default 'pending',
  hiring_fee_invoice text,
  hiring_fee_paid    text,
  remarks            text,
  source_row_hash    text unique,        -- idempotent spreadsheet import key
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index clients_pipeline_idx  on clients(pipeline);
create index clients_stage_idx     on clients(stage_id);
create index clients_manager_idx   on clients(manager_id);

create trigger clients_touch before update on clients
  for each row execute function public.touch_updated_at();

-- Guard commercial columns: only manager/admin may change them.
create or replace function public.guard_client_commercials()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.setup_fee         is distinct from old.setup_fee
   or new.daily_rate        is distinct from old.daily_rate
   or new.hiring_fee_status is distinct from old.hiring_fee_status
   or new.hiring_fee_invoice is distinct from old.hiring_fee_invoice
   or new.hiring_fee_paid   is distinct from old.hiring_fee_paid)
   and not public.is_manager_or_admin() then
    raise exception 'Only managers or admins can change commercial fields';
  end if;
  return new;
end;
$$;

create trigger clients_guard_commercials before update on clients
  for each row execute function public.guard_client_commercials();

-- Track stage-entry time so staleness/SLA reporting works.
create or replace function public.stamp_stage_entered()
returns trigger language plpgsql as $$
begin
  if new.stage_id is distinct from old.stage_id then
    new.stage_entered_at = now();
  end if;
  return new;
end;
$$;

create trigger clients_stamp_stage before update on clients
  for each row execute function public.stamp_stage_entered();

-- ---------------------------------------------------------------------------
-- client_lines  (per AI phone line; a client has 1..n)
-- ---------------------------------------------------------------------------
create table client_lines (
  id                       uuid primary key default gen_random_uuid(),
  client_id                uuid not null references clients(id) on delete cascade,
  label                    text,
  ai_phone_number          text,
  twilio_subaccount        text,
  ghl_location_id          text,
  dashboard_url            text,
  booking_system           text,
  regulatory_bundle_status rb_status not null default 'not_started',
  prompt_status            build_status not null default 'not_started',
  kb_status                build_status not null default 'not_started',
  workflow_status          build_status not null default 'not_started',
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index client_lines_client_idx on client_lines(client_id);
create trigger client_lines_touch before update on client_lines
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- va_placements  (per VA under a VA client)
-- ---------------------------------------------------------------------------
create table va_placements (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references clients(id) on delete cascade,
  va_name          text,
  va_email         text,
  va_cv_url        text,
  tracker_url      text,
  role             text,
  employment_type  text,
  placement_status placement_status not null default 'active',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index va_placements_client_idx on va_placements(client_id);
create trigger va_placements_touch before update on va_placements
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- checklist_items  (templated per client; drives the build checklist + gates)
-- ---------------------------------------------------------------------------
create table checklist_items (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  key           text not null,
  label         text not null,
  status        checklist_status not null default 'todo',
  owner_id      uuid references profiles(id) on delete set null,
  due_date      date,
  position      int not null default 0,
  completed_at  timestamptz,
  completed_by  uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (client_id, key)
);
create index checklist_client_idx on checklist_items(client_id);
create trigger checklist_touch before update on checklist_items
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- stage_gates  (a checklist key that must be `done` to advance past a stage)
-- ---------------------------------------------------------------------------
create table stage_gates (
  id                    uuid primary key default gen_random_uuid(),
  stage_id              uuid not null references pipeline_stages(id) on delete cascade,
  required_checklist_key text not null,
  unique (stage_id, required_checklist_key)
);

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table tasks (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references clients(id) on delete cascade,
  title       text not null,
  notes       text,
  assignee_id uuid references profiles(id) on delete set null,
  due_date    date,
  status      task_status not null default 'open',
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index tasks_client_idx   on tasks(client_id);
create index tasks_assignee_idx on tasks(assignee_id);
create trigger tasks_touch before update on tasks
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- concerns  (post-go-live issue tracker)
-- ---------------------------------------------------------------------------
create table concerns (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  raised_by   uuid references profiles(id) on delete set null,
  raised_at   timestamptz not null default now(),
  type        text,
  severity    concern_severity not null default 'medium',
  title       text not null,
  description text,
  status      concern_status not null default 'open',
  owner_id    uuid references profiles(id) on delete set null,
  resolution  text,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index concerns_client_idx on concerns(client_id);
create index concerns_status_idx on concerns(status);
create trigger concerns_touch before update on concerns
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- comments  (threaded notes on clients + concerns; feeds the updates feed)
-- ---------------------------------------------------------------------------
create table comments (
  id          uuid primary key default gen_random_uuid(),
  entity      entity_type not null,
  entity_id   uuid not null,
  author_id   uuid references profiles(id) on delete set null,
  body        text not null,
  mentions    uuid[] not null default '{}',
  created_at  timestamptz not null default now()
);
create index comments_entity_idx on comments(entity, entity_id);

-- ---------------------------------------------------------------------------
-- activity_log  (audit trail + updates feed; written only via log_activity())
-- ---------------------------------------------------------------------------
create table activity_log (
  id          uuid primary key default gen_random_uuid(),
  entity      entity_type not null,
  entity_id   uuid not null,
  actor_id    uuid references profiles(id) on delete set null,
  verb        text not null,
  summary     text not null,
  changes     jsonb,
  created_at  timestamptz not null default now()
);
create index activity_entity_idx  on activity_log(entity, entity_id);
create index activity_created_idx on activity_log(created_at desc);

create or replace function public.log_activity(
  p_entity    entity_type,
  p_entity_id uuid,
  p_verb      text,
  p_summary   text,
  p_changes   jsonb default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into public.activity_log (entity, entity_id, actor_id, verb, summary, changes)
  values (p_entity, p_entity_id, auth.uid(), p_verb, p_summary, p_changes)
  returning id into new_id;
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on notifications(user_id, read_at);

-- ---------------------------------------------------------------------------
-- notification_preferences  (per user; "customized for each user")
-- ---------------------------------------------------------------------------
create table notification_preferences (
  user_id                       uuid primary key references profiles(id) on delete cascade,
  assigned_to_me_in_app         boolean not null default true,
  assigned_to_me_email          boolean not null default true,
  mention_in_app                boolean not null default true,
  mention_email                 boolean not null default true,
  stage_change_my_client_in_app boolean not null default true,
  stage_change_my_client_email  boolean not null default false,
  concern_my_client_in_app      boolean not null default true,
  concern_my_client_email       boolean not null default true,
  stale_client_in_app           boolean not null default true,
  stale_client_email            boolean not null default false,
  digest                        digest_freq not null default 'daily',
  updated_at                    timestamptz not null default now()
);
create trigger notif_prefs_touch before update on notification_preferences
  for each row execute function public.touch_updated_at();

-- Give every profile a preferences row.
create or replace function public.handle_new_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notification_preferences (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
create trigger on_profile_created
  after insert on public.profiles
  for each row execute function public.handle_new_profile();

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table profiles                 enable row level security;
alter table option_lists             enable row level security;
alter table pipeline_stages          enable row level security;
alter table stage_gates              enable row level security;
alter table clients                  enable row level security;
alter table client_lines             enable row level security;
alter table va_placements            enable row level security;
alter table checklist_items          enable row level security;
alter table tasks                    enable row level security;
alter table concerns                 enable row level security;
alter table comments                 enable row level security;
alter table activity_log             enable row level security;
alter table notifications            enable row level security;
alter table notification_preferences enable row level security;

-- profiles: everyone active reads all; you update your own name; admin updates anyone.
create policy profiles_select on profiles for select using (public.is_active_member());
create policy profiles_update_self on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_write on profiles for all
  using (public.is_admin()) with check (public.is_admin());

-- option_lists / pipeline_stages / stage_gates: read all, write admin only.
create policy options_select on option_lists for select using (public.is_active_member());
create policy options_admin  on option_lists for all
  using (public.is_admin()) with check (public.is_admin());

create policy stages_select on pipeline_stages for select using (public.is_active_member());
create policy stages_admin  on pipeline_stages for all
  using (public.is_admin()) with check (public.is_admin());

create policy gates_select on stage_gates for select using (public.is_active_member());
create policy gates_admin  on stage_gates for all
  using (public.is_admin()) with check (public.is_admin());

-- Operational tables: any active member reads + writes.
create policy clients_select on clients for select using (public.is_active_member());
create policy clients_write  on clients for all
  using (public.is_active_member()) with check (public.is_active_member());

create policy client_lines_select on client_lines for select using (public.is_active_member());
create policy client_lines_write  on client_lines for all
  using (public.is_active_member()) with check (public.is_active_member());

create policy va_placements_select on va_placements for select using (public.is_active_member());
create policy va_placements_write  on va_placements for all
  using (public.is_active_member()) with check (public.is_active_member());

create policy checklist_select on checklist_items for select using (public.is_active_member());
create policy checklist_write  on checklist_items for all
  using (public.is_active_member()) with check (public.is_active_member());

create policy tasks_select on tasks for select using (public.is_active_member());
create policy tasks_write  on tasks for all
  using (public.is_active_member()) with check (public.is_active_member());

create policy concerns_select on concerns for select using (public.is_active_member());
create policy concerns_write  on concerns for all
  using (public.is_active_member()) with check (public.is_active_member());

create policy comments_select on comments for select using (public.is_active_member());
create policy comments_insert on comments for insert
  with check (public.is_active_member() and author_id = auth.uid());
create policy comments_modify_own on comments for update
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy comments_delete on comments for delete
  using (author_id = auth.uid() or public.is_admin());

-- activity_log: read all, no direct writes (log_activity() is SECURITY DEFINER).
create policy activity_select on activity_log for select using (public.is_active_member());

-- notifications: you see and update only your own.
create policy notifications_own on notifications for select using (user_id = auth.uid());
create policy notifications_update_own on notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- notification_preferences: you see and edit only your own.
create policy notif_prefs_own on notification_preferences for select using (user_id = auth.uid());
create policy notif_prefs_update_own on notification_preferences for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================================
-- Grants (RLS still applies; these just open the tables to the API roles)
-- ============================================================================
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant execute on all functions in schema public to authenticated;
