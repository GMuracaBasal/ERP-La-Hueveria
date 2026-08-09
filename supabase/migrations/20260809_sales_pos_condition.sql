-- Paso 2: Mostrador vs Mayorista + condición Contado / Cuenta Corriente.
-- RECORDÁ: aplicar a mano en el SQL Editor de Supabase; este archivo es registro histórico.

-- ─── Columnas nuevas en sales ────────────────────────────────────────
alter table public.sales
  add column if not exists point_of_sale text not null default 'mostrador';

alter table public.sales
  add column if not exists condition text not null default 'contado';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sales_point_of_sale_check'
  ) then
    alter table public.sales
      add constraint sales_point_of_sale_check
      check (point_of_sale in ('mostrador', 'mayorista'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'sales_condition_check'
  ) then
    alter table public.sales
      add constraint sales_condition_check
      check (condition in ('contado', 'cuenta_corriente'));
  end if;
end $$;

-- payment_method = medio real del cobro (null cuando condition = cuenta_corriente)
alter table public.sales
  alter column payment_method drop not null;

-- Backfill: el parche viejo 'Cuenta Corriente' pasa a condition
update public.sales
set
  condition = 'cuenta_corriente',
  payment_method = null
where payment_method = 'Cuenta Corriente';

-- Heurística de origen: sin cliente → mostrador; con cliente → mayorista
update public.sales
set point_of_sale = 'mostrador'
where customer_id is null;

update public.sales
set point_of_sale = 'mayorista'
where customer_id is not null;
