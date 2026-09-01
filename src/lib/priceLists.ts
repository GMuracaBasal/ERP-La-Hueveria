import type { PriceList } from '../types';

/** Lista marcada como default (mostrador / Consumidor Final). */
export function getDefaultPriceList(lists: PriceList[]): PriceList | null {
  return lists.find((l) => l.isDefault) ?? null;
}

/**
 * Lista a usar en una venta: la asignada al cliente, o la default.
 * Nunca inventa un precio; si no hay lista, devuelve null.
 */
export function resolvePriceList(
  lists: PriceList[],
  customerPriceListId?: string | null,
): PriceList | null {
  if (customerPriceListId) {
    const assigned = lists.find((l) => l.id === customerPriceListId);
    if (assigned) return assigned;
  }
  return getDefaultPriceList(lists);
}

/**
 * Precio del producto en la lista, o null si no está cargado.
 * Distingue “no está” de “está en 0”.
 */
export function getListedPrice(
  list: PriceList | null | undefined,
  productId: string,
): number | null {
  if (!list || !productId) return null;
  if (!Object.prototype.hasOwnProperty.call(list.prices, productId)) return null;
  const price = list.prices[productId];
  if (typeof price !== 'number' || !Number.isFinite(price)) return null;
  return price;
}

/** ¿Se puede vender este producto con esta lista? Ausente o ≤ 0 no. */
export function hasSellablePrice(
  list: PriceList | null | undefined,
  productId: string,
): boolean {
  const price = getListedPrice(list, productId);
  return price !== null && price > 0;
}

/** Quita entradas vacías / no numéricas. Un campo vacío no se guarda como 0. */
export function sanitizePrices(prices: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, price] of Object.entries(prices)) {
    if (typeof price === 'number' && Number.isFinite(price)) {
      out[id] = price;
    }
  }
  return out;
}

export function saleHasUnsellableItems(
  items: { productId: string; unitPrice: number }[],
  total: number,
): boolean {
  if (total <= 0) return true;
  return items.some((i) => !i.productId || i.unitPrice <= 0);
}
