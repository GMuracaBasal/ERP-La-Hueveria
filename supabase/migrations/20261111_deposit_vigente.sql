-- Solo se deposita un cheque vigente: desde la fecha de cobro y por 30 días.
-- Reemplaza deposit_check. El resto de la cartera no cambia.
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
  if (now() at time zone 'America/Argentina/Buenos_Aires')::date < v_check.due_date
     or (now() at time zone 'America/Argentina/Buenos_Aires')::date > v_check.due_date + 30 then
    raise exception 'CHECK_NOT_CURRENT';
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
