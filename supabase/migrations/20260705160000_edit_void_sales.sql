-- Editar y Anular Ventas (mostrador) — La Huevería
-- Ejecutar en Supabase SQL Editor o via supabase db push

-- ─── Columnas en sales ───────────────────────────────────────────────
ALTER TABLE sales ADD COLUMN IF NOT EXISTS voided boolean NOT NULL DEFAULT false;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS voided_at timestamptz;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES users(id);

-- ─── voided en movimientos (idempotente) ─────────────────────────────
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS voided boolean NOT NULL DEFAULT false;
ALTER TABLE finance_movements ADD COLUMN IF NOT EXISTS voided boolean NOT NULL DEFAULT false;

-- ─── Trazabilidad ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sale_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id),
  action text NOT NULL CHECK (action IN ('edit', 'void')),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  performed_by uuid NOT NULL REFERENCES users(id),
  performed_at timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb
);

CREATE INDEX IF NOT EXISTS idx_sale_audit_log_sale_id ON sale_audit_log(sale_id);

-- ─── Helpers ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sale_is_today(p_date timestamptz)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT (p_date AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
       = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
$$;

CREATE OR REPLACE FUNCTION can_modify_sale(p_user_id uuid, p_sale_date timestamptz)
RETURNS boolean
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM users WHERE id = p_user_id;
  IF v_role IS NULL THEN RETURN false; END IF;
  IF v_role = 'admin' THEN RETURN true; END IF;
  IF v_role = 'vendedor' AND sale_is_today(p_sale_date) THEN RETURN true; END IF;
  RETURN false;
END;
$$;

-- Restaura stock al anular un movimiento de inventario vinculado a una venta
CREATE OR REPLACE FUNCTION void_inventory_movements_for_sale(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_mov inventory_movements%ROWTYPE;
BEGIN
  FOR v_mov IN
    SELECT * FROM inventory_movements
    WHERE reference_id::text = p_sale_id::text AND voided = false
  LOOP
    IF v_mov.type = 'salida' THEN
      UPDATE products SET stock = stock + v_mov.quantity WHERE id = v_mov.product_id;
    ELSIF v_mov.type = 'entrada' THEN
      UPDATE products SET stock = stock - v_mov.quantity WHERE id = v_mov.product_id;
    END IF;
    UPDATE inventory_movements SET voided = true WHERE id = v_mov.id;
  END LOOP;
END;
$$;

-- ─── Anular venta ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION void_sale(
  p_sale_id uuid,
  p_user_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale sales%ROWTYPE;
  v_snapshot jsonb;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;

  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SALE_NOT_FOUND'; END IF;
  IF v_sale.voided THEN RAISE EXCEPTION 'SALE_ALREADY_VOIDED'; END IF;

  IF NOT can_modify_sale(p_user_id, v_sale.date) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  IF v_sale.payment_method = 'Cuenta Corriente' THEN
    RAISE EXCEPTION 'NOT_MOSTRADOR_SALE';
  END IF;

  SELECT jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'items', COALESCE((
      SELECT jsonb_agg(to_jsonb(si))
      FROM sale_items si WHERE si.sale_id = p_sale_id
    ), '[]'::jsonb)
  ) INTO v_snapshot;

  PERFORM void_inventory_movements_for_sale(p_sale_id);

  UPDATE finance_movements SET voided = true
  WHERE reference_id::text = p_sale_id::text AND voided = false;

  UPDATE sales
  SET voided = true, voided_at = now(), voided_by = p_user_id
  WHERE id = p_sale_id;

  INSERT INTO sale_audit_log (sale_id, action, reason, performed_by, snapshot)
  VALUES (p_sale_id, 'void', trim(p_reason), p_user_id, v_snapshot);
END;
$$;

-- ─── Editar venta (re-liquidación) ───────────────────────────────────
CREATE OR REPLACE FUNCTION edit_sale(
  p_sale_id uuid,
  p_user_id uuid,
  p_reason text,
  p_payment_method text,
  p_customer_id uuid,
  p_items jsonb,
  p_date timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale sales%ROWTYPE;
  v_item record;
  v_new_total numeric := 0;
  v_stock numeric;
  v_snapshot jsonb;
  v_concept text;
  v_finance_id uuid;
  v_inv_id uuid;
  v_sale_date timestamptz;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ITEMS_REQUIRED';
  END IF;

  IF p_payment_method = 'Cuenta Corriente' THEN
    RAISE EXCEPTION 'NOT_MOSTRADOR_SALE';
  END IF;

  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SALE_NOT_FOUND'; END IF;
  IF v_sale.voided THEN RAISE EXCEPTION 'SALE_ALREADY_VOIDED'; END IF;

  IF NOT can_modify_sale(p_user_id, v_sale.date) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  IF v_sale.payment_method = 'Cuenta Corriente' THEN
    RAISE EXCEPTION 'NOT_MOSTRADOR_SALE';
  END IF;

  SELECT jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'items', COALESCE((
      SELECT jsonb_agg(to_jsonb(si))
      FROM sale_items si WHERE si.sale_id = p_sale_id
    ), '[]'::jsonb)
  ) INTO v_snapshot;

  SELECT concept INTO v_concept
  FROM finance_movements
  WHERE reference_id::text = p_sale_id::text
    AND type = 'ingreso'
    AND voided = false
  ORDER BY date DESC
  LIMIT 1;

  IF v_concept IS NULL THEN
    IF p_customer_id IS NULL THEN
      v_concept := 'Venta POS #' || upper(substr(p_sale_id::text, 1, 6));
    ELSE
      v_concept := 'Venta #' || upper(substr(p_sale_id::text, 1, 6));
    END IF;
  END IF;

  -- 1. Revertir movimientos viejos
  PERFORM void_inventory_movements_for_sale(p_sale_id);

  UPDATE finance_movements SET voided = true
  WHERE reference_id::text = p_sale_id::text AND voided = false;

  -- Validar stock disponible (tras restitución)
  FOR v_item IN
    SELECT
      (elem->>'product_id')::uuid AS product_id,
      (elem->>'quantity')::numeric AS quantity
    FROM jsonb_array_elements(p_items) AS elem
  LOOP
    IF v_item.product_id IS NULL OR v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'INVALID_ITEMS';
    END IF;

    SELECT stock INTO v_stock FROM products WHERE id = v_item.product_id FOR UPDATE;
    IF v_stock IS NULL THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
    IF v_stock < v_item.quantity THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK'; END IF;
  END LOOP;

  -- 2. Reemplazar detalle
  DELETE FROM sale_items WHERE sale_id = p_sale_id;

  INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal)
  SELECT
    p_sale_id,
    (elem->>'product_id')::uuid,
    (elem->>'quantity')::numeric,
    (elem->>'unit_price')::numeric,
    (elem->>'subtotal')::numeric
  FROM jsonb_array_elements(p_items) AS elem;

  SELECT COALESCE(SUM((elem->>'subtotal')::numeric), 0) INTO v_new_total
  FROM jsonb_array_elements(p_items) AS elem;

  v_sale_date := COALESCE(p_date, v_sale.date);

  -- 3. Actualizar cabecera
  UPDATE sales SET
    customer_id = p_customer_id,
    payment_method = p_payment_method,
    total = v_new_total,
    date = v_sale_date
  WHERE id = p_sale_id;

  -- 4. Nuevo ingreso financiero
  v_finance_id := gen_random_uuid();
  INSERT INTO finance_movements (id, date, type, concept, payment_method, amount, reference_id, voided)
  VALUES (
    v_finance_id,
    v_sale_date,
    'ingreso',
    v_concept,
    p_payment_method,
    v_new_total,
    p_sale_id::text,
    false
  );

  -- 5. Nuevas salidas de inventario
  FOR v_item IN
    SELECT
      (elem->>'product_id')::uuid AS product_id,
      (elem->>'quantity')::numeric AS quantity,
      (elem->>'unit_price')::numeric AS unit_price
    FROM jsonb_array_elements(p_items) AS elem
  LOOP
    UPDATE products SET stock = stock - v_item.quantity WHERE id = v_item.product_id;

    v_inv_id := gen_random_uuid();
    INSERT INTO inventory_movements (id, date, product_id, type, quantity, reference_id, reason, voided)
    VALUES (
      v_inv_id,
      v_sale_date,
      v_item.product_id,
      'salida',
      v_item.quantity,
      p_sale_id::text,
      CASE
        WHEN p_customer_id IS NULL THEN 'Venta POS - Consumidor Final'
        ELSE 'Venta a cliente registrado'
      END,
      false
    );
  END LOOP;

  -- 6. Auditoría
  INSERT INTO sale_audit_log (sale_id, action, reason, performed_by, snapshot)
  VALUES (p_sale_id, 'edit', trim(p_reason), p_user_id, v_snapshot);
END;
$$;
