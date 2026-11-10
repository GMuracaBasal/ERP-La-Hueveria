-- Tesorería Etapa 1b: account_id en cobros, pagos, ventas y compras al contado.
-- RECORDÁ: aplicar a mano en el SQL Editor de Supabase; este archivo es registro histórico.
-- GOTCHA: agregar un parámetro cambia la firma. Hay que DROP FUNCTION de la firma vieja
-- antes de recrear, y volver a GRANT EXECUTE (el drop se los lleva).

alter table public.sales
  add column if not exists account_id uuid references public.treasury_accounts(id);
alter table public.purchases
  add column if not exists account_id uuid references public.treasury_accounts(id);
alter table public.payments
  add column if not exists account_id uuid references public.treasury_accounts(id);

-- Backfill: lo histórico quedó en la cuenta por defecto
update public.sales
set account_id = (select id from public.treasury_accounts where is_default limit 1)
where account_id is null and condition = 'contado';

update public.purchases
set account_id = (select id from public.treasury_accounts where is_default limit 1)
where account_id is null and condition = 'contado';

update public.payments
set account_id = (select id from public.treasury_accounts where is_default limit 1)
where account_id is null;

-- Valida cuenta ARS habilitada (cobros/pagos/ventas/compras: nunca USD)
create or replace function public.assert_ars_treasury_account(p_account_id uuid)
returns void
language plpgsql
as $$
declare
  v_acc public.treasury_accounts%rowtype;
begin
  if p_account_id is null then
    raise exception 'ACCOUNT_REQUIRED';
  end if;
  select * into v_acc from public.treasury_accounts where id = p_account_id;
  if not found then
    raise exception 'ACCOUNT_NOT_FOUND';
  end if;
  if not v_acc.enabled then
    raise exception 'ACCOUNT_DISABLED';
  end if;
  if v_acc.currency <> 'ARS' then
    raise exception 'ACCOUNT_NOT_ARS';
  end if;
end;
$$;

grant execute on function public.assert_ars_treasury_account(uuid) to anon, authenticated, service_role;

