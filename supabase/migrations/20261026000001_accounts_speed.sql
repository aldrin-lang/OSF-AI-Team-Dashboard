-- ---------------------------------------------------------------------------
-- Accounts speed: the database filters, counts and pages client payments, so an
-- Accounts page fetches only what it shows (not the whole ledger every time).
-- All functions are SECURITY INVOKER: the caller's RLS still applies
-- (client_payments: Payments area; clients: Clients/Check-ins/Payments areas).
-- p_today is the Dublin business date from the app (dublinDate()), so the
-- database and the page agree on what "past due" means.
-- p_pipelines filters VA / AI clients (the sidebar's VA · AI · All switch).
-- Also: client_payments joins live sync, so teammates see payment updates.
-- ---------------------------------------------------------------------------

-- The tab a payment line is in on a given day. Same rules as stageOf() in src/lib/client-payments.ts.
create or replace function public.client_payment_stage(p_amount numeric, p_paid numeric, p_invoice text, p_due date, p_today date)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(p_paid, 0) > 0 and coalesce(p_paid, 0) + 0.005 >= coalesce(p_amount, 0) then 'paid'
    when nullif(btrim(coalesce(p_invoice, '')), '') is null then 'for-invoice'
    when coalesce(p_amount, 0) <= 0 then 'paid'                -- invoiced at zero: nothing to collect
    when p_due is not null and p_due < p_today then 'not-paid'
    else 'for-collection'
  end
$$;

-- Lines and money per tab and currency (the tiles at the top of every Accounts page).
create or replace function public.accounts_stage_totals(p_today date, p_pipelines text[])
returns table (stage text, currency text, lines bigint, amount numeric, owed numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select public.client_payment_stage(p.amount, p.paid_amount, p.invoice_no, p.due_on, p_today),
         p.currency,
         count(*),
         coalesce(sum(p.amount), 0),
         coalesce(sum(greatest(p.amount - p.paid_amount, 0)), 0)
  from client_payments p
  join clients c on c.id = p.client_id
  where c.pipeline::text = any (p_pipelines)
  group by 1, 2
$$;

-- Money recorded as received with a date paid in [p_from, p_to], per currency.
create or replace function public.accounts_received(p_from date, p_to date, p_pipelines text[])
returns table (currency text, received numeric, lines bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select p.currency, coalesce(sum(p.paid_amount), 0), count(*)
  from client_payments p
  join clients c on c.id = p.client_id
  where c.pipeline::text = any (p_pipelines)
    and p.paid_on between p_from and p_to
  group by 1
$$;

-- One row per client with payments: what they owe (per currency), how much is past due, last payment, latest period.
create or replace function public.accounts_client_summary(p_today date, p_pipelines text[])
returns table (client_id uuid, lines bigint, late_lines bigint, owed jsonb, late_owed jsonb, last_paid date, latest_period text, latest_vas text)
language sql
stable
security invoker
set search_path = public
as $$
  with x as (
    select p.*,
           public.client_payment_stage(p.amount, p.paid_amount, p.invoice_no, p.due_on, p_today) as stage,
           max(p.period_start) over (partition by p.client_id) as latest_start
    from client_payments p
    join clients c on c.id = p.client_id
    where c.pipeline::text = any (p_pipelines)
  ),
  money as (
    select client_id, currency,
           coalesce(sum(greatest(amount - paid_amount, 0)) filter (where stage in ('for-collection', 'not-paid')), 0) as owed,
           coalesce(sum(greatest(amount - paid_amount, 0)) filter (where stage = 'not-paid'), 0) as late_owed
    from x
    group by client_id, currency
  ),
  per_client as (
    select client_id,
           count(*) as lines,
           count(*) filter (where stage = 'not-paid') as late_lines,
           max(paid_on) as last_paid,
           (array_agg(period_label order by period_start desc nulls last))[1] as latest_period,
           string_agg(distinct va_name, ', ') filter (where period_start is not distinct from latest_start) as latest_vas
    from x
    group by client_id
  )
  select pc.client_id, pc.lines, pc.late_lines,
         (select jsonb_object_agg(m.currency, m.owed) from money m where m.client_id = pc.client_id and m.owed > 0),
         (select jsonb_object_agg(m.currency, m.late_owed) from money m where m.client_id = pc.client_id and m.late_owed > 0),
         pc.last_paid, pc.latest_period, pc.latest_vas
  from per_client pc
$$;

-- One page of a tab's lines (newest period first), with the total number of matching lines.
-- p_q searches client name, VA and invoice number (the app escapes % and _).
create or replace function public.accounts_stage_lines(
  p_today date, p_pipelines text[], p_stage text, p_q text, p_period text, p_limit int, p_offset int)
returns table (
  id uuid, client_id uuid, client_name text, va_name text, period_label text, period_start date, hours numeric,
  amount numeric, currency text, invoice_no text, invoiced_on date, due_on date, paid_amount numeric, paid_on date,
  note text, updated_at timestamptz, total_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select p.id, p.client_id, c.name, p.va_name, p.period_label, p.period_start, p.hours,
         p.amount, p.currency, p.invoice_no, p.invoiced_on, p.due_on, p.paid_amount, p.paid_on,
         p.note, p.updated_at, count(*) over ()
  from client_payments p
  join clients c on c.id = p.client_id
  where c.pipeline::text = any (p_pipelines)
    and public.client_payment_stage(p.amount, p.paid_amount, p.invoice_no, p.due_on, p_today) = p_stage
    and (p_period is null or p.period_label = p_period)
    and (p_q is null or c.name ilike '%' || p_q || '%' or p.va_name ilike '%' || p_q || '%' or p.invoice_no ilike '%' || p_q || '%')
  order by p.period_start desc nulls last, c.name, p.id
  limit least(greatest(coalesce(p_limit, 150), 1), 500)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

-- The periods that have lines in a tab (for the period filter), newest first.
create or replace function public.accounts_stage_periods(p_today date, p_pipelines text[], p_stage text)
returns table (period_label text, period_start date)
language sql
stable
security invoker
set search_path = public
as $$
  select p.period_label, max(p.period_start)
  from client_payments p
  join clients c on c.id = p.client_id
  where c.pipeline::text = any (p_pipelines)
    and public.client_payment_stage(p.amount, p.paid_amount, p.invoice_no, p.due_on, p_today) = p_stage
  group by 1
  order by 2 desc nulls last, 1
$$;

revoke execute on function public.client_payment_stage(numeric, numeric, text, date, date) from public, anon;
revoke execute on function public.accounts_stage_totals(date, text[]) from public, anon;
revoke execute on function public.accounts_received(date, date, text[]) from public, anon;
revoke execute on function public.accounts_client_summary(date, text[]) from public, anon;
revoke execute on function public.accounts_stage_lines(date, text[], text, text, text, int, int) from public, anon;
revoke execute on function public.accounts_stage_periods(date, text[], text) from public, anon;
grant execute on function public.client_payment_stage(numeric, numeric, text, date, date) to authenticated;
grant execute on function public.accounts_stage_totals(date, text[]) to authenticated;
grant execute on function public.accounts_received(date, date, text[]) to authenticated;
grant execute on function public.accounts_client_summary(date, text[]) to authenticated;
grant execute on function public.accounts_stage_lines(date, text[], text, text, text, int, int) to authenticated;
grant execute on function public.accounts_stage_periods(date, text[], text) to authenticated;

-- live sync for payment updates (src/components/realtime-sync.tsx)
alter publication supabase_realtime add table client_payments;
