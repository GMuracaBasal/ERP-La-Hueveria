-- Tesorería Etapa 3: valores múltiples, cheques propios y endoso.
-- RECORDÁ: aplicar a mano en el SQL Editor de Supabase y elegir "Run without RLS".
-- Este archivo es el registro histórico. La fuente de verdad de un cobro/pago pasa a ser
-- payment_values. payments.payment_method y payments.account_id quedan como resumen.
-- Un cheque (recibido, endosado o propio pendiente) no mueve tesorería.
-- La plata entra al acreditar un cheque recibido y sale al debitar uno propio.

create table if not exists public.issued_checks (
  id               uuid primary key default gen_random_uuid(),
  check_number     text not null,
  kind             text not null default 'papel' check (kind in ('papel','echeq')),
  account_id       uuid not null references public.treasury_accounts(id),
  supplier_id      uuid references public.suppliers(id),
  amount           numeric(14,2) not null check (amount > 0),
  issue_date       date,
  due_date         date not null,
  status           text not null default 'pendiente'
                   check (status in ('pendiente','debitado','rechazado','anulado')),
  debited_at       timestamptz,
  rejected_at      timestamptz,
  rejection_reason text,
  notes            text,
  created_by       uuid references public.users(id),
  created_at       timestamptz not null default now(),
  voided           boolean not null default false,
  voided_at        timestamptz,
  voided_by        uuid references public.users(id)
);

create table if not exists public.payment_values (
  id                uuid primary key default gen_random_uuid(),
  payment_id        uuid not null references public.payments(id),
  method            text not null check (method in
                      ('efectivo','transferencia','tarjeta','qr','cheque_tercero','cheque_propio')),
  amount            numeric(14,2) not null check (amount > 0),
  account_id        uuid references public.treasury_accounts(id),
  received_check_id uuid references public.received_checks(id),
  issued_check_id   uuid references public.issued_checks(id),
  created_at        timestamptz not null default now(),
  constraint destino_segun_metodo check (
    (method in ('efectivo','transferencia','tarjeta','qr')
       and account_id is not null and received_check_id is null and issued_check_id is null)
 or (method = 'cheque_tercero'
       and received_check_id is not null and account_id is null and issued_check_id is null)
 or (method = 'cheque_propio'
       and issued_check_id is not null and account_id is null and received_check_id is null)
  )
);

create index if not exists idx_payment_values_payment on public.payment_values (payment_id);
create index if not exists idx_issued_checks_status on public.issued_checks (status, due_date) where voided = false;

alter table public.issued_checks  disable row level security;
alter table public.payment_values disable row level security;
grant select, insert, update, delete on table public.issued_checks  to anon, authenticated;
grant select, insert, update, delete on table public.payment_values to anon, authenticated;

