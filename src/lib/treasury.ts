import { roundMoney } from './accountMovements';
import type { FinanceMovement, TreasuryAccount, TreasuryAccountType, TreasuryCurrency } from '../types';

export const TREASURY_TYPE_OPTIONS: { value: TreasuryAccountType; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'banco', label: 'Banco' },
  { value: 'billetera', label: 'Billetera' },
  { value: 'otra', label: 'Otra' },
];

export const TREASURY_CURRENCY_OPTIONS: { value: TreasuryCurrency; label: string }[] = [
  { value: 'ARS', label: 'Pesos (ARS)' },
  { value: 'USD', label: 'Dólares (USD)' },
];

export function treasuryTypeLabel(type: TreasuryAccountType): string {
  return TREASURY_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

export const DEFAULT_ACCOUNT_REQUIRED_MSG =
  'Tiene que haber siempre una cuenta por defecto. Marcá otra antes de cambiar ésta.';

/** Cuentas que pueden recibir cobros/pagos/ventas/compras: ARS habilitadas. */
export function arsEnabledAccounts(accounts: TreasuryAccount[]): TreasuryAccount[] {
  return accounts.filter((a) => a.enabled && a.currency === 'ARS');
}

export function defaultArsAccountId(accounts: TreasuryAccount[]): string {
  const ars = arsEnabledAccounts(accounts);
  return ars.find((a) => a.isDefault)?.id || ars[0]?.id || '';
}

export function treasuryAccountOptionLabel(account: TreasuryAccount): string {
  const extra = [account.bank, account.accountNumber].filter(Boolean).join(' · ');
  return extra ? `${account.name} (${extra})` : account.name;
}

export function formatTreasuryMoney(amount: number, currency: TreasuryCurrency = 'ARS'): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Saldo de una cuenta: inicial + ingresos − egresos (solo voided = false). */
export function computeAccountBalance(
  account: TreasuryAccount,
  movements: FinanceMovement[],
): number {
  const active = movements.filter((m) => !m.voided && m.accountId === account.id);
  const ingresos = active
    .filter((m) => m.type === 'ingreso')
    .reduce((acc, m) => roundMoney(acc + m.amount), 0);
  const egresos = active
    .filter((m) => m.type === 'egreso')
    .reduce((acc, m) => roundMoney(acc + m.amount), 0);
  return roundMoney(account.initialBalance + ingresos - egresos);
}

export function orderFinanceMovements(a: FinanceMovement, b: FinanceMovement): number {
  const byDate = a.date.localeCompare(b.date);
  if (byDate !== 0) return byDate;
  const aCreated = a.createdAt || a.date;
  const bCreated = b.createdAt || b.date;
  const byCreated = aCreated.localeCompare(bCreated);
  if (byCreated !== 0) return byCreated;
  return a.id.localeCompare(b.id);
}

export interface TreasuryLedgerRow extends FinanceMovement {
  runningBalance: number;
}

/**
 * Saldo corrido del libro de una cuenta.
 * Parte de initial_balance; las líneas anuladas no mueven el saldo.
 */
export function withAccountRunningBalance(
  account: TreasuryAccount,
  movements: FinanceMovement[],
): TreasuryLedgerRow[] {
  const sorted = [...movements].sort(orderFinanceMovements);
  let balance = roundMoney(account.initialBalance);
  return sorted.map((m) => {
    if (!m.voided) {
      balance = roundMoney(
        m.type === 'ingreso' ? balance + m.amount : balance - m.amount,
      );
    }
    return { ...m, runningBalance: balance };
  });
}

/** Cotización implícita (informativa). 1 unidad de la moneda destino. */
export function impliedFxRate(
  amountFrom: number,
  amountTo: number,
  fromCurrency: TreasuryCurrency,
  toCurrency: TreasuryCurrency,
): string | null {
  if (fromCurrency === toCurrency) return null;
  if (!(amountTo > 0) || !(amountFrom > 0)) return null;
  const rate = roundMoney(amountFrom / amountTo);
  return `1 ${toCurrency} = ${formatTreasuryMoney(rate, fromCurrency)}`;
}

export function getTreasuryRpcErrorMessage(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err && 'message' in err
        ? String((err as { message: unknown }).message)
        : '';
  if (raw.includes('REASON_REQUIRED')) return 'El motivo es obligatorio.';
  if (raw.includes('SAME_ACCOUNT')) return 'La cuenta origen y destino tienen que ser distintas.';
  if (raw.includes('INVALID_AMOUNT')) return 'El importe tiene que ser mayor a 0.';
  if (raw.includes('AMOUNTS_MUST_MATCH')) return 'Si las cuentas son de la misma moneda, los importes tienen que coincidir.';
  if (raw.includes('FROM_ACCOUNT_DISABLED') || raw.includes('TO_ACCOUNT_DISABLED')) {
    return 'No se puede transferir desde o hacia una cuenta deshabilitada.';
  }
  if (raw.includes('TRANSFER_ALREADY_VOIDED')) return 'Esta transferencia ya fue anulada.';
  if (raw.includes('TRANSFER_NOT_FOUND')) return 'No se encontró la transferencia.';
  if (raw.includes('FROM_ACCOUNT_NOT_FOUND') || raw.includes('TO_ACCOUNT_NOT_FOUND')) {
    return 'No se encontró una de las cuentas.';
  }
  if (raw.includes('ACCOUNT_REQUIRED')) {
    return 'Seleccioná la cuenta de tesorería (solo pesos).';
  }
  if (raw.includes('ACCOUNT_NOT_ARS')) {
    return 'Los cobros, pagos, ventas y compras solo pueden ir a cuentas en pesos.';
  }
  if (raw.includes('ACCOUNT_DISABLED')) {
    return 'Esa cuenta está deshabilitada.';
  }
  if (raw.includes('ACCOUNT_NOT_FOUND')) {
    return 'No se encontró la cuenta de tesorería.';
  }
  if (raw.includes('row-level security') || raw.includes('42501') || raw.includes('permission denied')) {
    return 'Supabase bloqueó la operación (RLS). En el SQL Editor corré el final de la migración de tesorería: desactivar RLS y GRANT sobre treasury_accounts / treasury_transfers.';
  }
  if (raw.includes('Could not find the table') || raw.includes('schema cache') || raw.includes('does not exist')) {
    return 'Falta aplicar la migración de tesorería en el SQL Editor de Supabase.';
  }
  return raw || 'No se pudo completar la operación. Intentá de nuevo.';
}
