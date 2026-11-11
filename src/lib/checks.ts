import { roundMoney } from './accountMovements';
import { getTreasuryRpcErrorMessage } from './treasury';
import { parseLocalDate, todayISODate } from './utils';
import type { IssuedCheck, IssuedCheckStatus, ReceivedCheck, ReceivedCheckStatus } from '../types';

export const CHECK_STATUS_OPTIONS: { value: ReceivedCheckStatus | 'todos'; label: string }[] = [
  { value: 'todos', label: 'Todos los estados' },
  { value: 'en_cartera', label: 'En cartera' },
  { value: 'depositado', label: 'Depositado' },
  { value: 'acreditado', label: 'Acreditado' },
  { value: 'rechazado', label: 'Rechazado' },
  { value: 'endosado', label: 'Endosado' },
  { value: 'anulado', label: 'Anulado' },
];

export const ISSUED_CHECK_STATUS_OPTIONS: { value: IssuedCheckStatus | 'todos'; label: string }[] = [
  { value: 'todos', label: 'Todos los estados' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'debitado', label: 'Debitado' },
  { value: 'rechazado', label: 'Rechazado' },
  { value: 'anulado', label: 'Anulado' },
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

export function issuedCheckStatusLabel(status: IssuedCheckStatus): string {
  return ISSUED_CHECK_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

export function issuedCheckStatusVariant(
  status: IssuedCheckStatus,
): 'default' | 'success' | 'danger' | 'warning' {
  if (status === 'pendiente') return 'warning';
  if (status === 'debitado') return 'success';
  if (status === 'rechazado') return 'danger';
  return 'default';
}

export function sumIssuedChecks(checks: IssuedCheck[], status: IssuedCheckStatus): number {
  return checks
    .filter((c) => !c.voided && c.status === status)
    .reduce((acc, c) => roundMoney(acc + c.amount), 0);
}

/**
 * Igual que un cheque recibido: vigente desde la fecha de cobro y por 30 días.
 * En un emitido ese estado es una salida, así que se muestra en rojo.
 */
export function issuedDueAttention(
  check: Pick<IssuedCheck, 'status' | 'dueDate'>,
  today = todayISODate(),
): DueAttention {
  if (check.status !== 'pendiente') return null;
  const due = check.dueDate.slice(0, 10);
  if (today < due) return null;
  if (today <= addDaysISO(due, CHECK_PRESENTATION_DAYS)) return 'current';
  return 'overdue';
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

export type DueAttention = 'overdue' | 'today' | 'soon' | 'current' | null;

/** Días en que el cheque se puede depositar, contados desde la fecha de cobro. */
export const CHECK_PRESENTATION_DAYS = 30;

/**
 * La fecha de cobro no vence el cheque.
 * Desde ese día y por 30 días está vigente y se puede depositar.
 * Al día 31 pasa a vencido.
 * Antes de la fecha de cobro no está por vencer ni vencido.
 */
export function checkDueAttention(
  check: Pick<ReceivedCheck, 'status' | 'dueDate'>,
  today = todayISODate(),
): DueAttention {
  if (check.status !== 'en_cartera' && check.status !== 'depositado') return null;
  const due = check.dueDate.slice(0, 10);
  if (today < due) return null;
  if (today <= addDaysISO(due, CHECK_PRESENTATION_DAYS)) return 'current';
  return 'overdue';
}

export function canDepositReceivedCheck(
  check: Pick<ReceivedCheck, 'status' | 'dueDate' | 'voided'>,
  today = todayISODate(),
): boolean {
  return !check.voided && check.status === 'en_cartera' && checkDueAttention(check, today) === 'current';
}

export function depositBlockedReason(
  check: Pick<ReceivedCheck, 'status' | 'dueDate' | 'voided'>,
  today = todayISODate(),
): string | null {
  if (canDepositReceivedCheck(check, today)) return null;
  const due = check.dueDate.slice(0, 10);
  if (today < due) return 'Se deposita desde la fecha de cobro, mientras el cheque esté vigente.';
  return 'Pasaron más de 30 días de la fecha de cobro. El cheque está vencido y no se puede depositar.';
}

export function receivedDueMark(
  attention: DueAttention,
): { label: string; variant: 'danger' | 'warning' | 'success'; rowClass: string } | null {
  if (attention === 'current') return { label: 'Vigente', variant: 'success', rowClass: 'bg-green-50' };
  if (attention === 'overdue') return { label: 'Vencido', variant: 'danger', rowClass: 'bg-red-50' };
  return null;
}

export function issuedDueMark(
  attention: DueAttention,
): { label: string; variant: 'danger' | 'success'; rowClass: string } | null {
  if (attention === 'current') return { label: 'Vigente', variant: 'danger', rowClass: 'bg-red-50' };
  if (attention === 'overdue') return { label: 'Vencido', variant: 'danger', rowClass: 'bg-red-50' };
  return null;
}

/** Cheques recibidos que hoy se pueden cobrar. Un endosado ya salió de la cartera y no entra. */
export function sumVigenteReceived(checks: ReceivedCheck[], today = todayISODate()): number {
  return checks
    .filter((c) => (
      !c.voided
      && c.status === 'en_cartera'
      && !c.endorsedToSupplierId
      && checkDueAttention(c, today) === 'current'
    ))
    .reduce((acc, c) => roundMoney(acc + c.amount), 0);
}

/** Cheques propios que hoy están para pagar. La plata sigue en la cuenta hasta el débito. */
export function sumVigenteIssued(checks: IssuedCheck[], today = todayISODate()): number {
  return checks
    .filter((c) => !c.voided && c.status === 'pendiente' && issuedDueAttention(c, today) === 'current')
    .reduce((acc, c) => roundMoney(acc + c.amount), 0);
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
  if (raw.includes('VALUES_TOTAL_MISMATCH')) {
    return 'La suma de los valores tiene que ser igual al total del movimiento.';
  }
  if (raw.includes('VALUES_REQUIRED')) return 'Agregá al menos un valor.';
  if (raw.includes('CHECK_PROPIO_ONLY_ON_PAYMENT')) return 'El cheque propio solo se usa en pagos a proveedores.';
  if (raw.includes('ACCOUNT_NOT_BANK')) return 'El cheque propio se gira contra una cuenta bancaria en pesos.';
  if (raw.includes('CHECK_NOT_PENDING')) return 'Solo se puede debitar o rechazar un cheque propio que está pendiente.';
  if (raw.includes('ISSUED_CHECK_NOT_FOUND')) return 'No se encontró el cheque propio.';
  if (raw.includes('CHECK_NOT_ENDORSED') || raw.includes('CHECK_ALREADY_DEBITED') || raw.includes('CHECK_ALREADY_ENDORSED') || raw.includes('CHECK_ALREADY_CREDITED')) {
    const spanish = raw.split(':').slice(1).join(':').trim();
    if (spanish && /cheque/i.test(spanish)) return spanish;
  }
  if (raw.includes('CHECK_REQUIRED')) return 'Faltan los datos del cheque.';
  if (raw.includes('CHECK_NUMBER_REQUIRED')) return 'El número de cheque es obligatorio.';
  if (raw.includes('DUE_DATE_REQUIRED')) return 'El vencimiento del cheque es obligatorio.';
  if (raw.includes('INVALID_ISSUE_DATE')) return 'La fecha de emisión no es válida.';
  if (raw.includes('INVALID_CHECK_KIND')) return 'El tipo de cheque tiene que ser papel o eCheq.';
  if (raw.includes('CHECK_AMOUNT_MISMATCH')) return 'El importe del valor tiene que coincidir con el del cheque de cartera.';
  if (raw.includes('CHECK_ONLY_ON_COLLECTION')) return 'El cheque recibido solo se usa en cobros a clientes.';
  if (raw.includes('CHECK_NO_ACCOUNT')) return 'Un cobro con cheque no entra a una cuenta. La plata entra al acreditar.';
  if (raw.includes('CHECK_NOT_IN_PORTFOLIO')) {
    const spanish = raw.split(':').slice(1).join(':').trim();
    return spanish && /cheque/i.test(spanish)
      ? spanish
      : 'Ese cheque no está en cartera.';
  }
  if (raw.includes('CHECK_NOT_DEPOSITED')) return 'Solo se puede acreditar un cheque que está depositado.';
  if (raw.includes('CHECK_NOT_CURRENT')) {
    return 'Solo se puede depositar un cheque vigente: desde la fecha de cobro y hasta 30 días después.';
  }
  if (raw.includes('CHECK_ENDORSED')) return 'Ese cheque está endosado. Anulá el pago que lo endosó para que vuelva a cartera.';
  if (raw.includes('CHECK_ALREADY_REJECTED')) return 'Este cheque ya está rechazado.';
  if (raw.includes('CHECK_CANNOT_REJECT')) return 'Ese cheque no se puede rechazar.';
  if (raw.includes('CHECK_VOIDED')) return 'Este cheque está anulado.';
  if (raw.includes('CHECK_NOT_FOUND')) return 'No se encontró el cheque.';
  if (raw.includes('row-level security') || raw.includes('42501') || raw.includes('permission denied')) {
    return `${raw} — Aplicá la migración de valores (RLS off y GRANT sobre payment_values e issued_checks).`;
  }
  if (
    raw.includes('register_payment') ||
    raw.includes('void_payment') ||
    raw.includes('payment_values') ||
    raw.includes('issued_checks') ||
    raw.includes('debit_issued_check') ||
    raw.includes('reject_issued_check') ||
    raw.includes('received_checks') ||
    raw.includes('deposit_check') ||
    raw.includes('credit_check') ||
    raw.includes('reject_check') ||
    raw.includes('void_received_check') ||
    raw.includes('Could not find the table')
  ) {
    return `${raw} — Aplicá en el SQL Editor la migración de valores y cheques propios (20261111_payment_values.sql).`;
  }
  return getTreasuryRpcErrorMessage(err);
}
