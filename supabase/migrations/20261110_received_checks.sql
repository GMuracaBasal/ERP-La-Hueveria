-- Tesorería Etapa 2: cheques recibidos (cartera).
-- RECORDÁ: aplicar a mano en el SQL Editor de Supabase; este archivo es registro histórico.
-- Un cheque en cartera o depositado NO es plata. El ingreso en finance_movements
-- nace recién al acreditar. El rechazo devuelve la deuda del cliente y, solo si
-- el cheque ya estaba acreditado, saca la plata de la cuenta de depósito.
-- Cheques emitidos y endoso quedan para después: las columnas de endoso existen y no se usan.
-- GOTCHA: agregar p_check cambia la firma de register_payment. Hay que DROP de la firma
-- vieja y volver a GRANT EXECUTE (el drop se los lleva).

create table if not exists public.received_checks (
  id                 uuid primary key default gen_random_uuid(),
  check_number       text not null,
  kind               text not null default 'papel' check (kind in ('papel','echeq')),
  bank               text,
  drawer_name        text,
  drawer_tax_id      text,
  amount             numeric(14,2) not null check (amount > 0),
  issue_date         date,
  due_date           date not null,
  customer_id        uuid references public.customers(id),
  payment_id         uuid references public.payments(id),
  status             text not null default 'en_cartera'
                     check (status in ('en_cartera','depositado','acreditado','rechazado','endosado')),
  deposit_account_id uuid references public.treasury_accounts(id),
  deposited_at       timestamptz,
  credited_at        timestamptz,
  rejected_at        timestamptz,
  rejection_reason   text,
  endorsed_to_supplier_id uuid references public.suppliers(id),
  endorsed_at        timestamptz,
  notes              text,
  created_by         uuid references public.users(id),
  created_at         timestamptz not null default now(),
  voided             boolean not null default false,
  voided_at          timestamptz,
  voided_by          uuid references public.users(id),
  void_reason        text
);

alter table public.received_checks add column if not exists void_reason text;

create index if not exists idx_received_checks_status
  on public.received_checks (status, due_date) where voided = false;
create index if not exists idx_received_checks_customer
  on public.received_checks (customer_id, due_date) where voided = false;
create index if not exists idx_received_checks_payment
  on public.received_checks (payment_id) where voided = false and payment_id is not null;

-- Supabase deja las tablas nuevas con RLS activo y sin políticas. Con la clave anon eso es 42501.
alter table public.received_checks disable row level security;
grant select, insert, update, delete on table public.received_checks to anon, authenticated;

