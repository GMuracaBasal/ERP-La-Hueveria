import { roundMoney } from './accountMovements';
import { getTreasuryRpcErrorMessage } from './treasury';
import { parseLocalDate, todayISODate } from './utils';
import type { ReceivedCheck, ReceivedCheckStatus } from '../types';

export const CHECK_STATUS_OPTIONS: { value: ReceivedCheckStatus | 'todos'; label: string }[] = [
  { value: 'todos', label: 'Todos los estados' },
  { value: 'en_cartera', label: 'En cartera' },
  { value: 'depositado', label: 'Depositado' },
  { value: 'acreditado', label: 'Acreditado' },
  { value: 'rechazado', label: 'Rechazado' },
  { value: 'endosado', label: 'Endosado' },
];

export const CHECK_KIND_OPTIONS: { value: 'papel' | 'echeq'; label: string }[] = [
  { value: 'papel', label: 'Papel' },
  { value: 'echeq', label: 'eCheq' },
];

export function checkStatusLabel(status: ReceivedCheckStatus): string {
  return CHECK_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

export function checkKindLabel(kind: string): string {
  return CHECK_KIND_OPTIONS.find((o) => o.value === kind)?.label ?? kind;
}

export function checkStatusVariant(
  status: ReceivedCheckStatus,
): 'default' | 'success' | 'danger' | 'warning' {
  if (status === 'en_cartera') return 'warning';
  if (status === 'acreditado') return 'success';
  if (status === 'rechazado') return 'danger';
  return 'default';
}

export function sumReceivedChecks(
  checks: ReceivedCheck[],
  status: ReceivedCheckStatus,
): number {
  return checks
    .filter((c) => !c.voided && c.status === status)
    .reduce((acc, c) => roundMoney(acc + c.amount), 0);
}

function addDaysISO(iso: string, days: number): string {
  const d = parseLocalDate(iso);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type DueAttention = 'overdue' | 'today' | 'soon' | null;

/** En cartera o depositado, vencido o con vencimiento dentro de 7 días. */
export function checkDueAttention(
  check: Pick<ReceivedCheck, 'status' | 'dueDate'>,
  today = todayISODate(),
): DueAttention {
  if (check.status !== 'en_cartera' && check.status !== 'depositado') return null;
  const due = check.dueDate.slice(0, 10);
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  if (due <= addDaysISO(today, 7)) return 'soon';
  return null;
}

export function rpcErrorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err) {
    const e = err as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    return [e.message, e.details, e.hint, e.code].filter((p) => p != null && p !== '').join(' ');
  }
  return err == null ? '' : String(err);
}

export function getReceivedCheckErrorMessage(err: unknown): string {
  const raw = rpcErrorText(err);
  if (raw.includes('CHECK_REQUIRED')) return 'Faltan los datos del cheque.';
  if (raw.includes('CHECK_NUMBER_REQUIRED')) return 'El número de cheque es obligatorio.';
  if (raw.includes('DUE_DATE_REQUIRED')) return 'El vencimiento del cheque es obligatorio.';
  if (raw.includes('INVALID_ISSUE_DATE')) return 'La fecha de emisión no es válida.';
  if (raw.includes('INVALID_CHECK_KIND')) return 'El tipo de cheque tiene que ser papel o eCheq.';
  if (raw.includes('CHECK_AMOUNT_MISMATCH')) return 'El importe del cheque tiene que coincidir con el del cobro.';
  if (raw.includes('CHECK_ONLY_ON_COLLECTION')) return 'El cheque recibido solo se usa en cobros a clientes.';
  if (raw.includes('CHECK_NO_ACCOUNT')) return 'Un cobro con cheque no entra a una cuenta. La plata entra al acreditar.';
  if (raw.includes('CHECK_NOT_IN_PORTFOLIO')) return 'Solo se puede depositar un cheque que está en cartera.';
  if (raw.includes('CHECK_NOT_DEPOSITED')) return 'Solo se puede acreditar un cheque que está depositado.';
  if (raw.includes('CHECK_ENDORSED')) return 'Ese cheque está endosado. El endoso se resuelve en una etapa posterior.';
  if (raw.includes('CHECK_ALREADY_REJECTED')) return 'Este cheque ya está rechazado.';
  if (raw.includes('CHECK_CANNOT_REJECT')) return 'Ese cheque no se puede rechazar.';
  if (raw.includes('CHECK_VOIDED')) return 'Este cheque está anulado.';
  if (raw.includes('CHECK_ALREADY_CREDITED')) {
    return 'Este cobro está ligado a un cheque ya acreditado (CHECK_ALREADY_CREDITED). Rechazalo desde Cheques: así vuelve la deuda y sale la plata de la cuenta.';
  }
  if (raw.includes('CHECK_NOT_FOUND')) return 'No se encontró el cheque.';
  if (raw.includes('row-level security') || raw.includes('42501') || raw.includes('permission denied')) {
    return `${raw} — Aplicá la migración de cheques (RLS off y GRANT sobre received_checks).`;
  }
  if (
    raw.includes('received_checks') ||
    raw.includes('deposit_check') ||
    raw.includes('credit_check') ||
    raw.includes('reject_check') ||
    raw.includes('void_received_check') ||
    raw.includes('schema cache') ||
    raw.includes('Could not find the table') ||
    raw.includes('does not exist')
  ) {
    return `${raw} — Aplicá en el SQL Editor la migración de cheques recibidos (20261110_received_checks.sql).`;
  }
  return getTreasuryRpcErrorMessage(err);
}
