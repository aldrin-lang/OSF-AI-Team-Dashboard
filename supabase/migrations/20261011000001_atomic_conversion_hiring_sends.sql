-- ===========================================================================
-- Concurrency fixes (audit "Next" batch). Safe to re-run.
--   1. convert_lead()   — one transaction, lead row locked: a double click or
--                         Donna + the page at once can't create two clients.
--   2. hire_candidate() — one transaction, role row locked: no duplicate
--                         placements, no hiring past the headcount, no hiring
--                         into a filled/cancelled/on-hold role.
--   3. send_claimed_at  — a short-lived claim on reminders, client emails and
--                         check-ins so two clicks can't send the same email twice.
-- Both functions are SECURITY INVOKER: the caller's RLS still applies.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Lead → client
-- ---------------------------------------------------------------------------
create or replace function public.convert_lead(
  p_lead_id uuid,
  p_summary text default null,
  p_actor   uuid default null      -- only used when there is no signed-in user
)
returns table (client_id uuid, client_name text, pipeline pipeline_type, created boolean)
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  l        leads%rowtype;
  v_pipe   pipeline_type;
  v_stage  uuid;
  v_closed text;
  v_client uuid;
  v_name   text;
begin
  select * into l from leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead not found' using errcode = 'P0002';
  end if;

  if l.client_id is not null then
    return query
      select c.id, c.name, c.pipeline, false from clients c where c.id = l.client_id;
    if not found then
      return query select l.client_id, coalesce(nullif(l.name, ''), 'Client'), null::pipeline_type, false;
    end if;
    return;
  end if;

  if l.service = 'unknown' then
    raise exception 'Set whether this lead is AI or VA first, then convert it.' using errcode = '22023';
  end if;

  v_pipe := case when l.service in ('va', 'premium') then 'va'::pipeline_type else 'ai'::pipeline_type end;
  select ps.id into v_stage from pipeline_stages ps where ps.pipeline = v_pipe order by ps.position limit 1;
  if l.setter_id is not null then
    select s.name into v_closed from setters s where s.id = l.setter_id;
  end if;
  v_name := coalesce(nullif(l.name, ''), nullif(l.email, ''), nullif(l.phone, ''), 'New client');

  insert into clients (pipeline, name, contact_email, source, country, closed_by, stage_id)
  values (v_pipe, v_name, l.email, l.source, l.country, v_closed, v_stage)
  returning id into v_client;

  insert into checklist_items (client_id, key, label, position)
  select v_client, t.key, t.label, t.position
  from checklist_templates t
  where t.pipeline = v_pipe
  order by t.position;

  update leads set client_id = v_client, status = 'won' where id = p_lead_id;

  insert into lead_events (lead_id, kind, summary, actor_id)
  values (
    p_lead_id,
    'converted',
    left(coalesce(nullif(p_summary, ''),
      case when v_pipe = 'va' then 'Converted to a VA outsourcing client' else 'Converted to an AI receptionist client' end), 500),
    coalesce(auth.uid(), p_actor)
  );

  return query select v_client, v_name, v_pipe, true;
end;
$$;

revoke execute on function public.convert_lead(uuid, text, uuid) from public, anon;
grant  execute on function public.convert_lead(uuid, text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Hire a candidate onto a role
-- ---------------------------------------------------------------------------
-- One placement per (candidate, role). Only added when today's data has no
-- duplicates, so this migration never fails on old rows; hire_candidate()
-- checks under a lock either way.
do $$
begin
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'va_placements_candidate_role_uniq') then
    if exists (
      select 1 from va_placements
      where candidate_id is not null and role_id is not null
      group by candidate_id, role_id having count(*) > 1
    ) then
      raise notice 'va_placements has duplicate (candidate_id, role_id) rows: unique index skipped. Clean them up and re-run.';
    else
      create unique index va_placements_candidate_role_uniq
        on va_placements (candidate_id, role_id)
        where candidate_id is not null and role_id is not null;
    end if;
  end if;
end $$;

