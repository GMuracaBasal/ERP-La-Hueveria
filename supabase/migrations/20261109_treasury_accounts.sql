-- Tesorería Etapa 1: cuentas, transferencias y account_id en el libro de plata.
-- RECORDÁ: aplicar a mano en el SQL Editor de Supabase; este archivo es registro histórico.
-- Un solo libro: se extiende finance_movements. NO hay tabla de movimientos paralela.

create table if not exists public.treasury_accounts (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  type            text not null check (type in ('efectivo','banco','billetera','otra')),
  bank            text,
  account_number  text,
  currency        text not null default 'ARS' check (currency in ('ARS','USD')),
  initial_balance numeric(14,2) not null default 0,
  opening_date    date not null default current_date,
  is_default      boolean not null default false,
  enabled         boolean not null default true,
  notes           text,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.users(id)
);

-- Una sola cuenta por defecto (mismo patrón que price_lists)
create unique index if not exists treasury_accounts_one_default
  on public.treasury_accounts ((true)) where is_default = true;

create table if not exists public.treasury_transfers (
  id                 uuid primary key default gen_random_uuid(),
  date               timestamptz not null default now(),
  from_account_id    uuid not null references public.treasury_accounts(id),
  to_account_id      uuid not null references public.treasury_accounts(id),
  amount_from        numeric(14,2) not null check (amount_from > 0),
  amount_to          numeric(14,2) not null check (amount_to > 0),
  concept            text,
  created_by         uuid references public.users(id),
  created_at         timestamptz not null default now(),
  voided             boolean not null default false,
  voided_at          timestamptz,
  voided_by          uuid references public.users(id),
  constraint cuentas_distintas check (from_account_id <> to_account_id)
);

alter table public.treasury_transfers
  add column if not exists void_reason text;

alter table public.finance_movements
  add column if not exists account_id uuid references public.treasury_accounts(id);
alter table public.finance_movements
  add column if not exists transfer_id uuid references public.treasury_transfers(id);

create index if not exists idx_finance_account
  on public.finance_movements (account_id, date)
  where voided = false;

-- Cuenta por defecto + backfill del histórico
insert into public.treasury_accounts (name, type, currency, is_default)
select 'Caja', 'efectivo', 'ARS', true
where not exists (select 1 from public.treasury_accounts);

update public.finance_movements
set account_id = (select id from public.treasury_accounts where is_default limit 1)
where account_id is null;

-- Hasta la Etapa 1b, los cobros/pagos/ventas/compras siguen sin mandar account_id:
-- el trigger los asigna a la cuenta default para no romper el libro.
create or replace function public.finance_movements_default_account()
returns trigger
language plpgsql
as $$
begin
  if NEW.account_id is null then
    select id into NEW.account_id
    from public.treasury_accounts
    where is_default = true
    limit 1;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_finance_movements_default_account on public.finance_movements;
create trigger trg_finance_movements_default_account
before insert on public.finance_movements
for each row
execute procedure public.finance_movements_default_account();

-- Transferencia atómica: cabecera + egreso + ingreso (todo o nada)
create or replace function public.register_treasury_transfer(
  p_date timestamptz,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount_from numeric,
  p_amount_to numeric,
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
  v_from public.treasury_accounts%rowtype;
  v_to public.treasury_accounts%rowtype;
  v_amount_from numeric(14,2);
  v_amount_to numeric(14,2);
  v_from_concept text;
  v_to_concept text;
  v_custom text;
  v_date timestamptz;
begin
  if p_from_account_id is null or p_to_account_id is null then
    raise exception 'ACCOUNTS_REQUIRED';
  end if;
  if p_from_account_id = p_to_account_id then
    raise exception 'SAME_ACCOUNT';
  end if;
  if p_amount_from is null or p_amount_from <= 0 then
    raise exception 'INVALID_AMOUNT_FROM';
  end if;
  if p_amount_to is null or p_amount_to <= 0 then
    raise exception 'INVALID_AMOUNT_TO';
  end if;

  select * into v_from from public.treasury_accounts where id = p_from_account_id for update;
  if not found then
    raise exception 'FROM_ACCOUNT_NOT_FOUND';
  end if;
  if not v_from.enabled then
    raise exception 'FROM_ACCOUNT_DISABLED';
  end if;

  select * into v_to from public.treasury_accounts where id = p_to_account_id for update;
  if not found then
    raise exception 'TO_ACCOUNT_NOT_FOUND';
  end if;
  if not v_to.enabled then
    raise exception 'TO_ACCOUNT_DISABLED';
  end if;

  v_amount_from := round(p_amount_from::numeric, 2);
  v_amount_to := round(p_amount_to::numeric, 2);

  if v_from.currency = v_to.currency and v_amount_from <> v_amount_to then
    raise exception 'AMOUNTS_MUST_MATCH';
  end if;

  v_date := coalesce(p_date, now());
  v_custom := nullif(trim(coalesce(p_concept, '')), '');
  v_from_concept := 'Transferencia a ' || v_to.name;
  v_to_concept := 'Transferencia de ' || v_from.name;
  if v_custom is not null then
    v_from_concept := v_from_concept || ' — ' || v_custom;
    v_to_concept := v_to_concept || ' — ' || v_custom;
  end if;

  insert into public.treasury_transfers (
    id, date, from_account_id, to_account_id,
    amount_from, amount_to, concept, created_by, voided
  ) values (
    v_id, v_date, p_from_account_id, p_to_account_id,
    v_amount_from, v_amount_to, v_custom, p_created_by, false
  );

  insert into public.finance_movements (
    id, date, type, concept, payment_method, amount,
    reference_id, account_id, transfer_id, voided
  ) values (
    gen_random_uuid(), v_date, 'egreso', v_from_concept, 'transferencia', v_amount_from,
    v_id::text, p_from_account_id, v_id, false
  );

  insert into public.finance_movements (
    id, date, type, concept, payment_method, amount,
    reference_id, account_id, transfer_id, voided
  ) values (
    gen_random_uuid(), v_date, 'ingreso', v_to_concept, 'transferencia', v_amount_to,
    v_id::text, p_to_account_id, v_id, false
  );

  return v_id;
end;
$$;

-- Anula la transferencia y SUS DOS patas en una sola transacción
create or replace function public.void_treasury_transfer(
  p_transfer_id uuid,
  p_user_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tr public.treasury_transfers%rowtype;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED';
  end if;

  select * into v_tr from public.treasury_transfers where id = p_transfer_id for update;
  if not found then
    raise exception 'TRANSFER_NOT_FOUND';
  end if;
  if v_tr.voided then
    raise exception 'TRANSFER_ALREADY_VOIDED';
  end if;

  update public.treasury_transfers
  set
    voided = true,
    voided_at = now(),
    voided_by = p_user_id,
    void_reason = trim(p_reason)
  where id = p_transfer_id;

  update public.finance_movements
  set voided = true
  where transfer_id = p_transfer_id
    and voided = false;
end;
$$;

grant execute on function public.register_treasury_transfer(timestamptz, uuid, uuid, numeric, numeric, text, uuid) to anon, authenticated;
grant execute on function public.void_treasury_transfer(uuid, uuid, text) to anon, authenticated;
