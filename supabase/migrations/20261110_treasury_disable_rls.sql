-- Tesorería: apagar RLS y dar GRANT (auth en la app, sin políticas).
-- RECORDÁ: aplicar a mano en el SQL Editor de Supabase.

alter table public.treasury_accounts disable row level security;
alter table public.treasury_transfers disable row level security;

grant select, insert, update, delete on table public.treasury_accounts to anon, authenticated, service_role;
grant select, insert, update, delete on table public.treasury_transfers to anon, authenticated, service_role;
