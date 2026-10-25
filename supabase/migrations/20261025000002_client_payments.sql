-- ---------------------------------------------------------------------------
-- Client payments: every client's own payment record in the CRM (Accounts).
-- One row = one billing line: a client, a VA, a period (e.g. "1-15 October 2026"),
-- the amount, the invoice number, and whether / when it was paid.
-- Accounts tabs read straight from these rows:
--   For invoice     no invoice number yet
--   For collection  invoiced, not yet due (or no due date)
--   Not paid yet    invoiced, past due, not fully paid
--   Paid            paid_amount covers the amount
-- Loaded once from Customer Payments › Client VA Payments (source_key keeps the
-- import idempotent); from then on the team records payments here only.
-- Access: the Payments area (Accounts department), like invoices.
-- ---------------------------------------------------------------------------
create table client_payments (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients(id) on delete cascade,
  placement_id   uuid references va_placements(id) on delete set null,
  va_name        text,
  period_label   text not null check (length(period_label) between 1 and 80),
  period_start   date,
  period_end     date,
  hours          numeric(8,2),
  amount         numeric(12,2) not null default 0 check (amount >= 0),
  currency       text not null default 'EUR' check (currency in ('GBP', 'EUR', 'NZD', 'AUD', 'CAD', 'USD')),
  invoice_no     text,
  invoiced_on    date,
  due_on         date,
  paid_amount    numeric(12,2) not null default 0 check (paid_amount >= 0),
  paid_on        date,
  note           text,
  source_key     text unique,                 -- import key (sheet row), null for rows added in the CRM
  created_by     uuid references profiles(id) on delete set null,
  updated_by     uuid references profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index client_payments_client_idx on client_payments (client_id, period_start);
create index client_payments_period_idx on client_payments (period_start);
create trigger client_payments_touch before update on client_payments
  for each row execute function public.touch_updated_at();

alter table client_payments enable row level security;
create policy client_payments_select on client_payments for select using (public.has_area('payments'));
create policy client_payments_insert on client_payments for insert with check (public.has_area('payments'));
create policy client_payments_update on client_payments for update using (public.has_area('payments')) with check (public.has_area('payments'));
create policy client_payments_delete on client_payments for delete using (public.has_area('payments'));
grant select, insert, update, delete on client_payments to authenticated;