-- 'cheque' pasa a ser un medio de pago válido (solo cobros; los emitidos no se construyen acá).
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'payments'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%payment_method%'
  loop
    execute format('alter table public.payments drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.payments add constraint payments_payment_method_check
  check (payment_method in ('efectivo','transferencia','tarjeta','qr','cheque'));

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
    when 'cheque' then 'Cheque'
    else p_method
  end;
$$;

-- ─── register_payment: p_check jsonb, default null ───────────────────
drop function if exists public.register_payment(text, uuid, uuid, timestamptz, numeric, text, text, uuid);
drop function if exists public.register_payment(text, uuid, uuid, timestamptz, numeric, text, text, uuid, uuid);

create or replace function public.register_payment(
  p_type text,
  p_customer_id uuid,
  p_supplier_id uuid,
  p_date timestamptz,
  p_amount numeric,
  p_payment_method text,
  p_concept text,
  p_created_by uuid,
  p_account_id uuid,
  p_check jsonb default null
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
  v_is_check boolean;
  v_check_number text;
  v_kind text;
  v_check_amount numeric(14,2);
  v_due date;
  v_issue date;
begin
  if p_type not in ('cobro', 'pago') then
    raise exception 'INVALID_TYPE';
  end if;
  if p_payment_method not in ('efectivo', 'transferencia', 'tarjeta', 'qr', 'cheque') then
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

  v_is_check := p_payment_method = 'cheque';
  v_amount := round(p_amount::numeric, 2);
  v_label := payment_method_label(p_payment_method);

  if v_is_check then
    -- Cheque recibido: no es plata en una cuenta. No se valida ni se mueve tesorería.
    if p_type <> 'cobro' then
      raise exception 'CHECK_ONLY_ON_COLLECTION';
    end if;
    if p_account_id is not null then
      raise exception 'CHECK_NO_ACCOUNT';
    end if;
    if p_check is null then
      raise exception 'CHECK_REQUIRED';
    end if;

    v_check_number := nullif(trim(coalesce(p_check->>'check_number', '')), '');
    v_kind := coalesce(nullif(trim(coalesce(p_check->>'kind', '')), ''), 'papel');
    if v_check_number is null then
      raise exception 'CHECK_NUMBER_REQUIRED';
    end if;
    if v_kind not in ('papel', 'echeq') then
      raise exception 'INVALID_CHECK_KIND';
    end if;
    if nullif(trim(coalesce(p_check->>'due_date', '')), '') is null then
      raise exception 'DUE_DATE_REQUIRED';
    end if;

    begin
      v_check_amount := round((p_check->>'amount')::numeric, 2);
    exception when others then
      raise exception 'INVALID_AMOUNT';
    end;
    if v_check_amount is null or v_check_amount <= 0 then
      raise exception 'INVALID_AMOUNT';
    end if;
    if v_check_amount <> v_amount then
      raise exception 'CHECK_AMOUNT_MISMATCH';
    end if;

    begin
      v_due := (p_check->>'due_date')::date;
    exception when others then
      raise exception 'DUE_DATE_REQUIRED';
    end;

    if nullif(trim(coalesce(p_check->>'issue_date', '')), '') is null then
      v_issue := null;
    else
      begin
        v_issue := (p_check->>'issue_date')::date;
      exception when others then
        raise exception 'INVALID_ISSUE_DATE';
      end;
    end if;
  else
    perform public.assert_ars_treasury_account(p_account_id);
  end if;

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
    p_payment_method, nullif(trim(p_concept), ''), p_created_by, false,
    case when v_is_check then null else p_account_id end
  );

  -- El cliente deja de deber igual, haya entrado plata o no.
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

  if v_is_check then
    insert into public.received_checks (
      id, check_number, kind, bank, drawer_name, drawer_tax_id,
      amount, issue_date, due_date, customer_id, payment_id,
      status, notes, created_by, voided
    ) values (
      gen_random_uuid(),
      v_check_number,
      v_kind,
      nullif(trim(coalesce(p_check->>'bank', '')), ''),
      nullif(trim(coalesce(p_check->>'drawer_name', '')), ''),
      nullif(trim(coalesce(p_check->>'drawer_tax_id', '')), ''),
      v_check_amount,
      v_issue,
      v_due,
      p_customer_id,
      v_id,
      'en_cartera',
      nullif(trim(coalesce(p_check->>'notes', '')), ''),
      p_created_by,
      false
    );
  else
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
  end if;

  return v_id;
end;
$$;

grant execute on function public.register_payment(text, uuid, uuid, timestamptz, numeric, text, text, uuid, uuid, jsonb) to anon, authenticated, service_role;

-- Anular el cobro desde la cuenta corriente: si el cheque sigue en cartera o depositado,
-- se anula junto con el cobro (todavía no hay plata). Si ya se acreditó, hay que rechazarlo
-- desde Cheques para que también salga el dinero.
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

  if exists (
    select 1 from public.received_checks
    where payment_id = p_payment_id and voided = false and status = 'acreditado'
  ) then
    raise exception 'CHECK_ALREADY_CREDITED';
  end if;
  if exists (
    select 1 from public.received_checks
    where payment_id = p_payment_id and voided = false and status = 'endosado'
  ) then
    raise exception 'CHECK_ENDORSED';
  end if;

  update public.payments
  set voided = true, voided_at = now(), voided_by = p_user_id
  where id = p_payment_id;

  update public.account_movements
  set voided = true, voided_at = now(), voided_by = p_user_id
  where reference_id = p_payment_id
    and reference_type in ('cobro', 'pago')
    and voided = false;

  update public.finance_movements
  set voided = true
  where reference_id = p_payment_id::text
    and voided = false;

  update public.received_checks
  set
    voided = true,
    voided_at = now(),
    voided_by = p_user_id,
    void_reason = trim(p_reason)
  where payment_id = p_payment_id
    and voided = false
    and status in ('en_cartera', 'depositado');
end;
$$;

grant execute on function public.void_payment(uuid, uuid, text) to anon, authenticated, service_role;

-- Depositar no mueve plata: el banco todavía no acreditó.
create or replace function public.deposit_check(
  p_check_id uuid,
  p_account_id uuid,
  p_date timestamptz,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_check public.received_checks%rowtype;
begin
  select * into v_check from public.received_checks where id = p_check_id for update;
  if not found then
    raise exception 'CHECK_NOT_FOUND';
  end if;
  if v_check.voided then
    raise exception 'CHECK_VOIDED';
  end if;
  if v_check.status <> 'en_cartera' then
    raise exception 'CHECK_NOT_IN_PORTFOLIO';
  end if;

  perform public.assert_ars_treasury_account(p_account_id);

  update public.received_checks
  set
    status = 'depositado',
    deposit_account_id = p_account_id,
    deposited_at = coalesce(p_date, now())
  where id = p_check_id;
end;
$$;

grant execute on function public.deposit_check(uuid, uuid, timestamptz, uuid) to anon, authenticated, service_role;

-- Acreditar es el único momento en que la plata entra a la cuenta de depósito.
create or replace function public.credit_check(
  p_check_id uuid,
  p_date timestamptz,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_check public.received_checks%rowtype;
  v_when timestamptz;
begin
  select * into v_check from public.received_checks where id = p_check_id for update;
  if not found then
    raise exception 'CHECK_NOT_FOUND';
  end if;
  if v_check.voided then
    raise exception 'CHECK_VOIDED';
  end if;
  if v_check.status <> 'depositado' then
    raise exception 'CHECK_NOT_DEPOSITED';
  end if;
  if v_check.deposit_account_id is null then
    raise exception 'ACCOUNT_REQUIRED';
  end if;

  perform public.assert_ars_treasury_account(v_check.deposit_account_id);

  v_when := coalesce(p_date, now());

  insert into public.finance_movements (
    id, date, type, concept, payment_method, amount, reference_id, voided, account_id
  ) values (
    gen_random_uuid(),
    v_when,
    'ingreso',
    'Acreditación cheque Nº ' || v_check.check_number,
    'cheque',
    v_check.amount,
    v_check.id::text,
    false,
    v_check.deposit_account_id
  );

  update public.received_checks
  set status = 'acreditado', credited_at = v_when
  where id = p_check_id;
end;
$$;

grant execute on function public.credit_check(uuid, timestamptz, uuid) to anon, authenticated, service_role;

-- Rechazar: la deuda vuelve siempre que el cheque haya nacido de un cobro.
-- La plata sale de la cuenta solo si el cheque ya estaba acreditado (egreso nuevo; el ingreso no se edita).
create or replace function public.reject_check(
  p_check_id uuid,
  p_date timestamptz,
  p_reason text,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_check public.received_checks%rowtype;
  v_pay public.payments%rowtype;
  v_when timestamptz;
  v_currency text;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED';
  end if;

  select * into v_check from public.received_checks where id = p_check_id for update;
  if not found then
    raise exception 'CHECK_NOT_FOUND';
  end if;
  if v_check.voided then
    raise exception 'CHECK_VOIDED';
  end if;
  if v_check.status = 'endosado' then
    raise exception 'CHECK_ENDORSED';
  end if;
  if v_check.status = 'rechazado' then
    raise exception 'CHECK_ALREADY_REJECTED';
  end if;
  if v_check.status not in ('en_cartera', 'depositado', 'acreditado') then
    raise exception 'CHECK_CANNOT_REJECT';
  end if;

  v_when := coalesce(p_date, now());

  if v_check.status = 'acreditado' then
    if v_check.deposit_account_id is null then
      raise exception 'ACCOUNT_REQUIRED';
    end if;
    -- Aunque la cuenta se haya deshabilitado después, el egreso sale de la misma donde entró.
    select currency into v_currency
    from public.treasury_accounts
    where id = v_check.deposit_account_id;
    if not found then
      raise exception 'ACCOUNT_NOT_FOUND';
    end if;
    if v_currency <> 'ARS' then
      raise exception 'ACCOUNT_NOT_ARS';
    end if;

    insert into public.finance_movements (
      id, date, type, concept, payment_method, amount, reference_id, voided, account_id
    ) values (
      gen_random_uuid(),
      v_when,
      'egreso',
      'Rechazo cheque Nº ' || v_check.check_number,
      'cheque',
      v_check.amount,
      v_check.id::text,
      false,
      v_check.deposit_account_id
    );
  end if;

  if v_check.payment_id is not null then
    select * into v_pay from public.payments where id = v_check.payment_id for update;
    if found and not v_pay.voided then
      update public.payments
      set voided = true, voided_at = now(), voided_by = p_user_id
      where id = v_pay.id;

      update public.account_movements
      set voided = true, voided_at = now(), voided_by = p_user_id
      where reference_id = v_pay.id
        and reference_type in ('cobro', 'pago')
        and voided = false;
    end if;
  end if;

  update public.received_checks
  set
    status = 'rechazado',
    rejected_at = v_when,
    rejection_reason = trim(p_reason)
  where id = p_check_id;
end;
$$;

grant execute on function public.reject_check(uuid, timestamptz, text, uuid) to anon, authenticated, service_role;

-- Anulación lógica. Si el cheque había movido plata (acreditación o rechazo posterior),
-- esos finance_movements se anulan en la misma transacción. No toca la cuenta corriente:
-- devolver la deuda es Rechazar, no Anular.
create or replace function public.void_received_check(
  p_check_id uuid,
  p_reason text,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_check public.received_checks%rowtype;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED';
  end if;

  select * into v_check from public.received_checks where id = p_check_id for update;
  if not found then
    raise exception 'CHECK_NOT_FOUND';
  end if;
  if v_check.voided then
    raise exception 'CHECK_VOIDED';
  end if;
  if v_check.status = 'endosado' then
    raise exception 'CHECK_ENDORSED';
  end if;

  update public.finance_movements
  set voided = true
  where reference_id = p_check_id::text
    and voided = false;

  update public.received_checks
  set
    voided = true,
    voided_at = now(),
    voided_by = p_user_id,
    void_reason = trim(p_reason)
  where id = p_check_id;
end;
$$;

grant execute on function public.void_received_check(uuid, text, uuid) to anon, authenticated, service_role;
