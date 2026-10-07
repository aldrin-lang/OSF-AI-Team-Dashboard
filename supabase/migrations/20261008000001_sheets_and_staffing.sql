-- ============================================================================
-- Sheets (team spreadsheets inside the CRM) + VA staffing (open roles,
-- candidate matching, richer placements). Additive: no existing data changes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Sheets
-- ---------------------------------------------------------------------------
create type sheet_visibility  as enum ('private', 'everyone', 'departments', 'people');
create type sheet_column_type as enum ('text', 'number', 'money', 'date', 'select', 'checkbox', 'person', 'url');

create table sheets (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(name) between 1 and 120),
  description  text,
  emoji        text,
  visibility   sheet_visibility not null default 'private',
  departments  text[] not null default '{}',   -- department keys (visibility = departments)
  people       uuid[] not null default '{}',   -- profile ids (visibility = people)
  archived     boolean not null default false,
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index sheets_created_by_idx on sheets (created_by);
create trigger sheets_touch before update on sheets
  for each row execute function public.touch_updated_at();

create table sheet_columns (
  id          uuid primary key default gen_random_uuid(),
  sheet_id    uuid not null references sheets(id) on delete cascade,
  name        text not null check (length(name) between 1 and 80),
  type        sheet_column_type not null default 'text',
  options     jsonb not null default '{}',       -- {"choices": [...]} for select, {"currency": "GBP"} for money
  position    int not null default 0,
  width       int not null default 180 check (width between 60 and 600),
  created_at  timestamptz not null default now()
);
create index sheet_columns_sheet_idx on sheet_columns (sheet_id, position);

create table sheet_rows (
  id          uuid primary key default gen_random_uuid(),
  sheet_id    uuid not null references sheets(id) on delete cascade,
  position    double precision not null default extract(epoch from now()),
  cells       jsonb not null default '{}',       -- { "<column id>": value }
  created_by  uuid references profiles(id) on delete set null,
  updated_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index sheet_rows_sheet_idx on sheet_rows (sheet_id, position);
create trigger sheet_rows_touch before update on sheet_rows
  for each row execute function public.touch_updated_at();

-- Access is checked from the row's own values (not by re-reading the table), so
-- "insert ... returning" works for the creator in the same statement.
create or replace function public.sheet_access(
  p_created_by uuid, p_visibility sheet_visibility, p_departments text[], p_people uuid[])
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active
      and (
        p.role = 'admin'
        or p_created_by = p.id
        or p_visibility = 'everyone'
        or (p_visibility = 'people' and p.id = any (p_people))
        or (p_visibility = 'departments' and exists (
              select 1 from public.profile_departments pd
              where pd.profile_id = p.id and pd.department = any (p_departments)))
      )
  );
$$;

-- Rename, share, archive or delete: admins and the sheet's creator.
create or replace function public.sheet_manage(p_created_by uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active and (p.role = 'admin' or p_created_by = p.id)
  );
$$;

