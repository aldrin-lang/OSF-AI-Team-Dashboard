-- Removes the demo data added by demo_ops_seed.sql (invoices, reminders,
-- check-ins and the VA placement go with the client via ON DELETE CASCADE).
delete from clients where name = 'DEMO – Sample Plumbing Ltd';
delete from candidates where external_key = 'demo:juan';