-- El anulado de un cheque recibido es un estado, además del flag voided.
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
      and t.relname = 'received_checks'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%en_cartera%'
  loop
    execute format('alter table public.received_checks drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.received_checks add constraint received_checks_status_check
  check (status in ('en_cartera','depositado','acreditado','rechazado','endosado','anulado'));

-- Cada cobro/pago viejo pasa a un único valor. Se omiten filas que no cumplirían
-- destino_segun_metodo (cheque sin received_checks, o efectivo sin cuenta): si no,
-- el constraint aborta toda la migración.
insert into public.payment_values (payment_id, method, amount, account_id, received_check_id)
select p.id,
       case when p.payment_method = 'cheque' then 'cheque_tercero' else p.payment_method end,
       p.amount,
       case when p.payment_method = 'cheque' then null else p.account_id end,
       rc.id
from public.payments p
left join lateral (
  select c.id
  from public.received_checks c
  where c.payment_id = p.id
  order by c.created_at
  limit 1
) rc on true
where not exists (select 1 from public.payment_values v where v.payment_id = p.id)
  and p.amount > 0
  and (
    (p.payment_method = 'cheque' and rc.id is not null)
    or (
      p.payment_method in ('efectivo','transferencia','tarjeta','qr')
      and p.account_id is not null
    )
  );

-- El vocabulario viejo 'cheque' pasa a 'cheque_tercero'. Hay que soltar el check
-- ANTES del update: la restricción vigente no acepta el valor nuevo.
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

update public.payments set payment_method = 'cheque_tercero' where payment_method = 'cheque';

alter table public.payments add constraint payments_payment_method_check
  check (payment_method is null or payment_method in
    ('efectivo','transferencia','tarjeta','qr','cheque_tercero','cheque_propio','mixto'));

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
    when 'cheque_tercero' then 'Cheque'
    when 'cheque_propio' then 'Cheque propio'
    when 'mixto' then 'Mixto'
    else p_method
  end;
$$;

-- ─── register_payment: un array de valores ───────────────────────────
-- GOTCHA: cambiar la firma exige DROP de las firmas viejas y un GRANT nuevo.
drop function if exists public.register_payment(text, uuid, uuid, timestamptz, numeric, text, text, uuid);
drop function if exists public.register_payment(text, uuid, uuid, timestamptz, numeric, text, text, uuid, uuid);
drop function if exists public.register_payment(text, uuid, uuid, timestamptz, numeric, text, text, uuid, uuid, jsonb);

create or replace function public.register_payment(
  p_type text,
  p_customer_id uuid,
  p_supplier_id uuid,
  p_date timestamptz,
  p_amount numeric,
  p_concept text,
  p_created_by uuid,
  p_values jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_amount numeric(14,2);
  v_sum numeric(14,2) := 0;
  v_count int := 0;
  v_line jsonb;
  v_method text;
  v_line_amount numeric(14,2);
  v_header_method text;
  v_header_account uuid;
  v_only_account uuid;
  v_account_id uuid;
  v_acc public.treasury_accounts%rowtype;
  v_label text;
  v_acc_concept text;
  v_fin_type text;
  v_check jsonb;
  v_check_number text;
  v_kind text;
  v_due date;
  v_issue date;
  v_received_id uuid;
  v_issued_id uuid;
  v_rc public.received_checks%rowtype;
  v_when timestamptz;
begin
  if p_type not in ('cobro', 'pago') then
    raise exception 'INVALID_TYPE';
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
  if p_values is null or jsonb_typeof(p_values) <> 'array' or jsonb_array_length(p_values) = 0 then
    raise exception 'VALUES_REQUIRED';
  end if;

  v_amount := round(p_amount::numeric, 2);
  v_when := coalesce(p_date, now());

  -- Primera pasada: forma y suma. La suma tiene que ser el total, al centavo.
  for v_line in select e from jsonb_array_elements(p_values) as t(e)
  loop
    if jsonb_typeof(v_line) <> 'object' then
      raise exception 'INVALID_PAYMENT_METHOD';
    end if;
    v_count := v_count + 1;
    v_method := v_line->>'method';
    if v_method not in ('efectivo','transferencia','tarjeta','qr','cheque_tercero','cheque_propio') then
      raise exception 'INVALID_PAYMENT_METHOD';
    end if;

    begin
      v_line_amount := round((v_line->>'amount')::numeric, 2);
    exception when others then
      raise exception 'INVALID_AMOUNT';
    end;
    if v_line_amount is null or v_line_amount <= 0 then
      raise exception 'INVALID_AMOUNT';
    end if;
    v_sum := round(v_sum + v_line_amount, 2);

    if v_header_method is null then
      v_header_method := v_method;
    elsif v_header_method <> v_method then
      v_header_method := 'mixto';
    end if;

    if v_method in ('efectivo','transferencia','tarjeta','qr') then
      begin
        v_account_id := nullif(v_line->>'account_id', '')::uuid;
      exception when others then
        raise exception 'ACCOUNT_NOT_FOUND';
      end;
      perform public.assert_ars_treasury_account(v_account_id);
      if v_count = 1 then
        v_only_account := v_account_id;
      end if;
    elsif v_method = 'cheque_tercero' then
      if p_type = 'cobro' then
        v_check := v_line->'check';
        if v_check is null or jsonb_typeof(v_check) <> 'object' then
          raise exception 'CHECK_REQUIRED';
        end if;
        if nullif(trim(coalesce(v_check->>'check_number', '')), '') is null then
          raise exception 'CHECK_NUMBER_REQUIRED';
        end if;
        v_kind := coalesce(nullif(trim(coalesce(v_check->>'kind', '')), ''), 'papel');
        if v_kind not in ('papel', 'echeq') then
          raise exception 'INVALID_CHECK_KIND';
        end if;
        if nullif(trim(coalesce(v_check->>'due_date', '')), '') is null then
          raise exception 'DUE_DATE_REQUIRED';
        end if;
        begin
          v_due := (v_check->>'due_date')::date;
        exception when others then
          raise exception 'DUE_DATE_REQUIRED';
        end;
        if nullif(trim(coalesce(v_check->>'issue_date', '')), '') is not null then
          begin
            v_issue := (v_check->>'issue_date')::date;
          exception when others then
            raise exception 'INVALID_ISSUE_DATE';
          end;
        end if;
      elsif p_type = 'pago' then
        if nullif(v_line->>'received_check_id', '') is null then
          raise exception 'CHECK_REQUIRED';
        end if;
      end if;
    elsif v_method = 'cheque_propio' then
      if p_type <> 'pago' then
        raise exception 'CHECK_PROPIO_ONLY_ON_PAYMENT';
      end if;
      if nullif(trim(coalesce(v_line->>'check_number', '')), '') is null then
        raise exception 'CHECK_NUMBER_REQUIRED';
      end if;
      v_kind := coalesce(nullif(trim(coalesce(v_line->>'kind', '')), ''), 'papel');
      if v_kind not in ('papel', 'echeq') then
        raise exception 'INVALID_CHECK_KIND';
      end if;
      if nullif(trim(coalesce(v_line->>'due_date', '')), '') is null then
        raise exception 'DUE_DATE_REQUIRED';
      end if;
      begin
        v_due := (v_line->>'due_date')::date;
      exception when others then
        raise exception 'DUE_DATE_REQUIRED';
      end;
      if nullif(trim(coalesce(v_line->>'issue_date', '')), '') is not null then
        begin
          v_issue := (v_line->>'issue_date')::date;
        exception when others then
          raise exception 'INVALID_ISSUE_DATE';
        end;
      end if;
      begin
        v_account_id := nullif(v_line->>'account_id', '')::uuid;
      exception when others then
        raise exception 'ACCOUNT_NOT_FOUND';
      end;
      if v_account_id is null then
        raise exception 'ACCOUNT_REQUIRED';
      end if;
      select * into v_acc from public.treasury_accounts where id = v_account_id;
      if not found then
        raise exception 'ACCOUNT_NOT_FOUND';
      end if;
      if not v_acc.enabled then
        raise exception 'ACCOUNT_DISABLED';
      end if;
      if v_acc.currency <> 'ARS' then
        raise exception 'ACCOUNT_NOT_ARS';
      end if;
      if v_acc.type <> 'banco' then
        raise exception 'ACCOUNT_NOT_BANK';
      end if;
    end if;
  end loop;

  if v_sum <> v_amount then
    raise exception 'VALUES_TOTAL_MISMATCH';
  end if;

  if v_count = 1 and v_header_method in ('efectivo','transferencia','tarjeta','qr') then
    v_header_account := v_only_account;
  else
    v_header_account := null;
  end if;

  v_label := public.payment_method_label(v_header_method);
  if p_type = 'cobro' then
    v_acc_concept := coalesce(nullif(trim(p_concept), ''), 'Cobro - ' || v_label);
    v_fin_type := 'ingreso';
  else
    v_acc_concept := coalesce(nullif(trim(p_concept), ''), 'Pago - ' || v_label);
    v_fin_type := 'egreso';
  end if;

  insert into public.payments (
    id, type, customer_id, supplier_id, date, amount,
    payment_method, concept, created_by, voided, account_id
  ) values (
    v_id, p_type, p_customer_id, p_supplier_id, v_when, v_amount,
    v_header_method, nullif(trim(p_concept), ''), p_created_by, false, v_header_account
  );

  -- Un solo asiento de cuenta corriente, por el total.
  insert into public.account_movements (
    id, date, customer_id, supplier_id, concept, debe, haber,
    reference_type, reference_id, created_by, voided
  ) values (
    gen_random_uuid(),
    v_when,
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

  for v_line in select e from jsonb_array_elements(p_values) as t(e)
  loop
    v_method := v_line->>'method';
    v_line_amount := round((v_line->>'amount')::numeric, 2);

    if v_method in ('efectivo','transferencia','tarjeta','qr') then
      v_account_id := nullif(v_line->>'account_id', '')::uuid;
      insert into public.finance_movements (
        id, date, type, concept, payment_method, amount, reference_id, voided, account_id
      ) values (
        gen_random_uuid(),
        v_when,
        v_fin_type,
        v_acc_concept,
        v_method,
        v_line_amount,
        v_id,
        false,
        v_account_id
      );
      insert into public.payment_values (payment_id, method, amount, account_id)
      values (v_id, v_method, v_line_amount, v_account_id);

    elsif v_method = 'cheque_tercero' and p_type = 'cobro' then
      v_check := v_line->'check';
      v_check_number := nullif(trim(v_check->>'check_number'), '');
      v_kind := coalesce(nullif(trim(coalesce(v_check->>'kind', '')), ''), 'papel');
      v_due := (v_check->>'due_date')::date;
      if nullif(trim(coalesce(v_check->>'issue_date', '')), '') is null then
        v_issue := null;
      else
        v_issue := (v_check->>'issue_date')::date;
      end if;
      v_received_id := gen_random_uuid();
      insert into public.received_checks (
        id, check_number, kind, bank, drawer_name, drawer_tax_id,
        amount, issue_date, due_date, customer_id, payment_id,
        status, created_by, voided
      ) values (
        v_received_id,
        v_check_number,
        v_kind,
        nullif(trim(coalesce(v_check->>'bank', '')), ''),
        nullif(trim(coalesce(v_check->>'drawer_name', '')), ''),
        nullif(trim(coalesce(v_check->>'drawer_tax_id', '')), ''),
        v_line_amount,
        v_issue,
        v_due,
        p_customer_id,
        v_id,
        'en_cartera',
        p_created_by,
        false
      );
      insert into public.payment_values (payment_id, method, amount, received_check_id)
      values (v_id, 'cheque_tercero', v_line_amount, v_received_id);

    elsif v_method = 'cheque_tercero' and p_type = 'pago' then
      v_received_id := nullif(v_line->>'received_check_id', '')::uuid;
      select * into v_rc from public.received_checks where id = v_received_id for update;
      if not found then
        raise exception 'CHECK_NOT_FOUND';
      end if;
      if v_rc.voided or v_rc.status <> 'en_cartera' then
        raise exception 'CHECK_NOT_IN_PORTFOLIO: el cheque Nº % no está en cartera.', v_rc.check_number;
      end if;
      if round(v_rc.amount, 2) <> v_line_amount then
        raise exception 'CHECK_AMOUNT_MISMATCH';
      end if;
      update public.received_checks
      set
        status = 'endosado',
        endorsed_to_supplier_id = p_supplier_id,
        endorsed_at = v_when
      where id = v_received_id;
      insert into public.payment_values (payment_id, method, amount, received_check_id)
      values (v_id, 'cheque_tercero', v_line_amount, v_received_id);

    elsif v_method = 'cheque_propio' then
      v_check_number := nullif(trim(v_line->>'check_number'), '');
      v_kind := coalesce(nullif(trim(coalesce(v_line->>'kind', '')), ''), 'papel');
      v_due := (v_line->>'due_date')::date;
      if nullif(trim(coalesce(v_line->>'issue_date', '')), '') is null then
        v_issue := null;
      else
        v_issue := (v_line->>'issue_date')::date;
      end if;
      v_account_id := nullif(v_line->>'account_id', '')::uuid;
      v_issued_id := gen_random_uuid();
      insert into public.issued_checks (
        id, check_number, kind, account_id, supplier_id, amount,
        issue_date, due_date, status, created_by, voided
      ) values (
        v_issued_id,
        v_check_number,
        v_kind,
        v_account_id,
        p_supplier_id,
        v_line_amount,
        v_issue,
        v_due,
        'pendiente',
        p_created_by,
        false
      );
      insert into public.payment_values (payment_id, method, amount, issued_check_id)
      values (v_id, 'cheque_propio', v_line_amount, v_issued_id);
    else
      raise exception 'INVALID_PAYMENT_METHOD';
    end if;
  end loop;

  return v_id;
end;
$$;

grant execute on function public.register_payment(text, uuid, uuid, timestamptz, numeric, text, uuid, jsonb)
  to anon, authenticated, service_role;

-- Revierte un cobro/pago completo: cuenta corriente, plata y cheques.
-- p_rejected_issued_id / p_rejected_received_id marcan el instrumento que queda
-- Rechazado (el resto de los cheques propios se anula; los de tercero del cobro también).
-- Un cheque endosado por ESTE pago vuelve a cartera.
create or replace function public.apply_payment_reversal(
  p_payment_id uuid,
  p_user_id uuid,
  p_reason text,
  p_rejected_issued_id uuid default null,
  p_rejected_received_id uuid default null,
  p_when timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.payments%rowtype;
  v_rc public.received_checks%rowtype;
  v_ic public.issued_checks%rowtype;
  v_when timestamptz;
  v_currency text;
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

  v_when := coalesce(p_when, now());

  for v_rc in
    select rc.*
    from public.received_checks rc
    where rc.id in (
      select v.received_check_id
      from public.payment_values v
      where v.payment_id = p_payment_id and v.received_check_id is not null
      union
      select c.id from public.received_checks c where c.payment_id = p_payment_id
    )
    for update
  loop
    if v_rc.payment_id is not distinct from p_payment_id then
      if v_rc.id = p_rejected_received_id then
        if v_rc.voided then
          raise exception 'CHECK_VOIDED';
        end if;
        if v_rc.status = 'endosado' then
          raise exception 'CHECK_ALREADY_ENDORSED: el cheque Nº % ya fue endosado. Anulá primero el pago que lo endosó.', v_rc.check_number;
        end if;
        if v_rc.status = 'rechazado' then
          raise exception 'CHECK_ALREADY_REJECTED';
        end if;
        if v_rc.status not in ('en_cartera', 'depositado', 'acreditado') then
          raise exception 'CHECK_CANNOT_REJECT';
        end if;
      else
        if v_rc.status = 'acreditado' then
          raise exception 'CHECK_ALREADY_CREDITED: el cheque recibido Nº % ya está acreditado. Rechazalo desde Cheques antes de anular este cobro.', v_rc.check_number;
        end if;
        if v_rc.status = 'endosado' then
          raise exception 'CHECK_ALREADY_ENDORSED: el cheque Nº % ya fue endosado. Anulá primero el pago que lo endosó.', v_rc.check_number;
        end if;
      end if;
    else
      if v_rc.voided then
        raise exception 'CHECK_VOIDED';
      end if;
      if v_rc.status <> 'endosado' then
        raise exception 'CHECK_NOT_ENDORSED: el cheque Nº % ya no está endosado. No se puede revertir este pago.', v_rc.check_number;
      end if;
    end if;
  end loop;

  for v_ic in
    select ic.*
    from public.issued_checks ic
    where ic.id in (
      select v.issued_check_id
      from public.payment_values v
      where v.payment_id = p_payment_id and v.issued_check_id is not null
    )
    for update
  loop
    if v_ic.status = 'debitado' then
      raise exception 'CHECK_ALREADY_DEBITED: el cheque propio Nº % ya fue debitado y la plata ya salió de la cuenta. Este pago no se puede anular.', v_ic.check_number;
    end if;
    if v_ic.id = p_rejected_issued_id and v_ic.status <> 'pendiente' then
      raise exception 'CHECK_NOT_PENDING';
    end if;
  end loop;

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
  where reference_id = p_payment_id
    and voided = false;

  for v_rc in
    select rc.*
    from public.received_checks rc
    where rc.id in (
      select v.received_check_id
      from public.payment_values v
      where v.payment_id = p_payment_id and v.received_check_id is not null
      union
      select c.id from public.received_checks c where c.payment_id = p_payment_id
    )
    for update
  loop
    if v_rc.payment_id is not distinct from p_payment_id then
      if v_rc.id = p_rejected_received_id then
        if v_rc.status = 'acreditado' then
          if v_rc.deposit_account_id is null then
            raise exception 'ACCOUNT_REQUIRED';
          end if;
          select currency into v_currency
          from public.treasury_accounts
          where id = v_rc.deposit_account_id;
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
            'Rechazo cheque Nº ' || v_rc.check_number,
            'cheque_tercero',
            v_rc.amount,
            v_rc.id,
            false,
            v_rc.deposit_account_id
          );
        end if;
        update public.received_checks
        set
          status = 'rechazado',
          rejected_at = v_when,
          rejection_reason = trim(p_reason)
        where id = v_rc.id;
      elsif v_rc.status in ('en_cartera', 'depositado') and not v_rc.voided then
        update public.received_checks
        set
          status = 'anulado',
          voided = true,
          voided_at = now(),
          voided_by = p_user_id,
          void_reason = trim(p_reason)
        where id = v_rc.id;
      end if;
    else
      update public.received_checks
      set
        status = 'en_cartera',
        endorsed_to_supplier_id = null,
        endorsed_at = null
      where id = v_rc.id
        and status = 'endosado';
    end if;
  end loop;

  for v_ic in
    select ic.*
    from public.issued_checks ic
    where ic.id in (
      select v.issued_check_id
      from public.payment_values v
      where v.payment_id = p_payment_id and v.issued_check_id is not null
    )
    for update
  loop
    if v_ic.id = p_rejected_issued_id then
      update public.issued_checks
      set
        status = 'rechazado',
        rejected_at = v_when,
        rejection_reason = trim(p_reason)
      where id = v_ic.id;
    elsif v_ic.status = 'pendiente' and not v_ic.voided then
      update public.issued_checks
      set
        status = 'anulado',
        voided = true,
        voided_at = now(),
        voided_by = p_user_id
      where id = v_ic.id;
    end if;
  end loop;
end;
$$;

revoke all on function public.apply_payment_reversal(uuid, uuid, text, uuid, uuid, timestamptz) from public;
revoke all on function public.apply_payment_reversal(uuid, uuid, text, uuid, uuid, timestamptz) from anon;
revoke all on function public.apply_payment_reversal(uuid, uuid, text, uuid, uuid, timestamptz) from authenticated;

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
begin
  perform public.apply_payment_reversal(p_payment_id, p_user_id, p_reason);
end;
$$;

grant execute on function public.void_payment(uuid, uuid, text) to anon, authenticated, service_role;

-- Rechazar un cheque recibido que nació de un cobro revierte el movimiento entero
-- (incluida la plata de los otros valores). Sin cobro, solo cambia el cheque y,
-- si ya estaba acreditado, saca la plata con un egreso nuevo.
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
    raise exception 'CHECK_ALREADY_ENDORSED: el cheque Nº % ya fue endosado. Anulá primero el pago que lo endosó.', v_check.check_number;
  end if;
  if v_check.status = 'rechazado' then
    raise exception 'CHECK_ALREADY_REJECTED';
  end if;
  if v_check.status not in ('en_cartera', 'depositado', 'acreditado') then
    raise exception 'CHECK_CANNOT_REJECT';
  end if;

  v_when := coalesce(p_date, now());

  if v_check.payment_id is not null then
    perform public.apply_payment_reversal(
      v_check.payment_id, p_user_id, trim(p_reason), null, v_check.id, v_when
    );
    return;
  end if;

  if v_check.status = 'acreditado' then
    if v_check.deposit_account_id is null then
      raise exception 'ACCOUNT_REQUIRED';
    end if;
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
      'cheque_tercero',
      v_check.amount,
      v_check.id,
      false,
      v_check.deposit_account_id
    );
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

-- Debitar es el único momento en que un cheque propio saca plata de su cuenta bancaria.
create or replace function public.debit_issued_check(
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
  v_check public.issued_checks%rowtype;
  v_currency text;
  v_when timestamptz;
begin
  select * into v_check from public.issued_checks where id = p_check_id for update;
  if not found then
    raise exception 'ISSUED_CHECK_NOT_FOUND';
  end if;
  if v_check.voided or v_check.status <> 'pendiente' then
    raise exception 'CHECK_NOT_PENDING';
  end if;

  select currency into v_currency
  from public.treasury_accounts
  where id = v_check.account_id;
  if not found then
    raise exception 'ACCOUNT_NOT_FOUND';
  end if;
  if v_currency <> 'ARS' then
    raise exception 'ACCOUNT_NOT_ARS';
  end if;

  v_when := coalesce(p_date, now());

  insert into public.finance_movements (
    id, date, type, concept, payment_method, amount, reference_id, voided, account_id
  ) values (
    gen_random_uuid(),
    v_when,
    'egreso',
    'Débito cheque propio Nº ' || v_check.check_number,
    'cheque_propio',
    v_check.amount,
    v_check.id,
    false,
    v_check.account_id
  );

  update public.issued_checks
  set status = 'debitado', debited_at = v_when
  where id = p_check_id;
end;
$$;

grant execute on function public.debit_issued_check(uuid, timestamptz, uuid) to anon, authenticated, service_role;

-- Rechazar un cheque propio pendiente anula el pago entero y devuelve la deuda.
create or replace function public.reject_issued_check(
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
  v_check public.issued_checks%rowtype;
  v_payment_id uuid;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED';
  end if;

  select * into v_check from public.issued_checks where id = p_check_id for update;
  if not found then
    raise exception 'ISSUED_CHECK_NOT_FOUND';
  end if;
  if v_check.voided or v_check.status <> 'pendiente' then
    raise exception 'CHECK_NOT_PENDING';
  end if;

  select payment_id into v_payment_id
  from public.payment_values
  where issued_check_id = p_check_id
  limit 1;
  if v_payment_id is null then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  perform public.apply_payment_reversal(
    v_payment_id, p_user_id, trim(p_reason), p_check_id, null, coalesce(p_date, now())
  );
end;
$$;

grant execute on function public.reject_issued_check(uuid, timestamptz, text, uuid) to anon, authenticated, service_role;

-- finance_movements.reference_id es uuid. Estas dos funciones de la etapa anterior
-- lo escribían como texto y fallaban al acreditar o anular un cheque recibido.
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
    v_check.id,
    false,
    v_check.deposit_account_id
  );

  update public.received_checks
  set status = 'acreditado', credited_at = v_when
  where id = p_check_id;
end;
$$;

grant execute on function public.credit_check(uuid, timestamptz, uuid) to anon, authenticated, service_role;

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
  where reference_id = p_check_id
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
