-- ============================================================================
-- Company name + contact email on clients, and templated handover emails
-- ============================================================================

alter table clients
  add column if not exists company_name text,
  add column if not exists contact_email text;

create type email_status as enum ('draft', 'sent');

-- ---------------------------------------------------------------------------
-- email_templates  (admin-managed; support {{variables}})
--   trigger: 'manual'  |  'on_stage:<stage name>'
-- ---------------------------------------------------------------------------
create table email_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  subject     text not null,
  body        text not null,
  trigger     text not null default 'manual',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table email_templates enable row level security;
create trigger email_templates_touch before update on email_templates
  for each row execute function public.touch_updated_at();
create policy email_templates_select on email_templates
  for select using (public.is_active_member());
create policy email_templates_admin on email_templates
  for all using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on email_templates to authenticated;
grant select on email_templates to anon;

-- ---------------------------------------------------------------------------
-- client_emails  (per-client drafts + sent record; never auto-sent)
-- ---------------------------------------------------------------------------
create table client_emails (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  template_id uuid references email_templates(id) on delete set null,
  to_email    text,
  subject     text not null,
  body        text not null,
  status      email_status not null default 'draft',
  created_by  uuid references profiles(id) on delete set null,
  sent_by     uuid references profiles(id) on delete set null,
  sent_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table client_emails enable row level security;
create index client_emails_client_idx on client_emails(client_id);
create trigger client_emails_touch before update on client_emails
  for each row execute function public.touch_updated_at();
create policy client_emails_select on client_emails
  for select using (public.is_active_member());
create policy client_emails_write on client_emails
  for all using (public.is_active_member()) with check (public.is_active_member());
grant select, insert, update, delete on client_emails to authenticated;

-- ---------------------------------------------------------------------------
-- Seed: default handover template, auto-drafted when a client hits
-- "Client testing"
-- ---------------------------------------------------------------------------
insert into email_templates (name, subject, body, trigger) values (
  'AI Receptionist Handover',
  'Your AI receptionist is ready to test — {{company}}',
  E'Hi {{contact}},\n\n'
  || E'Great news — your AI receptionist for {{company}} is built and ready for you to test.\n\n'
  || E'AI phone number(s):\n{{ai_phones}}\n\n'
  || E'What it does:\n'
  || E'- Answers your calls 24/7 in a natural voice\n'
  || E'- Captures caller name, number and reason for calling\n'
  || E'- Books appointments straight into {{booking_system}}\n'
  || E'- Sends you a summary of every call\n\n'
  || E'Your dashboard (call logs, transcripts, settings):\n{{dashboard_url}}\n\n'
  || E'How to test:\n'
  || E'1. Call the number above from your own phone\n'
  || E'2. Try a few scenarios — a booking, a general question, a message for a person\n'
  || E'3. Reply to this email with anything you''d like changed\n\n'
  || E'Once you''re happy, we''ll point your business line to the AI and you''re live.\n\n'
  || E'Any questions, just reply here.\n\n'
  || E'Best,\n{{manager}}\nOutsourceForce.ai',
  'on_stage:Client testing'
);
