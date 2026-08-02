-- Agrega email opcional, baja lógica y módulos granulares a la tabla users.
alter table public.users
  add column if not exists email   text,
  add column if not exists active  boolean not null default true,
  add column if not exists modules jsonb   not null default '[]'::jsonb;

-- Backfill: los vendedores existentes conservan su acceso actual (POS + Caja).
-- Los admins no necesitan módulos (tienen acceso total), quedan en [].
update public.users
set modules = '["pos","caja"]'::jsonb
where role = 'vendedor'
  and (modules is null or modules = '[]'::jsonb);
