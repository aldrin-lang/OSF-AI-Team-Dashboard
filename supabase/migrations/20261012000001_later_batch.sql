-- ===========================================================================
-- Audit "Later" batch. Safe to re-run.
--   1. Disabled accounts can read their own profile, so they land on
--      /inactive instead of looping between / and /login.
--   2. set_sheet_cells(): a paste merges only the pasted cells, in one
--      transaction, so it never overwrites a teammate's other columns.
--   3. Pipeline gates enforced in the database: a client's stage must belong
--      to its pipeline, and moving past a gated stage needs its checklist
--      items done, even through the API.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Own profile is always readable (operational access still needs active)
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_own on profiles;
create policy profiles_select_own on profiles for select using (id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Sheets: merge many cells at once
--    p_changes = [{ "row": "<uuid>", "cells": { "<column uuid>": value | null } }, ...]
--    null removes the cell. All rows or none: if any row can't be written
--    (deleted, or no edit access) the whole paste is rolled back.
-- ---------------------------------------------------------------------------
create or replace function public.set_sheet_cells(p_changes jsonb)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  ch     jsonb;
  v_n    int := 0;
  v_hit  int;
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'p_changes must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(p_changes) > 2000 then
    raise exception 'Too many rows in one paste (most is 2000).' using errcode = '22023';
  end if;

  for ch in select value from jsonb_array_elements(p_changes) loop
    if jsonb_typeof(ch -> 'cells') <> 'object' then
      raise exception 'Each change needs a cells object' using errcode = '22023';
    end if;
    update sheet_rows
       set cells = (cells - array(select k from jsonb_each(ch -> 'cells') e(k, v) where v = 'null'::jsonb))
                   || jsonb_strip_nulls(ch -> 'cells'),
           updated_by = auth.uid()
     where id = (ch ->> 'row')::uuid;
    get diagnostics v_hit = row_count;
    if v_hit = 0 then
      raise exception 'A row in this paste was deleted, or you don''t have edit access (row-level security).' using errcode = '42501';
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke execute on function public.set_sheet_cells(jsonb) from public, anon;
grant  execute on function public.set_sheet_cells(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Pipeline stage rules at the database boundary
--    Mirrors src/lib/server/gates.ts: to be at a stage, every gate on an
--    EARLIER stage of the same pipeline must have its checklist item done.
--    Server jobs/imports (no signed-in user) only get the pipeline check.
-- ---------------------------------------------------------------------------
create or replace function public.guard_client_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage   pipeline_stages%rowtype;
  v_missing text;
begin
  if new.stage_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.stage_id is not distinct from old.stage_id
     and new.pipeline is not distinct from old.pipeline then
    return new;
  end if;

  select * into v_stage from pipeline_stages where id = new.stage_id;
  if not found then
    raise exception 'That stage doesn''t exist.' using errcode = '23503';
  end if;
  if v_stage.pipeline <> new.pipeline then
    raise exception 'That stage belongs to the other service''s pipeline.' using errcode = '22023';
  end if;

  if auth.uid() is null then
    return new;
  end if;

  select string_agg(coalesce(ci.label, g.required_checklist_key), ', ' order by s.position)
    into v_missing
  from stage_gates g
  join pipeline_stages s on s.id = g.stage_id
  left join checklist_items ci on ci.client_id = new.id and ci.key = g.required_checklist_key
  where s.pipeline = v_stage.pipeline
    and s.position < v_stage.position
    and coalesce(ci.status::text, '') <> 'done';

  if v_missing is not null then
    raise exception 'Blocked, not done: %', v_missing using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_client_stage() from public, anon, authenticated;

drop trigger if exists clients_guard_stage on clients;
create trigger clients_guard_stage
  before insert or update of stage_id, pipeline on clients
  for each row execute function public.guard_client_stage();
