import { isToday, parseISO } from 'date-fns';
import { Purchase, User } from '../types';

export const PURCHASE_PERMISSION_DENIED_MSG =
  'Solo un administrador puede modificar compras de días ya cerrados.';

export function canModifyPurchase(user: User | null | undefined, purchase: Purchase): boolean {
  if (!user || purchase.voided) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'vendedor') return isToday(parseISO(purchase.date));
  return false;
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

export function getPurchaseErrorMessage(err: unknown): string {
  const msg = extractErrorMessage(err);
  if (msg.includes('PERMISSION_DENIED')) return PURCHASE_PERMISSION_DENIED_MSG;
  if (msg.includes('PURCHASE_ALREADY_VOIDED') || msg.includes('SALE_ALREADY_VOIDED')) {
    return 'Esta compra ya fue anulada.';
  }
  if (msg.includes('REASON_REQUIRED')) return 'Debés indicar un motivo.';
  if (msg.includes('SUPPLIER_REQUIRED')) return 'Debés seleccionar un proveedor.';
  if (msg.includes('PAYMENT_REQUIRED')) return 'Debés indicar el medio de pago.';
  if (msg.includes('ACCOUNT_NOT_ARS')) {
    return 'Los cobros, pagos, ventas y compras solo pueden ir a cuentas en pesos.';
  }
  if (msg.includes('ACCOUNT_REQUIRED') || msg.includes('ACCOUNT_NOT_FOUND') || msg.includes('ACCOUNT_DISABLED')) {
    return 'Seleccioná la cuenta de tesorería (solo pesos).';
  }
  if (msg.includes('INSUFFICIENT_STOCK')) {
    return 'Stock insuficiente para revertir uno o más productos.';
  }
  if (msg.includes('INVALID_ITEMS') || msg.includes('ITEMS_REQUIRED')) {
    return 'Agregá al menos un producto válido.';
  }
  if (msg.includes('voided') && msg.includes('does not exist')) {
    return 'Falta aplicar la migración de Supabase (columna voided). Contactá al administrador.';
  }
  return msg || 'No se pudo completar la operación. Intentá de nuevo.';
}