create or replace function public.hire_candidate(
  p_role_candidate_id uuid,
  p_employment_type   text,
  p_start_date        date default null,
  p_hourly_rate       numeric default null,
  p_currency          text default 'USD',
  p_hours_per_week    int default null
)
returns table (placement_id uuid, client_id uuid, role_filled boolean, already_hired boolean)
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  rc       va_role_candidates%rowtype;
  r        va_roles%rowtype;
  c        candidates%rowtype;
  v_place  uuid;
  v_hired  int;
begin
  select * into rc from va_role_candidates where id = p_role_candidate_id;
  if not found then
    raise exception 'That candidate isn''t on this role any more.' using errcode = 'P0002';
  end if;

  -- Lock the role first: every hire for this role queues behind it.
  select * into r from va_roles where id = rc.role_id for update;
  if not found then
    raise exception 'Couldn''t load the role.' using errcode = 'P0002';
  end if;
  -- Re-read the shortlist row now that we hold the role lock.
  select * into rc from va_role_candidates where id = p_role_candidate_id for update;
  if not found then
    raise exception 'That candidate isn''t on this role any more.' using errcode = 'P0002';
  end if;
  select * into c from candidates where id = rc.candidate_id;
  if not found then
    raise exception 'Couldn''t load the candidate.' using errcode = 'P0002';
  end if;

  select p.id into v_place from va_placements p
  where p.candidate_id = c.id and p.role_id = r.id
  order by p.created_at
  limit 1;

  -- Already hired: return the existing placement, change nothing.
  if v_place is not null and rc.stage = 'hired' then
    select count(*) into v_hired from va_role_candidates x where x.role_id = r.id and x.stage = 'hired';
    return query select v_place, r.client_id, v_hired >= r.headcount, true;
    return;
  end if;

  if r.status in ('filled', 'cancelled', 'on_hold') then
    raise exception 'This role is %. Reopen it before hiring.', replace(r.status::text, '_', ' ') using errcode = '22023';
  end if;
  if rc.stage = 'rejected' then
    raise exception '% was rejected for this role. Move them back to the shortlist first.', c.full_name using errcode = '22023';
  end if;

  select count(*) into v_hired from va_role_candidates x
  where x.role_id = r.id and x.stage = 'hired' and x.id <> rc.id;
  if v_hired >= r.headcount then
    raise exception 'All % seat(s) on this role are already filled.', r.headcount using errcode = '22023';
  end if;

  if v_place is null then
    insert into va_placements (
      client_id, va_name, va_email, va_phone, va_cv_url, role, employment_type,
      placement_status, candidate_id, role_id, start_date, hourly_rate, rate_currency, hours_per_week
    ) values (
      r.client_id, c.full_name, c.email, c.phone, c.cv_url, r.title, p_employment_type,
      'active', c.id, r.id, p_start_date, p_hourly_rate, coalesce(p_currency, 'USD'),
      coalesce(p_hours_per_week, r.hours_per_week)
    )
    returning id into v_place;
  end if;

  update va_role_candidates set stage = 'hired' where id = rc.id;
  update candidates set status = 'hired' where id = c.id;

  v_hired := v_hired + 1;
  if v_hired >= r.headcount then
    update va_roles set status = 'filled' where id = r.id;
  elsif r.status in ('open', 'sourcing', 'interviewing') then
    update va_roles set status = 'offer' where id = r.id;
  end if;

  return query select v_place, r.client_id, v_hired >= r.headcount, false;
end;
$$;

revoke execute on function public.hire_candidate(uuid, text, date, numeric, text, int) from public, anon;
grant  execute on function public.hire_candidate(uuid, text, date, numeric, text, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Send claims (the app sets this before calling the email provider and
--    clears it after; a claim older than 5 minutes counts as abandoned)
-- ---------------------------------------------------------------------------
alter table payment_reminders add column if not exists send_claimed_at timestamptz;
alter table client_emails     add column if not exists send_claimed_at timestamptz;
alter table checkins          add column if not exists send_claimed_at timestamptz;
