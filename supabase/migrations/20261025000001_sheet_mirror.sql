-- ---------------------------------------------------------------------------
-- Sheet mirror: read-only copies of the team's Google Sheet tabs, shown in the
-- dashboard under each department (Accounts, Recruitment, VA Managers, ...).
-- The sheets stay the source of truth. An Apps Script ("OSF Morning Report"
-- project, syncDashboard) reads each configured tab every 30 minutes and POSTs
-- it to /api/sync/sheets, which writes these tables with the service role.
--
--   sheet_mirror       one row per tab: where it shows (department + area),
--                      its label, source link, layout (frozen rows/cols, widths)
--   sheet_mirror_parts the tab's cells, split into parts so each upload stays
--                      under Vercel's request size limit. Each part has its own
--                      style table: rows = [[value, styleIndex, note?], ...]
-- Who can read a tab follows the department access given in Admin (has_area).
-- ---------------------------------------------------------------------------
create table sheet_mirror (
  key           text primary key check (key ~ '^[a-z0-9-]{1,60}$'),
  department    text not null,
  area          text not null check (area in ('leads', 'clients', 'checkins', 'candidates', 'payments', 'reports')),
  label         text not null,
  position      int  not null default 0,
  source_name   text not null default '',
  source_url    text not null default '',
  frozen_rows   int  not null default 0,
  frozen_cols   int  not null default 0,
  col_widths    jsonb not null default '[]'::jsonb,
  merges        jsonb not null default '[]'::jsonb,
  row_count     int  not null default 0,
  col_count     int  not null default 0,
  parts         int  not null default 0,
  sync_id       text not null default '',
  synced_at     timestamptz not null default now()
);
create index sheet_mirror_dept_idx on sheet_mirror (department, position);

-- Parts are written under a new sync_id; the tab switches to them only when the
-- last part has arrived, so a page never shows half of an upload.
create table sheet_mirror_parts (
  key      text not null references sheet_mirror(key) on delete cascade,
  sync_id  text not null,
  part     int  not null,
  styles   jsonb not null default '[]'::jsonb,
  rows     jsonb not null default '[]'::jsonb,
  primary key (key, sync_id, part)
);

alter table sheet_mirror enable row level security;
alter table sheet_mirror_parts enable row level security;

create policy sheet_mirror_select on sheet_mirror for select
  using (public.has_area(area));
create policy sheet_mirror_parts_select on sheet_mirror_parts for select
  using (exists (select 1 from sheet_mirror m where m.key = sheet_mirror_parts.key and public.has_area(m.area)));

grant select on sheet_mirror, sheet_mirror_parts to authenticated;
