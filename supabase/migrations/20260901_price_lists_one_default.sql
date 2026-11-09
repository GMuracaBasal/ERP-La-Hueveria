-- Garantiza una sola lista con is_default = true.
-- RECORDÁ: aplicar a mano en el SQL Editor de Supabase; este archivo es registro histórico.

create unique index if not exists price_lists_one_default
  on public.price_lists ((true))
  where is_default = true;
