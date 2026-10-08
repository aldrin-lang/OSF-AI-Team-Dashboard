-- Security hardening (from the Oct 2026 read-only audit).
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Members can no longer promote themselves.
--    profiles_update_self lets a user update their own row (to change their
--    name), but RLS can't limit WHICH columns. This trigger blocks changes to
--    role / active / email / id unless the caller is an admin. Server code that
--    uses the service-role key (no signed-in user) is unaffected.
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.id     is distinct from old.id
  or new.role   is distinct from old.role
  or new.active is distinct from old.active
  or new.email  is distinct from old.email then
    raise exception 'Only an admin can change role, access or email'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_update on public.profiles;
create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------------
-- 2. log_activity(): only active members (or the server's service role) can
--    write audit entries, and anonymous callers can't call it at all.
-- ---------------------------------------------------------------------------
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
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_active_member() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_verb is null or length(p_verb) > 60 then
    raise exception 'Invalid activity entry' using errcode = '22023';
  end if;
  insert into public.activity_log (entity, entity_id, actor_id, verb, summary, changes)
  values (p_entity, p_entity_id, auth.uid(), p_verb, left(p_summary, 2000), p_changes)
  returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.log_activity(entity_type, uuid, text, text, jsonb) from public, anon;
grant  execute on function public.log_activity(entity_type, uuid, text, text, jsonb) to authenticated, service_role;
