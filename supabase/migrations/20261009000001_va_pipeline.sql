-- ============================================================================
-- VA outsourcing is the core of the dashboard again: restore the VA client
-- pipeline (stages, onboarding checklist, gate). Additive and safe to re-run.
-- ============================================================================
insert into pipeline_stages (pipeline, name, position, is_terminal, sla_days) values
  ('va', 'Sale closed',         1, false, 2),
  ('va', 'Interview scheduled', 2, false, 5),
  ('va', 'VA matched',          3, false, 5),
  ('va', 'Start scheduled',     4, false, 7),
  ('va', 'Active',              5, false, null),
  ('va', 'Inactive',            6, true,  null)
on conflict (pipeline, name) do nothing;

insert into checklist_templates (pipeline, key, label, position) values
  ('va', 'va_sourced',          'VA candidate sourced',       1),
  ('va', 'interview_done',      'Client interview completed', 2),
  ('va', 'va_matched',          'VA matched & accepted',      3),
  ('va', 'hiring_fee_invoiced', 'Hiring fee invoiced',        4),
  ('va', 'start_confirmed',     'Start date confirmed',       5)
on conflict (pipeline, key) do nothing;

-- A client can't move past "VA matched" until the match is ticked off.
insert into stage_gates (stage_id, required_checklist_key)
select id, 'va_matched' from pipeline_stages where pipeline = 'va' and name = 'VA matched'
on conflict (stage_id, required_checklist_key) do nothing;
