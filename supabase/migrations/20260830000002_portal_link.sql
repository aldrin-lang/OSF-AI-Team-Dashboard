-- Optional per-client link into the client portal (portal.outsourceforce.ai).
-- Left null for most clients — the app falls back to the portal home.
alter table clients add column if not exists portal_url text;
