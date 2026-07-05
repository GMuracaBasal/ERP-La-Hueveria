import { isToday, parseISO } from 'date-fns';
import { Sale, User } from '../types';

export const PERMISSION_DENIED_MSG =
  'Solo un administrador puede modificar ventas de cajas ya cerradas.';

/** Ventas al contado del mostrador — excluye Cuenta Corriente (fase 2). */
export function isMostradorContadoSale(sale: Sale): boolean {
  return sale.paymentMethod !== 'Cuenta Corriente';
}

export function canModifySale(user: User | null | undefined, sale: Sale): boolean {
  if (!user || sale.voided) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'vendedor') return isToday(parseISO(sale.date));
  return false;
}

export function getSaleRpcErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('PERMISSION_DENIED')) return PERMISSION_DENIED_MSG;
  if (msg.includes('SALE_ALREADY_VOIDED')) return 'Esta venta ya fue anulada.';
  if (msg.includes('REASON_REQUIRED')) return 'Debés indicar un motivo.';
  if (msg.includes('NOT_MOSTRADOR_SALE')) {
    return 'Las ventas en Cuenta Corriente no pueden modificarse en esta etapa.';
  }
  if (msg.includes('INSUFFICIENT_STOCK')) {
    return 'Stock insuficiente para uno o más productos.';
  }
  if (msg.includes('INVALID_ITEMS') || msg.includes('ITEMS_REQUIRED')) {
    return 'Agregá al menos un producto válido.';
  }
  return 'No se pudo completar la operación. Intentá de nuevo.';
}
