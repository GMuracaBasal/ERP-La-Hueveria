-- Edición de ventas Contado y Cuenta Corriente (re-liquidación por condición).
-- RECORDÁ: aplicar a mano en el SQL Editor de Supabase.
-- La app usa el motor TS (salesDB.editSale); este RPC queda alineado por si se usa.

-- void_sale: permitir anular CC (ya no bloquear por payment_method legado)
create or replace function public.void_sale(
  p_sale_id uuid,
  p_user_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale sales%rowtype;
  v_snapshot jsonb;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED';
  end if;

  select * into v_sale from sales where id = p_sale_id for update;
  if not found then raise exception 'SALE_NOT_FOUND'; end if;
  if v_sale.voided then raise exception 'SALE_ALREADY_VOIDED'; end if;

  if not can_modify_sale(p_user_id, v_sale.date) then
    raise exception 'PERMISSION_DENIED';
  end if;

  select jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'items', coalesce((
      select jsonb_agg(to_jsonb(si))
      from sale_items si where si.sale_id = p_sale_id
    ), '[]'::jsonb)
  ) into v_snapshot;

  perform void_inventory_movements_for_sale(p_sale_id);

  update finance_movements set voided = true
  where reference_id::text = p_sale_id::text and voided = false;

  update account_movements
  set voided = true, voided_at = now(), voided_by = p_user_id
  where reference_id = p_sale_id and voided = false;

  update sales
  set voided = true, voided_at = now(), voided_by = p_user_id
  where id = p_sale_id;

  insert into sale_audit_log (sale_id, action, reason, performed_by, snapshot)
  values (p_sale_id, 'void', trim(p_reason), p_user_id, v_snapshot);
end;
$$;

-- edit_sale: acepta p_condition; re-liquida Debe / Haber+caja según condición
create or replace function public.edit_sale(
  p_sale_id uuid,
  p_user_id uuid,
  p_reason text,
  p_payment_method text,
  p_customer_id uuid,
  p_items jsonb,
  p_date timestamptz default null,
  p_condition text default 'contado'
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

  -- 1. Anular movimientos viejos (nunca UPDATE de debe/haber)
  perform void_inventory_movements_for_sale(p_sale_id);

  update finance_movements set voided = true
  where reference_id::text = p_sale_id::text and voided = false;

  update account_movements
  set voided = true, voided_at = now(), voided_by = p_user_id
  where reference_id = p_sale_id and voided = false;

  -- Validar stock (tras restitución)
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

  -- 2. Reemplazar detalle
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

  -- 3. Cabecera
  update sales set
    customer_id = p_customer_id,
    payment_method = v_payment,
    total = v_new_total,
    date = v_sale_date,
    condition = v_condition
  where id = p_sale_id;

  -- 4. Debe siempre
  insert into account_movements (
    id, date, customer_id, supplier_id, concept, debe, haber,
    reference_type, reference_id, created_by, voided
  ) values (
    gen_random_uuid(), v_sale_date, p_customer_id, null, v_concept,
    round(v_new_total, 2), 0, 'venta', p_sale_id, p_user_id, false
  );

  -- 5. Contado: Haber + ingreso en caja
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
    insert into finance_movements (id, date, type, concept, payment_method, amount, reference_id, voided)
    values (
      v_finance_id, v_sale_date, 'ingreso', v_concept, v_payment,
      round(v_new_total, 2), p_sale_id::text, false
    );
  end if;

  -- 6. Stock
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
