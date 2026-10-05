-- ============================================================================
-- DEMO data for the Check-ins / Payments / Candidates pages (NOT a migration).
-- Paste into the Supabase SQL editor once to see the pages with something in
-- them. Safe to run twice (skips if the demo client already exists).
-- Remove everything with supabase/demo_ops_remove.sql.
--
-- Emails go to example.com addresses, which never reach a real person. To test
-- sending for real, change the billing email on a demo invoice to your own.
-- ============================================================================
do $$
declare
  v_client uuid;
  v_place  uuid;
  v_inv    uuid;
begin
  if exists (select 1 from clients where name = 'DEMO – Sample Plumbing Ltd') then
    raise notice 'Demo data already there';
    return;
  end if;

  insert into clients (pipeline, name, contact_email, country, source, start_date, status, checkin_every_days, remarks)
  values ('va', 'DEMO – Sample Plumbing Ltd', 'owner.demo@example.com', 'UK', 'Demo', current_date - 40, 'live', 14,
          'Fake client for testing the dashboard. Delete with demo_ops_remove.sql')
  returning id into v_client;

  insert into va_placements (client_id, va_name, va_email, va_phone, role, employment_type, placement_status, checkin_every_days)
  values (v_client, 'DEMO – Maria Santos', 'maria.demo@example.com', '+639171234567', 'General Admin VA', 'Full time', 'active', 14)
  returning id into v_place;

  -- Invoices: one paid, one due in 2 days, one 8 days overdue, one due later
  insert into invoices (client_id, number, description, amount, currency, issued_on, due_on, status, paid_on)
  values (v_client, 'DEMO-1001', 'VA service, last month', 1200, 'GBP', current_date - 45, current_date - 31, 'paid', current_date - 30);

  insert into invoices (client_id, number, description, amount, currency, issued_on, due_on)
  values (v_client, 'DEMO-1002', 'VA service, this month', 1200, 'GBP', current_date - 12, current_date + 2)
  returning id into v_inv;
  insert into payment_reminders (invoice_id, stage, subject, body)
  values (v_inv, 'before_due', 'Friendly reminder: invoice DEMO-1002 is due soon',
          E'Hi there,\n\nJust a friendly heads-up that invoice DEMO-1002 for £1,200.00 is due in 2 days.\n\nIf it''s already on its way, thank you, and please ignore this note.\n\nKind regards,\nAccounts team\nOutsourceForce');

  insert into invoices (client_id, number, description, amount, currency, issued_on, due_on)
  values (v_client, 'DEMO-1003', 'Hiring fee', 350, 'GBP', current_date - 22, current_date - 8)
  returning id into v_inv;
  insert into payment_reminders (invoice_id, stage, subject, body, status, sent_at)
  values (v_inv, 'overdue_3', 'Invoice DEMO-1003 is now overdue',
          E'Hi there,\n\nOur records show invoice DEMO-1003 for £350.00 is still outstanding.\n\nKind regards,\nAccounts team\nOutsourceForce',
          'sent', now() - interval '5 days');
  insert into payment_reminders (invoice_id, stage, subject, body)
  values (v_inv, 'overdue_7', 'Second reminder: invoice DEMO-1003 is 7 days overdue',
          E'Hi there,\n\nInvoice DEMO-1003 for £350.00 is now a week overdue.\n\nPlease arrange payment at your earliest convenience, or reply to let us know the expected payment date.\n\nKind regards,\nAccounts team\nOutsourceForce');

  insert into invoices (client_id, number, description, amount, currency, issued_on, due_on)
  values (v_client, 'DEMO-1004', 'VA overtime', 180, 'EUR', current_date, current_date + 20);

  -- Check-ins: one to send (client), one awaiting reply (VA), one at-risk reply
  insert into checkins (kind, client_id, due_on, contact_name, contact_email, channel, subject, message)
  values ('client', v_client, current_date, 'Tom', 'owner.demo@example.com', 'email',
          'Checking in: how is your VA working out?',
          E'Hi Tom,\n\nJust a quick check-in to see how things are going with Maria, your VA.\n\n1. Is everything working the way you expected?\n2. Is there anything you''d like us to change or improve?\n\nA short reply is perfect.\n\nBest regards,\nOutsourceForce team');

  insert into checkins (kind, client_id, placement_id, due_on, contact_name, contact_email, contact_phone, channel,
                        status, subject, message, sent_at)
  values ('va', v_client, v_place, current_date - 3, 'DEMO – Maria Santos', 'maria.demo@example.com', '+639171234567',
          'whatsapp', 'sent', 'Quick check-in',
          E'Hi Maria,\n\nJust checking in to see how everything is going with Sample Plumbing.\n\nOutsourceForce team',
          now() - interval '3 days');

  insert into checkins (kind, client_id, due_on, contact_name, contact_email, channel, status, subject, message, sent_at,
                        reply, mood, ai_summary, follow_up)
  values ('client', v_client, current_date - 14, 'Tom', 'owner.demo@example.com', 'email', 'replied',
          'Checking in', 'Hi Tom, how are things going?', now() - interval '14 days',
          'Honestly the VA is slow replying to emails in the afternoon and we missed two quotes. Not sure it''s worth it.',
          'at_risk', 'Client is unhappy with afternoon response times and missed two quotes; questioning value.',
          'Call Tom today and agree afternoon cover hours with Maria.');

  -- Candidate, already screened
  insert into candidates (external_key, full_name, email, country, source, applied_role, experience, hourly_rate, availability,
                          answers, ai_score, ai_recommended_role, ai_alt_roles, ai_summary, ai_strengths, ai_concerns,
                          ai_screened_at, status)
  values ('demo:juan', 'DEMO – Juan Dela Cruz', 'juan.demo@example.com', 'Philippines', 'OnlineJobs.ph', 'Virtual Assistant',
          '4 years: admin for a UK roofing company, Xero invoicing', '$5', 'Full time',
          '{"Tell us about your experience": "4 years admin for a UK roofing company: quotes, invoices in Xero, scheduling jobs."}'::jsonb,
          78, 'Bookkeeper / Accountant VA', array['General Admin VA'],
          'Solid UK trades admin background with hands-on Xero invoicing. Good fit for a bookkeeping-heavy admin role.',
          array['UK trades experience', 'Xero invoicing', 'Realistic rate'], array['No CV uploaded', 'Check English on a call'],
          now(), 'screened');
end $$;
