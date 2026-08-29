-- ============================================================================
-- Seed: pipeline stages, stage gates, checklist templates, option lists
-- ============================================================================

-- ---------------------------------------------------------------------------
-- checklist_templates  (rows copied onto a client when it is created)
-- ---------------------------------------------------------------------------
create table checklist_templates (
  id       uuid primary key default gen_random_uuid(),
  pipeline pipeline_type not null,
  key      text not null,
  label    text not null,
  position int not null default 0,
  unique (pipeline, key)
);
alter table checklist_templates enable row level security;
create policy checklist_templates_select on checklist_templates
  for select using (public.is_active_member());
create policy checklist_templates_admin on checklist_templates
  for all using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on checklist_templates to authenticated;
grant select on checklist_templates to anon;

-- ---------------------------------------------------------------------------
-- AI pipeline stages
-- ---------------------------------------------------------------------------
insert into pipeline_stages (pipeline, name, position, is_terminal, sla_days) values
  ('ai', 'Sale closed',         1, false, 3),
  ('ai', 'Docs collection',     2, false, 7),
  ('ai', 'Regulatory Bundle',   3, false, 14),
  ('ai', 'Provisioning',        4, false, 5),
  ('ai', 'Build',               5, false, 7),
  ('ai', 'Check by Paul',       6, false, 3),
  ('ai', 'Client testing',      7, false, 7),
  ('ai', 'Live',                8, false, null),
  ('ai', 'Withdrawn',           9, true,  null),
  ('ai', 'Rejected',           10, true,  null);

-- ---------------------------------------------------------------------------
-- VA pipeline stages
-- ---------------------------------------------------------------------------
insert into pipeline_stages (pipeline, name, position, is_terminal, sla_days) values
  ('va', 'Sale closed',          1, false, 2),
  ('va', 'Interview scheduled',  2, false, 5),
  ('va', 'VA matched',           3, false, 5),
  ('va', 'Start scheduled',      4, false, 7),
  ('va', 'Active',               5, false, null),
  ('va', 'Inactive',             6, true,  null);

-- ---------------------------------------------------------------------------
-- AI checklist template
-- ---------------------------------------------------------------------------
insert into checklist_templates (pipeline, key, label, position) values
  ('ai', 'docs_received',      'Client documents received',                  1),
  ('ai', 'rb_submitted',       'Regulatory Bundle submitted to Twilio',      2),
  ('ai', 'rb_approved',        'Regulatory Bundle approved',                 3),
  ('ai', 'twilio_provisioned', 'Twilio subaccount + number provisioned',     4),
  ('ai', 'ghl_subaccount',     'GHL sub-account set up',                     5),
  ('ai', 'prompt_approved',    'Prompt approved',                           6),
  ('ai', 'kb_approved',        'Knowledge Base approved',                    7),
  ('ai', 'workflow_done',      'Workflow built',                            8),
  ('ai', 'booking_integrated', 'Booking system integrated',                  9),
  ('ai', 'paul_check',         'Checked by Paul',                          10),
  ('ai', 'test_call_passed',   'Test call passed',                         11);

-- ---------------------------------------------------------------------------
-- VA checklist template
-- ---------------------------------------------------------------------------
insert into checklist_templates (pipeline, key, label, position) values
  ('va', 'va_sourced',          'VA candidate sourced',           1),
  ('va', 'interview_done',       'Client interview completed',     2),
  ('va', 'va_matched',           'VA matched & accepted',          3),
  ('va', 'hiring_fee_invoiced',  'Hiring fee invoiced',            4),
  ('va', 'start_confirmed',      'Start date confirmed',           5);

-- ---------------------------------------------------------------------------
-- Stage gates: a checklist key that must be `done` before a client can move
-- to any stage positioned after the gate's stage.
-- ---------------------------------------------------------------------------
insert into stage_gates (stage_id, required_checklist_key)
select id, 'rb_approved'     from pipeline_stages where pipeline='ai' and name='Regulatory Bundle';
insert into stage_gates (stage_id, required_checklist_key)
select id, 'prompt_approved' from pipeline_stages where pipeline='ai' and name='Build';
insert into stage_gates (stage_id, required_checklist_key)
select id, 'kb_approved'     from pipeline_stages where pipeline='ai' and name='Build';
insert into stage_gates (stage_id, required_checklist_key)
select id, 'workflow_done'   from pipeline_stages where pipeline='ai' and name='Build';
insert into stage_gates (stage_id, required_checklist_key)
select id, 'paul_check'      from pipeline_stages where pipeline='ai' and name='Check by Paul';
insert into stage_gates (stage_id, required_checklist_key)
select id, 'va_matched'      from pipeline_stages where pipeline='va' and name='VA matched';

-- ---------------------------------------------------------------------------
-- Option lists (seeded from the spreadsheet's observed values)
-- ---------------------------------------------------------------------------
insert into option_lists (kind, value, position) values
  ('source', 'AI-ads',      1),
  ('source', 'Cross-Sell',  2),
  ('source', 'Referral',    3),
  ('source', 'Outbound',    4),
  ('source', 'Other',       5),
  ('booking_system', 'GHL Calendar', 1),
  ('booking_system', 'GetTimely',    2),
  ('booking_system', 'Cliniko',      3),
  ('booking_system', 'Calendly',     4),
  ('booking_system', 'Acuity',       5),
  ('booking_system', 'None',         6),
  ('booking_system', 'Other',        7),
  ('country', 'United Kingdom', 1),
  ('country', 'Ireland',        2),
  ('country', 'New Zealand',    3),
  ('country', 'Australia',      4),
  ('country', 'United States',  5),
  ('country', 'Other',          6),
  ('concern_type', 'Call quality',        1),
  ('concern_type', 'Booking / calendar',  2),
  ('concern_type', 'Wrong information',   3),
  ('concern_type', 'Missed / dropped call', 4),
  ('concern_type', 'Billing',            5),
  ('concern_type', 'Integration',        6),
  ('concern_type', 'Other',              7);
