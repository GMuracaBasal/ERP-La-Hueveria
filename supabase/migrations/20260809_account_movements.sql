-- Libro de Cuentas Corrientes (Paso 1).
-- RECORDÁ: aplicar a mano en el SQL Editor de Supabase; este archivo es registro histórico.

create table if not exists public.account_movements (
  id             uuid primary key default gen_random_uuid(),
  date           timestamptz not null default now(),
  customer_id    uuid references public.customers(id),
  supplier_id    uuid references public.suppliers(id),
  concept        text not null,
  debe           numeric(14,2) not null default 0 check (debe  >= 0),
  haber          numeric(14,2) not null default 0 check (haber >= 0),
  reference_type text not null check (reference_type in ('venta','compra','cobro','pago','ajuste')),
  reference_id   uuid,
  created_by     uuid references public.users(id),
  created_at     timestamptz not null default now(),
  voided         boolean not null default false,
  voided_at      timestamptz,
  voided_by      uuid references public.users(id),
  constraint uno_solo_titular check (
    (customer_id is not null and supplier_id is null) or
    (customer_id is null and supplier_id is not null)
  ),
  constraint debe_o_haber check (not (debe > 0 and haber > 0))
);

create index if not exists idx_accmov_customer
  on public.account_movements (customer_id, date)
  where voided = false;

create index if not exists idx_accmov_supplier
  on public.account_movements (supplier_id, date)
  where voided = false;
