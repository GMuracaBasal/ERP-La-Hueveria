-- Paso 3: Cobros a clientes y Pagos a proveedores.
-- RECORDÁ: aplicar a mano en el SQL Editor de Supabase; este archivo es registro histórico.

create table if not exists public.payments (
  id             uuid primary key default gen_random_uuid(),
  type           text not null check (type in ('cobro', 'pago')),
  customer_id    uuid references public.customers(id),
  supplier_id    uuid references public.suppliers(id),
  date           timestamptz not null default now(),
  amount         numeric(14,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('efectivo', 'transferencia', 'tarjeta', 'qr')),
  concept        text,
  created_by     uuid references public.users(id),
  created_at     timestamptz not null default now(),
  voided         boolean not null default false,
  voided_at      timestamptz,
  voided_by      uuid references public.users(id),
  constraint payments_titular_segun_tipo check (
    (type = 'cobro' and customer_id is not null and supplier_id is null) or
    (type = 'pago'  and supplier_id is not null and customer_id is null)
  )
);

create index if not exists idx_payments_customer
  on public.payments (customer_id, date)
  where voided = false;

create index if not exists idx_payments_supplier
  on public.payments (supplier_id, date)
  where voided = false;

-- Labels legibles para finance_movements (mismo criterio que ventas)
create or replace function public.payment_method_label(p_method text)
returns text
language sql
immutable
as $$
  select case p_method
    when 'efectivo' then 'Efectivo'
    when 'transferencia' then 'Transferencia'
    when 'tarjeta' then 'Tarjeta'
    when 'qr' then 'QR'
    else p_method
  end;
$$;

-- Cobro/Pago atómico: payments + account_movements + finance_movements
create or replace function public.register_payment(
  p_type text,
  p_customer_id uuid,
  p_supplier_id uuid,
  p_date timestamptz,
  p_amount numeric,
  p_payment_method text,
  p_concept text,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_amount numeric(14,2);
  v_label text;
  v_acc_concept text;
  v_fin_concept text;
  v_fin_type text;
begin
  if p_type not in ('cobro', 'pago') then
    raise exception 'INVALID_TYPE';
  end if;
  if p_payment_method not in ('efectivo', 'transferencia', 'tarjeta', 'qr') then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_type = 'cobro' and (p_customer_id is null or p_supplier_id is not null) then
    raise exception 'CUSTOMER_REQUIRED';
  end if;
  if p_type = 'pago' and (p_supplier_id is null or p_customer_id is not null) then
    raise exception 'SUPPLIER_REQUIRED';
  end if;

  v_amount := round(p_amount::numeric, 2);
  v_label := payment_method_label(p_payment_method);

  if p_type = 'cobro' then
    v_acc_concept := coalesce(nullif(trim(p_concept), ''), 'Cobro - ' || v_label);
    v_fin_concept := v_acc_concept;
    v_fin_type := 'ingreso';
  else
    v_acc_concept := coalesce(nullif(trim(p_concept), ''), 'Pago - ' || v_label);
    v_fin_concept := v_acc_concept;
    v_fin_type := 'egreso';
  end if;

  insert into public.payments (
    id, type, customer_id, supplier_id, date, amount,
    payment_method, concept, created_by, voided
  ) values (
    v_id, p_type, p_customer_id, p_supplier_id, coalesce(p_date, now()), v_amount,
    p_payment_method, nullif(trim(p_concept), ''), p_created_by, false
  );

  insert into public.account_movements (
    id, date, customer_id, supplier_id, concept, debe, haber,
    reference_type, reference_id, created_by, voided
  ) values (
    gen_random_uuid(),
    coalesce(p_date, now()),
    case when p_type = 'cobro' then p_customer_id else null end,
    case when p_type = 'pago' then p_supplier_id else null end,
    v_acc_concept,
    case when p_type = 'pago' then v_amount else 0 end,
    case when p_type = 'cobro' then v_amount else 0 end,
    p_type,
    v_id,
    p_created_by,
    false
  );

  insert into public.finance_movements (
    id, date, type, concept, payment_method, amount, reference_id, voided
  ) values (
    gen_random_uuid(),
    coalesce(p_date, now()),
    v_fin_type,
    v_fin_concept,
    v_label,
    v_amount,
    v_id::text,
    false
  );

  return v_id;
end;
$$;

-- Anula payment + account_movement + finance_movement (todo o nada)
create or replace function public.void_payment(
  p_payment_id uuid,
  p_user_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.payments%rowtype;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED';
  end if;

  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;
  if v_pay.voided then
    raise exception 'PAYMENT_ALREADY_VOIDED';
  end if;

  update public.payments
  set
    voided = true,
    voided_at = now(),
    voided_by = p_user_id
  where id = p_payment_id;

  update public.account_movements
  set
    voided = true,
    voided_at = now(),
    voided_by = p_user_id
  where reference_id = p_payment_id
    and reference_type in ('cobro', 'pago')
    and voided = false;

  update public.finance_movements
  set voided = true
  where reference_id = p_payment_id::text
    and voided = false;
end;
$$;
