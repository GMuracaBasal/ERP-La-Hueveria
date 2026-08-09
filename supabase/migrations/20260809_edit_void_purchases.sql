-- Editar / Anular Compras (espejo de ventas).
-- RECORDÁ: aplicar a mano en el SQL Editor de Supabase.

alter table public.purchases
  add column if not exists voided boolean not null default false;

alter table public.purchases
  add column if not exists voided_at timestamptz;

alter table public.purchases
  add column if not exists voided_by uuid references public.users(id);

create table if not exists public.purchase_audit_log (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id),
  action text not null check (action in ('edit', 'void')),
  reason text not null check (length(trim(reason)) > 0),
  performed_by uuid not null references public.users(id),
  performed_at timestamptz not null default now(),
  snapshot jsonb
);

create index if not exists idx_purchase_audit_log_purchase_id
  on public.purchase_audit_log (purchase_id);