-- For columns/rows: can the current user open the parent sheet?
create or replace function public.can_view_sheet(p_sheet uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce((
    select public.sheet_access(s.created_by, s.visibility, s.departments, s.people)
    from public.sheets s where s.id = p_sheet
  ), false);
$$;
grant execute on function public.sheet_access(uuid, sheet_visibility, text[], uuid[]),
  public.sheet_manage(uuid), public.can_view_sheet(uuid) to authenticated;

alter table sheets        enable row level security;
alter table sheet_columns enable row level security;
alter table sheet_rows    enable row level security;

create policy sheets_select on sheets for select
  using (public.sheet_access(created_by, visibility, departments, people));
create policy sheets_insert on sheets for insert
  with check (public.is_active_member() and created_by = auth.uid());
create policy sheets_update on sheets for update
  using (public.sheet_manage(created_by)) with check (public.sheet_manage(created_by));
create policy sheets_delete on sheets for delete using (public.sheet_manage(created_by));

-- Anyone a sheet is shared with can edit its columns and rows (like a shared Google Sheet).
create policy sheet_columns_all on sheet_columns for all
  using (public.can_view_sheet(sheet_id)) with check (public.can_view_sheet(sheet_id));
create policy sheet_rows_all on sheet_rows for all
  using (public.can_view_sheet(sheet_id)) with check (public.can_view_sheet(sheet_id));

grant select, insert, update, delete on sheets, sheet_columns, sheet_rows to authenticated;

-- Edit one cell without overwriting a teammate's edit to another cell in the same row.
-- Runs as the caller, so the row policies above still decide who may edit.
create or replace function public.set_sheet_cell(p_row uuid, p_column uuid, p_value jsonb)
returns void
language sql
security invoker set search_path = public
as $$
  update public.sheet_rows
     set cells = case when p_value is null or p_value = 'null'::jsonb
                      then cells - p_column::text
                      else jsonb_set(cells, array[p_column::text], p_value, true) end,
         updated_by = auth.uid()
   where id = p_row;
$$;
grant execute on function public.set_sheet_cell(uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- VA staffing: open roles (job orders) + candidates matched to them
-- ---------------------------------------------------------------------------
create type role_status as enum ('open', 'sourcing', 'interviewing', 'offer', 'filled', 'on_hold', 'cancelled');
create type role_candidate_stage as enum ('suggested', 'shortlisted', 'interview', 'offered', 'hired', 'rejected');

create table va_roles (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade,
  title           text not null check (length(title) between 1 and 120),
  headcount       int not null default 1 check (headcount between 1 and 50),
  employment_type text not null default 'full_time' check (employment_type in ('full_time', 'part_time', 'project')),
  hours_per_week  int check (hours_per_week between 1 and 80),
  budget          text,                     -- e.g. "$6-8/h"
  start_by        date,
  status          role_status not null default 'open',
  priority        text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  requirements    text,
  owner_id        uuid references profiles(id) on delete set null,
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index va_roles_status_idx on va_roles (status);
create index va_roles_client_idx on va_roles (client_id);
create trigger va_roles_touch before update on va_roles
  for each row execute function public.touch_updated_at();

create table va_role_candidates (
  id            uuid primary key default gen_random_uuid(),
  role_id       uuid not null references va_roles(id) on delete cascade,
  candidate_id  uuid not null references candidates(id) on delete cascade,
  stage         role_candidate_stage not null default 'shortlisted',
  match_score   int check (match_score between 0 and 100),
  notes         text,
  added_by      uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (role_id, candidate_id)
);
create index va_role_candidates_role_idx on va_role_candidates (role_id);
create trigger va_role_candidates_touch before update on va_role_candidates
  for each row execute function public.touch_updated_at();

-- Placements: link to the hire and record the commercial details
alter table va_placements
  add column if not exists candidate_id   uuid references candidates(id) on delete set null,
  add column if not exists role_id        uuid references va_roles(id) on delete set null,
  add column if not exists start_date     date,
  add column if not exists end_date       date,
  add column if not exists hourly_rate    numeric(10,2) check (hourly_rate >= 0),
  add column if not exists rate_currency  text not null default 'USD' check (rate_currency in ('GBP', 'EUR', 'NZD', 'AUD', 'CAD', 'USD', 'PHP')),
  add column if not exists hours_per_week int check (hours_per_week between 1 and 80),
  add column if not exists notes          text;

alter table va_roles           enable row level security;
alter table va_role_candidates enable row level security;

-- Recruitment works the roles; client teams can see them.
create policy va_roles_select on va_roles for select
  using (public.has_area('candidates') or public.has_area('clients'));
create policy va_roles_write on va_roles for all
  using (public.has_area('candidates')) with check (public.has_area('candidates'));
create policy va_role_candidates_all on va_role_candidates for all
  using (public.has_area('candidates')) with check (public.has_area('candidates'));
-- Recruitment can create the placement when a candidate is hired.
create policy va_placements_recruit_insert on va_placements for insert
  with check (public.has_area('candidates'));
create policy va_placements_recruit_select on va_placements for select
  using (public.has_area('candidates'));

grant select, insert, update, delete on va_roles, va_role_candidates to authenticated;

-- ---------------------------------------------------------------------------
-- Live sync
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['sheets', 'sheet_columns', 'sheet_rows', 'va_roles', 'va_role_candidates', 'va_placements'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
