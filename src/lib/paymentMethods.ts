/** Códigos canónicos de medio de pago que entran o salen de una cuenta. El cheque recibido es aparte: no es plata hasta acreditar. */
export type PaymentMethodCode = 'efectivo' | 'transferencia' | 'tarjeta' | 'qr';

export const PAYMENT_METHOD_OPTIONS: { value: PaymentMethodCode; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'qr', label: 'QR' },
];

/** Cobro a cliente: los medios de siempre, más el cheque que queda en cartera. */
export const COLLECTION_PAYMENT_OPTIONS: { value: PaymentMethodCode | 'cheque'; label: string }[] = [
  ...PAYMENT_METHOD_OPTIONS,
  { value: 'cheque', label: 'Cheque' },
];

/** Medios del POS / Caja del día (mostrador). */
export const POS_PAYMENT_OPTIONS: { value: PaymentMethodCode; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'qr', label: 'QR' },
];

/** Medios de ventas mayoristas / compras al contado. */
export const TERMINAL_PAYMENT_OPTIONS = PAYMENT_METHOD_OPTIONS;

const LEGACY_TO_CODE: Record<string, PaymentMethodCode> = {
  Efectivo: 'efectivo',
  Transferencia: 'transferencia',
  'Tarjeta de Débito': 'tarjeta',
  'Tarjeta de Debito': 'tarjeta',
  'Tarjeta de Crédito': 'tarjeta',
  'Tarjeta de Credito': 'tarjeta',
  Tarjeta: 'tarjeta',
  QR: 'qr',
  'QR / Transferencia': 'qr',
  'qr / transferencia': 'qr',
};

export function isPaymentMethodCode(value: string | null | undefined): value is PaymentMethodCode {
  return value === 'efectivo' || value === 'transferencia' || value === 'tarjeta' || value === 'qr';
}

/**
 * Normaliza cualquier valor legado al código canónico.
 * Devuelve null si es vacío o el parche viejo "Cuenta Corriente".
 */
export function normalizePaymentMethod(
  value: string | null | undefined,
): PaymentMethodCode | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed === 'Cuenta Corriente' || trimmed.toLowerCase() === 'cuenta_corriente') {
    return null;
  }
  if (isPaymentMethodCode(trimmed)) return trimmed;
  const mapped = LEGACY_TO_CODE[trimmed] ?? LEGACY_TO_CODE[trimmed.toLowerCase()];
  return mapped ?? null;
}

export function paymentMethodLabel(code: PaymentMethodCode | string | null | undefined): string {
  if (code == null || code === '') return '—';
  if (code === 'cheque' || code === 'Cheque') return 'Cheque';
  const normalized = normalizePaymentMethod(code) ?? code;
  return PAYMENT_METHOD_OPTIONS.find((o) => o.value === normalized)?.label ?? String(normalized);
}

export function defaultPaymentConcept(
  type: 'cobro' | 'pago',
  method: PaymentMethodCode | 'cheque',
): string {
  const label = paymentMethodLabel(method);
  return type === 'cobro' ? `Cobro - ${label}` : `Pago - ${label}`;
}
