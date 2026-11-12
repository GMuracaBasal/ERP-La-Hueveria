import type { InventoryMovement, Product } from '../types';

/** Ventana fija. No es un período elegible: cobertura y rotación siempre dividen por estos días. */
export const INVENTORY_WINDOW_DAYS = 30;

export interface SaleLine {
  productId: string;
  quantity: number;
  subtotal: number;
}

/** Inicio del día local, 29 días atrás: hoy incluido son 30 días. */
export function inventoryWindowStart(now = new Date()): string {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - (INVENTORY_WINDOW_DAYS - 1));
  return start.toISOString();
}

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export interface ReplenishmentRow {
  product: Product;
  soldUnits: number;
  dailyAverage: number;
  /** Null cuando no hubo salidas: no se divide por cero. */
  coverageDays: number | null;
  valorized: number;
}

export interface RankedProduct {
  product: Product;
  units: number;
  billed: number;
  valorized: number;
}

export interface CategoryRow {
  category: string;
  products: number;
  units: number;
  valorized: number;
  /** Porcentaje del valorizado total, con un decimal. Las filas suman 100 cuando hay stock valorizado. */
  percent: number;
}

export interface AdjustmentRow {
  id: string;
  date: string;
  productName: string;
  sku: string;
  quantity: number;
  reason: string;
}

export interface InventorySnapshot {
  stockValue: number;
  lowStockCount: number;
  stockoutCount: number;
  activeProducts: number;
  replenishment: ReplenishmentRow[];
  entries: number;
  exits: number;
  net: number;
  bestSellers: RankedProduct[];
  idle: RankedProduct[];
  categories: CategoryRow[];
  adjustmentCount: number;
  adjustmentUnits: number;
  adjustmentValue: number;
  recentAdjustments: AdjustmentRow[];
}

function soldByProduct(movements: InventoryMovement[]): Map<string, number> {
  const sold = new Map<string, number>();
  for (const movement of movements) {
    if (movement.voided || movement.type !== 'salida') continue;
    sold.set(movement.productId, (sold.get(movement.productId) ?? 0) + movement.quantity);
  }
  return sold;
}

function billedByProduct(lines: SaleLine[]): Map<string, number> {
  const billed = new Map<string, number>();
  for (const line of lines) {
    billed.set(line.productId, roundMoney((billed.get(line.productId) ?? 0) + line.subtotal));
  }
  return billed;
}

function coverageDays(stock: number, soldUnits: number): number | null {
  const daily = soldUnits / INVENTORY_WINDOW_DAYS;
  if (daily <= 0) return null;
  if (stock <= 0) return 0;
  return stock / daily;
}

function needsReplenishment(product: Product): boolean {
  return product.stock <= 0 || product.stock <= product.minStock;
}

/** Reparte 100% en décimos para que la suma visible cierre. */
function percentShares(values: number[]): number[] {
  const total = values.reduce((acc, value) => acc + value, 0);
  if (total === 0) return values.map(() => 0);
  const tenths = values.map((value) => Math.round((value / total) * 1000));
  const drift = 1000 - tenths.reduce((acc, value) => acc + value, 0);
  if (drift !== 0 && tenths.length > 0) {
    let index = 0;
    for (let i = 1; i < tenths.length; i += 1) {
      if (Math.abs(tenths[i]) > Math.abs(tenths[index])) index = i;
    }
    tenths[index] += drift;
  }
  return tenths.map((value) => value / 10);
}

export function buildInventorySnapshot(
  products: Product[],
  movements: InventoryMovement[],
  saleLines: SaleLine[],
): InventorySnapshot {
  const active = movements.filter((movement) => !movement.voided);
  const sold = soldByProduct(active);
  const billed = billedByProduct(saleLines);
  const byId = new Map(products.map((product) => [product.id, product]));

  const stockValue = products.reduce(
    (acc, product) => roundMoney(acc + product.stock * product.costPrice),
    0,
  );

  const replenishment = products
    .filter(needsReplenishment)
    .map((product) => {
      const soldUnits = sold.get(product.id) ?? 0;
      return {
        product,
        soldUnits,
        dailyAverage: soldUnits / INVENTORY_WINDOW_DAYS,
        coverageDays: coverageDays(product.stock, soldUnits),
        valorized: roundMoney(product.stock * product.costPrice),
      };
    })
    .sort((a, b) => {
      const aDays = a.coverageDays ?? Number.POSITIVE_INFINITY;
      const bDays = b.coverageDays ?? Number.POSITIVE_INFINITY;
      if (aDays !== bDays) return aDays - bDays;
      if (a.product.stock !== b.product.stock) return a.product.stock - b.product.stock;
      return a.product.name.localeCompare(b.product.name, 'es');
    });

  let entries = 0;
  let exits = 0;
  for (const movement of active) {
    if (movement.type === 'entrada') entries += movement.quantity;
    else if (movement.type === 'salida') exits += movement.quantity;
  }

  const ranked = products.map((product) => ({
    product,
    units: sold.get(product.id) ?? 0,
    billed: billed.get(product.id) ?? 0,
    valorized: roundMoney(product.stock * product.costPrice),
  }));

  const bestSellers = ranked
    .filter((row) => row.units > 0)
    .sort((a, b) => b.units - a.units || b.billed - a.billed || a.product.name.localeCompare(b.product.name, 'es'))
    .slice(0, 10);

  const idle = ranked
    .filter((row) => row.units === 0)
    .sort((a, b) => b.valorized - a.valorized || a.product.name.localeCompare(b.product.name, 'es'));

  const grouped = new Map<string, { products: number; units: number; valorized: number }>();
  for (const product of products) {
    const category = product.category.trim() || 'Sin categoría';
    const current = grouped.get(category) ?? { products: 0, units: 0, valorized: 0 };
    current.products += 1;
    current.units += product.stock;
    current.valorized = roundMoney(current.valorized + product.stock * product.costPrice);
    grouped.set(category, current);
  }
  const categoryList = [...grouped.entries()]
    .map(([category, row]) => ({ category, ...row }))
    .sort((a, b) => b.valorized - a.valorized || a.category.localeCompare(b.category, 'es'));
  const shares = percentShares(categoryList.map((row) => row.valorized));
  const categories: CategoryRow[] = categoryList.map((row, index) => ({
    ...row,
    percent: shares[index] ?? 0,
  }));

  const adjustments = active
    .filter((movement) => movement.type === 'ajuste')
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  let adjustmentUnits = 0;
  let adjustmentValue = 0;
  for (const movement of adjustments) {
    adjustmentUnits += movement.quantity;
    const product = byId.get(movement.productId);
    adjustmentValue = roundMoney(adjustmentValue + movement.quantity * (product?.costPrice ?? 0));
  }

  return {
    stockValue,
    lowStockCount: products.filter((product) => product.minStock > 0 && product.stock > 0 && product.stock <= product.minStock).length,
    stockoutCount: products.filter((product) => product.stock <= 0).length,
    activeProducts: products.length,
    replenishment,
    entries,
    exits,
    net: entries - exits,
    bestSellers,
    idle,
    categories,
    adjustmentCount: adjustments.length,
    adjustmentUnits,
    adjustmentValue,
    recentAdjustments: adjustments.slice(0, 10).map((movement) => {
      const product = byId.get(movement.productId);
      return {
        id: movement.id,
        date: movement.date,
        productName: product?.name ?? 'Producto dado de baja',
        sku: product?.sku ?? '—',
        quantity: movement.quantity,
        reason: movement.reason?.trim() || '—',
      };
    }),
  };
}
