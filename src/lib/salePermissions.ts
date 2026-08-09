import { isToday, parseISO } from 'date-fns';
import { Sale, User } from '../types';

export const PERMISSION_DENIED_MSG =
  'Solo un administrador puede modificar ventas de cajas ya cerradas.';

/** Venta al contado (venta + cobro en el mismo acto). */
export function isContadoSale(sale: Sale): boolean {
  return sale.condition === 'contado';
}

/** Venta en cuenta corriente (solo Debe, sin cobro ni caja). */
export function isCuentaCorrienteSale(sale: Sale): boolean {
  return sale.condition === 'cuenta_corriente';
}

/**
 * Ventas editables/anulables vía ticket en esta etapa:
 * Contado (mostrador o mayorista). CC se puede anular pero no editar.
 */
export function isEditableSale(sale: Sale): boolean {
  return isContadoSale(sale);
}

/** @deprecated Usar isContadoSale / isEditableSale */
export function isMostradorContadoSale(sale: Sale): boolean {
  return isContadoSale(sale);
}

export function canModifySale(user: User | null | undefined, sale: Sale): boolean {
  if (!user || sale.voided) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'vendedor') return isToday(parseISO(sale.date));
  return false;
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

export function getSaleRpcErrorMessage(err: unknown): string {
  const msg = extractErrorMessage(err);
  if (msg.includes('PERMISSION_DENIED')) return PERMISSION_DENIED_MSG;
  if (msg.includes('SALE_ALREADY_VOIDED')) return 'Esta venta ya fue anulada.';
  if (msg.includes('REASON_REQUIRED')) return 'Debés indicar un motivo.';
  if (msg.includes('NOT_CONTADO_SALE') || msg.includes('NOT_MOSTRADOR_SALE')) {
    return 'Las ventas en Cuenta Corriente no pueden editarse. Podés anularlas.';
  }
  if (msg.includes('CUSTOMER_REQUIRED')) {
    return 'Debés seleccionar un cliente.';
  }
  if (msg.includes('PAYMENT_REQUIRED')) {
    return 'Debés indicar el medio de pago del cobro.';
  }
  if (msg.includes('INSUFFICIENT_STOCK')) {
    return 'Stock insuficiente para uno o más productos.';
  }
  if (msg.includes('INVALID_ITEMS') || msg.includes('ITEMS_REQUIRED')) {
    return 'Agregá al menos un producto válido.';
  }
  if (msg.includes('voided') && msg.includes('does not exist')) {
    return 'Falta aplicar la migración de Supabase (columna voided). Contactá al administrador.';
  }
  if (msg.includes('point_of_sale') || msg.includes('condition')) {
    return 'Falta aplicar la migración de Supabase (point_of_sale / condition). Contactá al administrador.';
  }
  if (msg.includes('PGRST202') || msg.includes('Could not find the function')) {
    return 'No se pudo completar la operación. Intentá de nuevo.';
  }
  return msg || 'No se pudo completar la operación. Intentá de nuevo.';
}
