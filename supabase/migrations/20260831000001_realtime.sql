-- Live sync: publish row changes on the tables the app renders so every open
-- session updates within ~1s. RLS still applies — only active members receive
-- changes (their SELECT policy is checked per event).
alter publication supabase_realtime add table clients;
alter publication supabase_realtime add table client_lines;
alter publication supabase_realtime add table checklist_items;
alter publication supabase_realtime add table concerns;
alter publication supabase_realtime add table comments;
alter publication supabase_realtime add table client_emails;
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table activity_log;
alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table pipeline_stages;