-- Cambiar la cuenta por defecto en una sola transacción
create or replace function public.set_default_treasury_account(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_account_id is null then
    raise exception 'ACCOUNT_REQUIRED';
  end if;
  if not exists (select 1 from public.treasury_accounts where id = p_account_id) then
    raise exception 'ACCOUNT_NOT_FOUND';
  end if;

  update public.treasury_accounts
  set is_default = false
  where is_default = true
    and id <> p_account_id;

  update public.treasury_accounts
  set is_default = true, enabled = true
  where id = p_account_id;
end;
$$;

grant execute on function public.set_default_treasury_account(uuid) to anon, authenticated, service_role;

-- ─── register_payment: firma nueva con p_account_id ──────────────────
drop function if exists public.register_payment(text, uuid, uuid, timestamptz, numeric, text, text, uuid);

create or replace function public.register_payment(
  p_type text,
  p_customer_id uuid,
  p_supplier_id uuid,
  p_date timestamptz,
  p_amount numeric,
  p_payment_method text,
  p_concept text,
  p_created_by uuid,
  p_account_id uuid
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

  perform public.assert_ars_treasury_account(p_account_id);

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
    payment_method, concept, created_by, voided, account_id
  ) values (
    v_id, p_type, p_customer_id, p_supplier_id, coalesce(p_date, now()), v_amount,
    p_payment_method, nullif(trim(p_concept), ''), p_created_by, false, p_account_id
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
    id, date, type, concept, payment_method, amount, reference_id, voided, account_id
  ) values (
    gen_random_uuid(),
    coalesce(p_date, now()),
    v_fin_type,
    v_fin_concept,
    p_payment_method,
    v_amount,
    v_id::text,
    false,
    p_account_id
  );

  return v_id;
end;
$$;

grant execute on function public.register_payment(text, uuid, uuid, timestamptz, numeric, text, text, uuid, uuid) to anon, authenticated, service_role;

-- ─── edit_sale: re-liquida a la cuenta de la venta (nunca a la default a ciegas)
drop function if exists public.edit_sale(uuid, uuid, text, text, uuid, jsonb, timestamptz);
drop function if exists public.edit_sale(uuid, uuid, text, text, uuid, jsonb, timestamptz, text);

create or replace function public.edit_sale(
  p_sale_id uuid,
  p_user_id uuid,
  p_reason text,
  p_payment_method text,
  p_customer_id uuid,
  p_items jsonb,
  p_date timestamptz default null,
  p_condition text default 'contado',
  p_account_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale sales%rowtype;
  v_item record;
  v_new_total numeric := 0;
  v_stock numeric;
  v_snapshot jsonb;
  v_concept text;
  v_finance_id uuid;
  v_inv_id uuid;
  v_sale_date timestamptz;
  v_condition text;
  v_payment text;
  v_account_id uuid;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'ITEMS_REQUIRED';
  end if;

  if p_customer_id is null then
    raise exception 'CUSTOMER_REQUIRED';
  end if;

  v_condition := coalesce(nullif(trim(p_condition), ''), 'contado');
  if v_condition not in ('contado', 'cuenta_corriente') then
    raise exception 'INVALID_CONDITION';
  end if;

  if v_condition = 'contado' and (p_payment_method is null or length(trim(p_payment_method)) = 0) then
    raise exception 'PAYMENT_REQUIRED';
  end if;

  v_payment := case
    when v_condition = 'cuenta_corriente' then null
    else p_payment_method
  end;

  select * into v_sale from sales where id = p_sale_id for update;
  if not found then raise exception 'SALE_NOT_FOUND'; end if;
  if v_sale.voided then raise exception 'SALE_ALREADY_VOIDED'; end if;

  if not can_modify_sale(p_user_id, v_sale.date) then
    raise exception 'PERMISSION_DENIED';
  end if;

  v_account_id := case
    when v_condition = 'cuenta_corriente' then null
    else coalesce(p_account_id, v_sale.account_id)
  end;
  if v_condition = 'contado' then
    perform public.assert_ars_treasury_account(v_account_id);
  end if;

  select jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'items', coalesce((
      select jsonb_agg(to_jsonb(si))
      from sale_items si where si.sale_id = p_sale_id
    ), '[]'::jsonb)
  ) into v_snapshot;

  select concept into v_concept
  from finance_movements
  where reference_id::text = p_sale_id::text
    and type = 'ingreso'
    and voided = false
  order by date desc
  limit 1;

  if v_concept is null then
    if coalesce(v_sale.point_of_sale, 'mostrador') = 'mostrador' then
      v_concept := 'Venta POS #' || upper(substr(p_sale_id::text, 1, 6));
    else
      v_concept := 'Venta #' || upper(substr(p_sale_id::text, 1, 6));
    end if;
  end if;

  perform void_inventory_movements_for_sale(p_sale_id);

  update finance_movements set voided = true
  where reference_id::text = p_sale_id::text and voided = false;

  update account_movements
  set voided = true, voided_at = now(), voided_by = p_user_id
  where reference_id = p_sale_id and voided = false;

  for v_item in
    select
      (elem->>'product_id')::uuid as product_id,
      (elem->>'quantity')::numeric as quantity
    from jsonb_array_elements(p_items) as elem
  loop
    if v_item.product_id is null or v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'INVALID_ITEMS';
    end if;

    select stock into v_stock from products where id = v_item.product_id for update;
    if v_stock is null then raise exception 'PRODUCT_NOT_FOUND'; end if;
    if v_stock < v_item.quantity then raise exception 'INSUFFICIENT_STOCK'; end if;
  end loop;

  delete from sale_items where sale_id = p_sale_id;

  insert into sale_items (sale_id, product_id, quantity, unit_price, subtotal)
  select
    p_sale_id,
    (elem->>'product_id')::uuid,
    (elem->>'quantity')::numeric,
    (elem->>'unit_price')::numeric,
    (elem->>'subtotal')::numeric
  from jsonb_array_elements(p_items) as elem;

  select coalesce(sum((elem->>'subtotal')::numeric), 0) into v_new_total
  from jsonb_array_elements(p_items) as elem;

  v_sale_date := coalesce(p_date, v_sale.date);

  update sales set
    customer_id = p_customer_id,
    payment_method = v_payment,
    total = v_new_total,
    date = v_sale_date,
    condition = v_condition,
    account_id = v_account_id
  where id = p_sale_id;

  insert into account_movements (
    id, date, customer_id, supplier_id, concept, debe, haber,
    reference_type, reference_id, created_by, voided
  ) values (
    gen_random_uuid(), v_sale_date, p_customer_id, null, v_concept,
    round(v_new_total, 2), 0, 'venta', p_sale_id, p_user_id, false
  );

  if v_condition = 'contado' then
    insert into account_movements (
      id, date, customer_id, supplier_id, concept, debe, haber,
      reference_type, reference_id, created_by, voided
    ) values (
      gen_random_uuid(), v_sale_date, p_customer_id, null,
      'Cobro venta #' || upper(substr(p_sale_id::text, 1, 6)),
      0, round(v_new_total, 2), 'cobro', p_sale_id, p_user_id, false
    );

    v_finance_id := gen_random_uuid();
    insert into finance_movements (
      id, date, type, concept, payment_method, amount, reference_id, voided, account_id
    )
    values (
      v_finance_id, v_sale_date, 'ingreso', v_concept, v_payment,
      round(v_new_total, 2), p_sale_id::text, false, v_account_id
    );
  end if;

  for v_item in
    select
      (elem->>'product_id')::uuid as product_id,
      (elem->>'quantity')::numeric as quantity
    from jsonb_array_elements(p_items) as elem
  loop
    update products set stock = stock - v_item.quantity where id = v_item.product_id;

    v_inv_id := gen_random_uuid();
    insert into inventory_movements (id, date, product_id, type, quantity, reference_id, reason, voided)
    values (
      v_inv_id, v_sale_date, v_item.product_id, 'salida', v_item.quantity,
      p_sale_id::text,
      case
        when coalesce(v_sale.point_of_sale, 'mostrador') = 'mostrador'
          then 'Venta POS - Consumidor Final'
        else 'Venta a cliente registrado'
      end,
      false
    );
  end loop;

  insert into sale_audit_log (sale_id, action, reason, performed_by, snapshot)
  values (p_sale_id, 'edit', trim(p_reason), p_user_id, v_snapshot);
end;
$$;

grant execute on function public.edit_sale(uuid, uuid, text, text, uuid, jsonb, timestamptz, text, uuid) to anon, authenticated, service_role;
grant execute on function public.void_sale(uuid, uuid, text) to anon, authenticated, service_role;
grant execute on function public.void_payment(uuid, uuid, text) to anon, authenticated, service_role;

-- Ya no hace falta el puente: todas las rutas mandan account_id
drop trigger if exists trg_finance_movements_default_account on public.finance_movements;
drop function if exists public.finance_movements_default_account();
