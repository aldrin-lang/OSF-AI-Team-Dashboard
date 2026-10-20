-- ---------------------------------------------------------------------------
-- Team numbers (Reports › Team numbers): a copy of the ops Google Sheets the
-- teams still fill in, loaded by scripts/import-ops-numbers.ts.
--   daily_numbers ← OSF_Mastersheet 2026 › 6. Daily Numbers Crunch
--                   one row per metric: section = department, owner = person
--                   in charge, sub_label = quarter, cells = one per day
--   accounts      ← Customer Payments [New] › OSF VA MOM v2
--                   one row per month: section = FY, label = month,
--                   sub_label = country breakdown, cells = one per KPI
-- cells keep the sheet's order: [{ "k": day or KPI, "v": value, "n": cell note }]
-- Everyone with the Reports area can read; only the import (service role) writes.
-- ---------------------------------------------------------------------------
create table ops_numbers (
  id           uuid primary key default gen_random_uuid(),
  source       text not null check (source in ('daily_numbers', 'accounts')),
  section      text not null,
  label        text not null,
  sub_label    text not null default '',
  owner        text,
  target       text,
  position     int not null default 0,
  cells        jsonb not null default '[]'::jsonb,
  imported_at  timestamptz not null default now(),
  unique (source, section, label, sub_label)
);
create index ops_numbers_source_idx on ops_numbers (source, position);

alter table ops_numbers enable row level security;
create policy ops_numbers_select on ops_numbers for select using (public.has_area('reports'));
grant select on ops_numbers to authenticated;
