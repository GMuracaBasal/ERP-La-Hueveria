-- Compras: condición Contado / CC + unificación de medios de pago (minúsculas).
-- RECORDÁ: aplicar a mano en el SQL Editor de Supabase.

-- ─── purchases.condition + payment_method ────────────────────────────
alter table public.purchases
  add column if not exists condition text not null default 'contado';

alter table public.purchases
  add column if not exists payment_method text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'purchases_condition_check'
  ) then
    alter table public.purchases
      add constraint purchases_condition_check
      check (condition in ('contado', 'cuenta_corriente'));
  end if;
end $$;

-- Compras existentes (siempre fueron Contado en la app)
update public.purchases
set condition = 'contado'
where condition is null or condition = '';

-- ─── Unificar vocabulario de medios de pago ─────────────────────────
-- Códigos canónicos: efectivo | transferencia | tarjeta | qr

update public.sales set payment_method = 'efectivo'
where payment_method in ('Efectivo', 'efectivo');

update public.sales set payment_method = 'transferencia'
where payment_method in ('Transferencia', 'transferencia');

update public.sales set payment_method = 'tarjeta'
where payment_method in (
  'Tarjeta', 'tarjeta',
  'Tarjeta de Débito', 'Tarjeta de Debito',
  'Tarjeta de Crédito', 'Tarjeta de Credito'
);

update public.sales set payment_method = 'qr'
where payment_method in ('QR', 'qr', 'QR / Transferencia', 'qr / transferencia');

-- Legado: payment_method = Cuenta Corriente → condition (si aún quedara)
update public.sales
set condition = 'cuenta_corriente', payment_method = null
where payment_method = 'Cuenta Corriente';

update public.finance_movements set payment_method = 'efectivo'
where payment_method in ('Efectivo', 'efectivo');

update public.finance_movements set payment_method = 'transferencia'
where payment_method in ('Transferencia', 'transferencia');

update public.finance_movements set payment_method = 'tarjeta'
where payment_method in (
  'Tarjeta', 'tarjeta',
  'Tarjeta de Débito', 'Tarjeta de Debito',
  'Tarjeta de Crédito', 'Tarjeta de Credito'
);

update public.finance_movements set payment_method = 'qr'
where payment_method in ('QR', 'qr', 'QR / Transferencia', 'qr / transferencia');

-- Backfill medio de pago en compras contado desde el egreso de caja (si existe)
update public.purchases p
set payment_method = fm.payment_method
from public.finance_movements fm
where fm.reference_id = p.id::text
  and fm.type = 'egreso'
  and coalesce(fm.voided, false) = false
  and p.condition = 'contado'
  and (p.payment_method is null or p.payment_method = '');

update public.purchases
set payment_method = 'efectivo'
where condition = 'contado'
  and (payment_method is null or payment_method = '');

-- payments: normalizar por si quedara algún label legado
update public.payments set payment_method = 'efectivo'
where payment_method in ('Efectivo', 'efectivo');
update public.payments set payment_method = 'transferencia'
where payment_method in ('Transferencia', 'transferencia');
update public.payments set payment_method = 'tarjeta'
where payment_method in (
  'Tarjeta', 'tarjeta',
  'Tarjeta de Débito', 'Tarjeta de Debito',
  'Tarjeta de Crédito', 'Tarjeta de Credito'
);
update public.payments set payment_method = 'qr'
where payment_method in ('QR', 'qr', 'QR / Transferencia', 'qr / transferencia');

-- payments ya usa códigos; finance generado por register_payment debe guardar el código
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

  -- finance_movements.payment_method = código canónico (no el label)
  insert into public.finance_movements (
    id, date, type, concept, payment_method, amount, reference_id, voided
  ) values (
    gen_random_uuid(),
    coalesce(p_date, now()),
    v_fin_type,
    v_fin_concept,
    p_payment_method,
    v_amount,
    v_id::text,
    false
  );

  return v_id;
end;
$$;
