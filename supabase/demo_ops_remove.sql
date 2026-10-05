-- Removes the demo data added by demo_ops_seed.sql (invoices, reminders,
-- check-ins and the VA placement go with the client via ON DELETE CASCADE).
-- LIKE patterns so it also matches names whose dash got mangled when pasted.
delete from clients where name like 'DEMO%Sample Plumbing Ltd';
delete from candidates where external_key = 'demo:juan';
