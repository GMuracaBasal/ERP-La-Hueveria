/** Códigos persistidos en payments.payment_method (sin cheque). */
export type PaymentMethodCode = 'efectivo' | 'transferencia' | 'tarjeta' | 'qr';

export const PAYMENT_METHOD_OPTIONS: { value: PaymentMethodCode; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'qr', label: 'QR' },
];

export function paymentMethodLabel(code: PaymentMethodCode | string): string {
  return PAYMENT_METHOD_OPTIONS.find((o) => o.value === code)?.label ?? code;
}

export function defaultPaymentConcept(
  type: 'cobro' | 'pago',
  method: PaymentMethodCode,
): string {
  const label = paymentMethodLabel(method);
  return type === 'cobro' ? `Cobro - ${label}` : `Pago - ${label}`;
}
