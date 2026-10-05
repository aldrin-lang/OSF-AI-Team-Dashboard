-- ============================================================================
-- Departments: each person only sees (and can change) their department's areas.
-- Admins see everything. Which areas a department sees is editable on /admin.
--
-- Areas: leads | clients (Clients, Pipeline, Concerns) | checkins | candidates
--        | payments | reports (Reports + Daily report)
--
-- Re-creates the read/write policies on every operational table so access is
-- enforced by the database, not only by hiding menu items.
-- ============================================================================

create table departments (
  key       text primary key,
  name      text not null,
  position  int  not null default 0
);

create table department_areas (
  department text not null references departments(key) on delete cascade,
  area       text not null check (area in ('leads', 'clients', 'checkins', 'candidates', 'payments', 'reports')),
  primary key (department, area)
);

create table profile_departments (
  profile_id uuid not null references profiles(id) on delete cascade,
  department text not null references departments(key) on delete cascade,
  primary key (profile_id, department)
);
create index profile_departments_dept_idx on profile_departments (department);

insert into departments (key, name, position) values
  ('sales',          'Sales',          1),
  ('marketing',      'Marketing',      2),
  ('client_success', 'Client Success', 3),
  ('operations',     'Operations',     4),
  ('recruitment',    'Recruitment',    5),
  ('accounts',       'Accounts',       6);

insert into department_areas (department, area) values
  ('sales',          'leads'),
  ('marketing',      'leads'),
  ('client_success', 'clients'),
  ('client_success', 'checkins'),
  ('operations',     'clients'),
  ('operations',     'checkins'),
  ('operations',     'candidates'),
  ('recruitment',    'candidates'),
  ('accounts',       'payments');

-- Anyone already in the dashboard who is not an admin keeps today's main
-- access (Client Success + Sales) so nobody is locked out; adjust on /admin.
insert into profile_departments (profile_id, department)
select p.id, d.dept
from profiles p
cross join (values ('client_success'), ('sales')) as d(dept)
where p.role <> 'admin'
on conflict do nothing;

-- True when the signed-in, active user may use an area (admins: always).
create or replace function public.has_area(p_area text)
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
        or exists (
          select 1
          from public.profile_departments pd
          join public.department_areas da on da.department = pd.department
          where pd.profile_id = p.id and da.area = p_area
        )
      )
  );
$$;
grant execute on function public.has_area(text) to authenticated;

alter table departments         enable row level security;
alter table department_areas    enable row level security;
alter table profile_departments enable row level security;

create policy departments_select on departments for select using (public.is_active_member());
create policy departments_admin  on departments for all using (public.is_admin()) with check (public.is_admin());
create policy dept_areas_select  on department_areas for select using (public.is_active_member());
create policy dept_areas_admin   on department_areas for all using (public.is_admin()) with check (public.is_admin());
create policy profile_depts_select on profile_departments for select using (public.is_active_member());
create policy profile_depts_admin  on profile_departments for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on departments, department_areas, profile_departments to authenticated;

-- ---------------------------------------------------------------------------
-- Leads area
-- ---------------------------------------------------------------------------
drop policy if exists leads_select on leads;
drop policy if exists leads_write  on leads;
create policy leads_select on leads for select using (public.has_area('leads'));
create policy leads_write  on leads for all using (public.has_area('leads')) with check (public.has_area('leads'));

drop policy if exists lead_events_select on lead_events;
drop policy if exists lead_events_insert on lead_events;
create policy lead_events_select on lead_events for select using (public.has_area('leads'));
create policy lead_events_insert on lead_events for insert with check (public.has_area('leads'));

drop policy if exists setters_select on setters;
drop policy if exists setters_write  on setters;
create policy setters_select on setters for select using (public.has_area('leads'));
create policy setters_write  on setters for all
  using (public.is_manager_or_admin() and public.has_area('leads'))
  with check (public.is_manager_or_admin() and public.has_area('leads'));

drop policy if exists lead_settings_select on lead_settings;
create policy lead_settings_select on lead_settings for select using (public.has_area('leads'));

-- ---------------------------------------------------------------------------
-- Clients area (Clients, Pipeline, Concerns). Client names/basics are also
-- readable by Check-ins and Payments, which list clients.
-- ---------------------------------------------------------------------------
drop policy if exists clients_select on clients;
drop policy if exists clients_write  on clients;
create policy clients_select on clients for select
  using (public.has_area('clients') or public.has_area('checkins') or public.has_area('payments'));
create policy clients_write on clients for all
  using (public.has_area('clients')) with check (public.has_area('clients'));

drop policy if exists va_placements_select on va_placements;
drop policy if exists va_placements_write  on va_placements;
create policy va_placements_select on va_placements for select
  using (public.has_area('clients') or public.has_area('checkins'));
create policy va_placements_write on va_placements for all
  using (public.has_area('clients')) with check (public.has_area('clients'));

drop policy if exists client_lines_select on client_lines;
drop policy if exists client_lines_write  on client_lines;
create policy client_lines_select on client_lines for select using (public.has_area('clients'));
create policy client_lines_write  on client_lines for all
  using (public.has_area('clients')) with check (public.has_area('clients'));

drop policy if exists checklist_select on checklist_items;
drop policy if exists checklist_write  on checklist_items;
create policy checklist_select on checklist_items for select using (public.has_area('clients'));
create policy checklist_write  on checklist_items for all
  using (public.has_area('clients')) with check (public.has_area('clients'));

drop policy if exists concerns_select on concerns;
drop policy if exists concerns_write  on concerns;
create policy concerns_select on concerns for select using (public.has_area('clients'));
create policy concerns_write  on concerns for all
  using (public.has_area('clients')) with check (public.has_area('clients'));

drop policy if exists client_emails_select on client_emails;
drop policy if exists client_emails_write  on client_emails;
create policy client_emails_select on client_emails for select using (public.has_area('clients'));
create policy client_emails_write  on client_emails for all
  using (public.has_area('clients')) with check (public.has_area('clients'));

drop policy if exists comments_select on comments;
drop policy if exists comments_insert on comments;
create policy comments_select on comments for select using (public.has_area('clients'));
create policy comments_insert on comments for insert
  with check (public.has_area('clients') and author_id = auth.uid());

drop policy if exists activity_select on activity_log;
create policy activity_select on activity_log for select using (public.has_area('clients'));

-- Tasks: client team sees all; anyone sees/updates tasks assigned to them (My desk).
drop policy if exists tasks_select on tasks;
drop policy if exists tasks_write  on tasks;
create policy tasks_select on tasks for select
  using (public.has_area('clients') or (assignee_id = auth.uid() and public.is_active_member()));
create policy tasks_write on tasks for all
  using (public.has_area('clients') or (assignee_id = auth.uid() and public.is_active_member()))
  with check (public.has_area('clients') or (assignee_id = auth.uid() and public.is_active_member()));

-- ---------------------------------------------------------------------------
-- Check-ins, Candidates, Payments, Reports
-- ---------------------------------------------------------------------------
drop policy if exists checkins_select on checkins;
drop policy if exists checkins_write  on checkins;
create policy checkins_select on checkins for select using (public.has_area('checkins'));
create policy checkins_write  on checkins for all
  using (public.has_area('checkins')) with check (public.has_area('checkins'));

drop policy if exists candidates_select on candidates;
drop policy if exists candidates_write  on candidates;
create policy candidates_select on candidates for select using (public.has_area('candidates'));
create policy candidates_write  on candidates for all
  using (public.has_area('candidates')) with check (public.has_area('candidates'));

drop policy if exists invoices_select on invoices;
drop policy if exists invoices_write  on invoices;
create policy invoices_select on invoices for select using (public.has_area('payments'));
create policy invoices_write  on invoices for all
  using (public.has_area('payments') and public.is_manager_or_admin())
  with check (public.has_area('payments') and public.is_manager_or_admin());

drop policy if exists reminders_select on payment_reminders;
drop policy if exists reminders_write  on payment_reminders;
create policy reminders_select on payment_reminders for select using (public.has_area('payments'));
create policy reminders_write  on payment_reminders for all
  using (public.has_area('payments') and public.is_manager_or_admin())
  with check (public.has_area('payments') and public.is_manager_or_admin());

drop policy if exists daily_reports_select on daily_reports;
create policy daily_reports_select on daily_reports for select using (public.has_area('reports'));
