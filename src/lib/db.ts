import { supabase } from './supabase';
import { generateId } from './utils';
import {
  User, Product, PriceList, Supplier, Customer,
  Purchase, Sale, InventoryMovement, FinanceMovement, Settings,
  AccountMovement, PointOfSale, SaleCondition, PurchaseCondition,
  Payment, PaymentType,
} from '../types';
import { roundMoney } from './accountMovements';
import {
  defaultPaymentConcept,
  normalizePaymentMethod,
  type PaymentMethodCode,
} from './paymentMethods';

// ─── Helpers de mapeo (snake_case en DB ↔ camelCase en TS) ───────────

const mapProductFromDB = (r: any): Product => ({
  id: r.id, sku: r.sku, name: r.name, category: r.category,
  unit: r.unit, costPrice: Number(r.cost_price),
  stock: Number(r.stock), minStock: Number(r.min_stock),
});
const mapProductToDB = (p: Product) => ({
  id: p.id, sku: p.sku, name: p.name, category: p.category,
  unit: p.unit, cost_price: p.costPrice, stock: p.stock, min_stock: p.minStock,
});

const mapCustomerFromDB = (r: any): Customer => ({
  id: r.id, name: r.name, phone: r.phone, email: r.email,
  address: r.address, priceListId: r.price_list_id, notes: r.notes,
});
const mapCustomerToDB = (c: Customer) => ({
  id: c.id, name: c.name, phone: c.phone, email: c.email,
  address: c.address, price_list_id: c.priceListId, notes: c.notes,
});

const mapUserFromDB = (r: any): User => ({
  id: r.id, fullName: r.full_name, username: r.username,
  passwordHash: r.password_hash, role: r.role,
  email: r.email ?? null,
  active: r.active ?? true,
  modules: r.modules || [],
});
const mapUserToDB = (u: User) => ({
  id: u.id, full_name: u.fullName, username: u.username,
  password_hash: u.passwordHash, role: u.role,
  email: u.email || null,
  active: u.active,
  modules: u.modules,
});

const mapInventoryFromDB = (r: any): InventoryMovement => ({
  id: r.id, date: r.date, productId: r.product_id, type: r.type,
  quantity: Number(r.quantity), referenceId: r.reference_id, reason: r.reason,
  voided: r.voided ?? false,
});
const mapInventoryToDB = (m: InventoryMovement) => ({
  id: m.id, date: m.date, product_id: m.productId, type: m.type,
  quantity: m.quantity, reference_id: m.referenceId, reason: m.reason,
  voided: m.voided ?? false,
});

const mapFinanceFromDB = (r: any): FinanceMovement => ({
  id: r.id, date: r.date, type: r.type, concept: r.concept,
  paymentMethod: normalizePaymentMethod(r.payment_method) ?? r.payment_method ?? undefined,
  amount: Number(r.amount), referenceId: r.reference_id,
  voided: r.voided ?? false,
});
const mapFinanceToDB = (m: FinanceMovement) => ({
  id: m.id, date: m.date, type: m.type, concept: m.concept,
  payment_method: normalizePaymentMethod(m.paymentMethod) ?? m.paymentMethod ?? null,
  amount: m.amount, reference_id: m.referenceId,
  voided: m.voided ?? false,
});

const mapSupplierToDB = (s: Supplier) => ({ ...s });

const mapAccountMovementFromDB = (r: any): AccountMovement => ({
  id: r.id,
  date: r.date,
  customerId: r.customer_id ?? null,
  supplierId: r.supplier_id ?? null,
  concept: r.concept,
  debe: Number(r.debe),
  haber: Number(r.haber),
  referenceType: r.reference_type,
  referenceId: r.reference_id ?? null,
  createdBy: r.created_by ?? null,
  createdAt: r.created_at,
  voided: r.voided ?? false,
  voidedAt: r.voided_at ?? null,
  voidedBy: r.voided_by ?? null,
});

const mapAccountMovementToDB = (m: AccountMovement) => ({
  id: m.id,
  date: m.date,
  customer_id: m.customerId,
  supplier_id: m.supplierId,
  concept: m.concept,
  debe: m.debe,
  haber: m.haber,
  reference_type: m.referenceType,
  reference_id: m.referenceId,
  created_by: m.createdBy,
  created_at: m.createdAt,
  voided: m.voided,
  voided_at: m.voidedAt,
  voided_by: m.voidedBy,
});

/** Orden estable del saldo corrido: date → created_at → id. */
function orderAccountMovements(a: AccountMovement, b: AccountMovement): number {
  const byDate = a.date.localeCompare(b.date);
  if (byDate !== 0) return byDate;
  const byCreated = a.createdAt.localeCompare(b.createdAt);
  if (byCreated !== 0) return byCreated;
  return a.id.localeCompare(b.id);
}

// ─── CRUD genérico (entidades simples sin tablas hijas) ──────────────

function simpleCRUD<T extends { id: string }>(
  table: string,
  fromDB: (r: any) => T = (r) => r as T,
  toDB: (i: T) => any = (i) => i,
) {
  return {
    async getAll(): Promise<T[]> {
      const { data, error } = await supabase.from(table).select('*');
      if (error) throw error;
      return (data ?? []).map(fromDB);
    },
    async getById(id: string): Promise<T | undefined> {
      const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? fromDB(data) : undefined;
    },
    async save(item: T): Promise<void> {
      const { error } = await supabase.from(table).upsert(toDB(item));
      if (error) throw error;
    },
    async delete(id: string): Promise<void> {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
    },
  };
}

export const usersDB     = simpleCRUD<User>('users', mapUserFromDB, mapUserToDB);
export const productsDB  = simpleCRUD<Product>('products', mapProductFromDB, mapProductToDB);
export const suppliersDB = simpleCRUD<Supplier>('suppliers', undefined, mapSupplierToDB);
export const customersDB = simpleCRUD<Customer>('customers', mapCustomerFromDB, mapCustomerToDB);
export const inventoryDB = {
  ...simpleCRUD<InventoryMovement>('inventory_movements', mapInventoryFromDB, mapInventoryToDB),
  async getAll(): Promise<InventoryMovement[]> {
    const { data, error } = await supabase.from('inventory_movements').select('*').eq('voided', false);
    if (error) throw error;
    return (data ?? []).map(mapInventoryFromDB);
  },
};

export const financeDB = {
  ...simpleCRUD<FinanceMovement>('finance_movements', mapFinanceFromDB, mapFinanceToDB),
  async getAll(): Promise<FinanceMovement[]> {
    const { data, error } = await supabase.from('finance_movements').select('*').eq('voided', false);
    if (error) throw error;
    return (data ?? []).map(mapFinanceFromDB);
  },
};

// ─── Listas de precios (reconstruye el objeto `prices` desde la tabla hija) ──

export const priceListsDB = {
  async getAll(): Promise<PriceList[]> {
    const { data: lists, error } = await supabase.from('price_lists').select('*');
    if (error) throw error;
    const { data: items, error: e2 } = await supabase.from('price_list_items').select('*');
    if (e2) throw e2;

    return (lists ?? []).map((l) => {
      const prices: Record<string, number> = {};
      (items ?? [])
        .filter((it) => it.price_list_id === l.id)
        .forEach((it) => { prices[it.product_id] = Number(it.price); });
      return { id: l.id, name: l.name, isDefault: l.is_default, prices };
    });
  },

  async getById(id: string): Promise<PriceList | undefined> {
    const all = await this.getAll();
    return all.find((l) => l.id === id);
  },

  async save(list: PriceList): Promise<void> {
    const { error } = await supabase.from('price_lists').upsert({
      id: list.id, name: list.name, is_default: list.isDefault,
    });
    if (error) throw error;

    await supabase.from('price_list_items').delete().eq('price_list_id', list.id);
    const rows = Object.entries(list.prices).map(([productId, price]) => ({
      price_list_id: list.id, product_id: productId, price,
    }));
    if (rows.length > 0) {
      const { error: e2 } = await supabase.from('price_list_items').insert(rows);
      if (e2) throw e2;
    }
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('price_lists').delete().eq('id', id);
    if (error) throw error;
  },
};

// ─── Compras (con items en tabla hija) ───────────────────────────────

function inferPurchaseCondition(p: any): PurchaseCondition {
  if (p.condition === 'contado' || p.condition === 'cuenta_corriente') {
    return p.condition;
  }
  return 'contado';
}

const mapPurchaseFromDB = (p: any): Purchase => {
  const condition = inferPurchaseCondition(p);
  const paymentMethod =
    condition === 'cuenta_corriente'
      ? null
      : normalizePaymentMethod(p.payment_method);

  return {
    id: p.id,
    date: p.date,
    supplierId: p.supplier_id,
    invoiceNumber: p.invoice_number ?? '',
    notes: p.notes ?? '',
    condition,
    paymentMethod,
    total: Number(p.total),
    voided: p.voided ?? false,
    voidedAt: p.voided_at ?? null,
    voidedBy: p.voided_by ?? null,
    items: (p.purchase_items ?? []).map((it: any) => ({
      productId: it.product_id,
      quantity: Number(it.quantity),
      unitCost: Number(it.unit_cost),
      subtotal: Number(it.subtotal),
    })),
  };
};

function purchaseConcept(purchaseId: string, supplierName?: string, invoiceNumber?: string): string {
  const short = purchaseId.slice(0, 6).toUpperCase();
  const inv = invoiceNumber?.trim();
  if (inv && supplierName) return `Compra #${short} — ${supplierName} (${inv})`;
  if (supplierName) return `Compra #${short} — ${supplierName}`;
  if (inv) return `Compra #${short} (REF: ${inv})`;
  return `Compra #${short}`;
}

async function insertPurchaseAuditLog(entry: {
  purchaseId: string;
  action: 'edit' | 'void';
  reason: string;
  performedBy: string;
  snapshot?: unknown;
}): Promise<void> {
  const { error } = await supabase.from('purchase_audit_log').insert({
    purchase_id: entry.purchaseId,
    action: entry.action,
    reason: entry.reason.trim(),
    performed_by: entry.performedBy,
    snapshot: entry.snapshot ?? null,
  });
  if (error) {
    if (error.code === 'PGRST205' || error.message?.includes('purchase_audit_log')) return;
    throw error;
  }
}

async function markPurchaseVoided(purchaseId: string, userId: string): Promise<void> {
  const payload = {
    voided: true,
    voided_at: new Date().toISOString(),
    voided_by: userId,
  };
  let { error } = await supabase.from('purchases').update(payload).eq('id', purchaseId);
  if (error?.message?.includes('voided_at') || error?.message?.includes('voided_by')) {
    ({ error } = await supabase.from('purchases').update({ voided: true }).eq('id', purchaseId));
  }
  if (error) throw error;
}

async function applyPurchaseStockAndInventory(
  purchase: Purchase,
  supplierName?: string,
): Promise<void> {
  for (const item of purchase.items) {
    const prod = await productsDB.getById(item.productId);
    if (!prod) throw new Error('PRODUCT_NOT_FOUND');

    await productsDB.save({
      ...prod,
      stock: prod.stock + item.quantity,
      costPrice: item.unitCost,
    });
    await inventoryDB.save({
      id: generateId(),
      date: purchase.date,
      productId: prod.id,
      type: 'entrada',
      quantity: item.quantity,
      referenceId: purchase.id,
      reason: supplierName ? `Compra a ${supplierName}` : 'Compra a proveedor',
    });
  }
}

async function insertPurchaseAccountHaber(params: {
  purchaseId: string;
  supplierId: string;
  date: string;
  total: number;
  concept: string;
  createdBy: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from('account_movements').insert({
    id: generateId(),
    date: params.date,
    customer_id: null,
    supplier_id: params.supplierId,
    concept: params.concept,
    debe: 0,
    haber: roundMoney(params.total),
    reference_type: 'compra',
    reference_id: params.purchaseId,
    created_by: params.createdBy,
    created_at: now,
    voided: false,
  });
  if (error) throw error;
}

/** Compra Contado: Haber (deuda) + Debe (pago) = saldo neto 0 en proveedor. */
async function insertPurchaseAccountDebePago(params: {
  purchaseId: string;
  supplierId: string;
  date: string;
  total: number;
  createdBy: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from('account_movements').insert({
    id: generateId(),
    date: params.date,
    customer_id: null,
    supplier_id: params.supplierId,
    concept: `Pago compra #${params.purchaseId.slice(0, 6).toUpperCase()}`,
    debe: roundMoney(params.total),
    haber: 0,
    reference_type: 'pago',
    reference_id: params.purchaseId,
    created_by: params.createdBy,
    created_at: now,
    voided: false,
  });
  if (error) throw error;
}

export const purchasesDB = {
  async getAll(options?: { includeVoided?: boolean }): Promise<Purchase[]> {
    let query = supabase.from('purchases').select('*, purchase_items(*)');
    if (!options?.includeVoided) {
      query = query.eq('voided', false);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapPurchaseFromDB);
  },

  async getById(id: string, includeVoided = false): Promise<Purchase | undefined> {
    let query = supabase.from('purchases').select('*, purchase_items(*)').eq('id', id);
    if (!includeVoided) query = query.eq('voided', false);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data ? mapPurchaseFromDB(data) : undefined;
  },

  async save(purchase: Purchase): Promise<void> {
    const condition: PurchaseCondition =
      purchase.condition === 'cuenta_corriente' ? 'cuenta_corriente' : 'contado';
    const paymentMethod =
      condition === 'cuenta_corriente'
        ? null
        : normalizePaymentMethod(purchase.paymentMethod);

    const { error } = await supabase.from('purchases').upsert({
      id: purchase.id,
      date: purchase.date,
      supplier_id: purchase.supplierId,
      invoice_number: purchase.invoiceNumber,
      notes: purchase.notes,
      condition,
      payment_method: paymentMethod,
      total: purchase.total,
      voided: purchase.voided ?? false,
    });
    if (error) throw error;

    await supabase.from('purchase_items').delete().eq('purchase_id', purchase.id);
    const rows = purchase.items.map((it) => ({
      purchase_id: purchase.id,
      product_id: it.productId,
      quantity: it.quantity,
      unit_cost: it.unitCost,
      subtotal: it.subtotal,
    }));
    if (rows.length > 0) {
      const { error: e2 } = await supabase.from('purchase_items').insert(rows);
      if (e2) throw e2;
    }
  },

  /**
   * Siempre: stock + Haber (deuda proveedor).
   * Contado: + Debe/pago + egreso en caja.
   * CC: sin Debe ni egreso (queda saldo).
   */
  async createPurchase(params: {
    purchase: Purchase;
    userId: string;
    supplierName?: string;
  }): Promise<void> {
    const { purchase, userId, supplierName } = params;
    if (!purchase.supplierId) throw new Error('SUPPLIER_REQUIRED');
    if (!purchase.items.length || purchase.items.some((i) => !i.productId || i.quantity <= 0)) {
      throw new Error('INVALID_ITEMS');
    }

    const condition: PurchaseCondition =
      purchase.condition === 'cuenta_corriente' ? 'cuenta_corriente' : 'contado';
    if (condition === 'contado' && !normalizePaymentMethod(purchase.paymentMethod)) {
      throw new Error('PAYMENT_REQUIRED');
    }

    const total = roundMoney(purchase.items.reduce((acc, i) => acc + i.subtotal, 0));
    const normalized: Purchase = {
      ...purchase,
      total,
      condition,
      paymentMethod: condition === 'cuenta_corriente'
        ? null
        : normalizePaymentMethod(purchase.paymentMethod),
      voided: false,
    };
    const concept = purchaseConcept(
      normalized.id,
      supplierName,
      normalized.invoiceNumber,
    );

    await this.save(normalized);
    await applyPurchaseStockAndInventory(normalized, supplierName);

    await insertPurchaseAccountHaber({
      purchaseId: normalized.id,
      supplierId: normalized.supplierId,
      date: normalized.date,
      total: normalized.total,
      concept,
      createdBy: userId,
    });

    if (normalized.condition === 'contado') {
      await insertPurchaseAccountDebePago({
        purchaseId: normalized.id,
        supplierId: normalized.supplierId,
        date: normalized.date,
        total: normalized.total,
        createdBy: userId,
      });
      await financeDB.save({
        id: generateId(),
        date: normalized.date,
        type: 'egreso',
        concept,
        amount: normalized.total,
        paymentMethod: normalized.paymentMethod ?? undefined,
        referenceId: normalized.id,
      });
    }
  },

  /** @deprecated Usar voidPurchase */
  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('purchases').update({ voided: true }).eq('id', id);
    if (error) throw error;
  },

  async voidPurchase(purchaseId: string, userId: string, reason: string): Promise<void> {
    if (!reason.trim()) throw new Error('REASON_REQUIRED');

    const purchase = await this.getById(purchaseId, true);
    if (!purchase) throw new Error('PURCHASE_NOT_FOUND');
    if (purchase.voided) throw new Error('PURCHASE_ALREADY_VOIDED');

    const snapshot = { purchase, items: purchase.items };

    await voidInventoryMovementsForSale(purchaseId);
    await voidFinanceMovementsForSale(purchaseId);
    await voidAccountMovementsForSale(purchaseId, userId);
    await markPurchaseVoided(purchaseId, userId);
    await insertPurchaseAuditLog({
      purchaseId,
      action: 'void',
      reason,
      performedBy: userId,
      snapshot,
    });
  },

  async editPurchase(
    purchaseId: string,
    userId: string,
    reason: string,
    data: Pick<
      Purchase,
      'supplierId' | 'invoiceNumber' | 'notes' | 'date' | 'items' | 'condition' | 'paymentMethod'
    > & {
      supplierName?: string;
    },
  ): Promise<void> {
    if (!reason.trim()) throw new Error('REASON_REQUIRED');
    if (!data.supplierId) throw new Error('SUPPLIER_REQUIRED');
    if (!data.items.length || data.items.some((i) => !i.productId || i.quantity <= 0)) {
      throw new Error('INVALID_ITEMS');
    }

    const nextCondition: PurchaseCondition =
      data.condition === 'cuenta_corriente' ? 'cuenta_corriente' : 'contado';
    if (nextCondition === 'contado' && !normalizePaymentMethod(data.paymentMethod)) {
      throw new Error('PAYMENT_REQUIRED');
    }

    const existing = await this.getById(purchaseId);
    if (!existing) throw new Error('PURCHASE_NOT_FOUND');
    if (existing.voided) throw new Error('PURCHASE_ALREADY_VOIDED');

    const snapshot = { purchase: existing, items: existing.items };

    const preservedConcept = await voidFinanceMovementsForSale(purchaseId);
    await voidInventoryMovementsForSale(purchaseId);
    await voidAccountMovementsForSale(purchaseId, userId);

    const total = roundMoney(data.items.reduce((acc, i) => acc + i.subtotal, 0));
    const updated: Purchase = {
      ...existing,
      supplierId: data.supplierId,
      invoiceNumber: data.invoiceNumber,
      notes: data.notes,
      date: data.date,
      items: data.items,
      total,
      condition: nextCondition,
      paymentMethod:
        nextCondition === 'cuenta_corriente'
          ? null
          : normalizePaymentMethod(data.paymentMethod),
    };

    const { error: headerErr } = await supabase.from('purchases').update({
      supplier_id: updated.supplierId,
      invoice_number: updated.invoiceNumber,
      notes: updated.notes,
      total: updated.total,
      date: updated.date,
      condition: updated.condition,
      payment_method: updated.paymentMethod,
    }).eq('id', purchaseId);
    if (headerErr) throw headerErr;

    await supabase.from('purchase_items').delete().eq('purchase_id', purchaseId);
    const itemRows = data.items.map((it) => ({
      purchase_id: purchaseId,
      product_id: it.productId,
      quantity: it.quantity,
      unit_cost: it.unitCost,
      subtotal: it.subtotal,
    }));
    if (itemRows.length > 0) {
      const { error: itemsErr } = await supabase.from('purchase_items').insert(itemRows);
      if (itemsErr) throw itemsErr;
    }

    await applyPurchaseStockAndInventory(updated, data.supplierName);

    const concept =
      preservedConcept ??
      purchaseConcept(purchaseId, data.supplierName, updated.invoiceNumber);

    // Siempre Haber (deuda). Contado agrega Debe + egreso.
    await insertPurchaseAccountHaber({
      purchaseId,
      supplierId: updated.supplierId,
      date: updated.date,
      total: updated.total,
      concept,
      createdBy: userId,
    });

    if (updated.condition === 'contado') {
      await insertPurchaseAccountDebePago({
        purchaseId,
        supplierId: updated.supplierId,
        date: updated.date,
        total: updated.total,
        createdBy: userId,
      });
      await financeDB.save({
        id: generateId(),
        date: updated.date,
        type: 'egreso',
        concept,
        amount: updated.total,
        paymentMethod: updated.paymentMethod ?? undefined,
        referenceId: purchaseId,
      });
    }

    await insertPurchaseAuditLog({
      purchaseId,
      action: 'edit',
      reason,
      performedBy: userId,
      snapshot,
    });
  },
};

// ─── Ventas (con items en tabla hija) ────────────────────────────────

function inferPointOfSale(s: any): PointOfSale {
  if (s.point_of_sale === 'mostrador' || s.point_of_sale === 'mayorista') {
    return s.point_of_sale;
  }
  return s.customer_id ? 'mayorista' : 'mostrador';
}

function inferCondition(s: any): SaleCondition {
  if (s.condition === 'contado' || s.condition === 'cuenta_corriente') {
    return s.condition;
  }
  return s.payment_method === 'Cuenta Corriente' ? 'cuenta_corriente' : 'contado';
}

const mapSaleFromDB = (s: any): Sale => {
  const condition = inferCondition(s);
  const paymentMethod =
    condition === 'cuenta_corriente' || s.payment_method === 'Cuenta Corriente'
      ? null
      : normalizePaymentMethod(s.payment_method);

  return {
    id: s.id,
    date: s.date,
    customerId: s.customer_id ?? null,
    pointOfSale: inferPointOfSale(s),
    condition,
    paymentMethod,
    total: Number(s.total),
    voided: s.voided ?? false,
    voidedAt: s.voided_at ?? null,
    voidedBy: s.voided_by ?? null,
    items: (s.sale_items ?? []).map((it: any) => ({
      productId: it.product_id,
      quantity: Number(it.quantity),
      unitPrice: Number(it.unit_price),
      subtotal: Number(it.subtotal),
    })),
  };
};

function saleConcept(sale: Pick<Sale, 'id' | 'pointOfSale'>, customerName?: string): string {
  const short = sale.id.slice(0, 6).toUpperCase();
  if (sale.pointOfSale === 'mostrador') {
    return `Venta POS #${short}`;
  }
  return customerName
    ? `Venta #${short} — ${customerName}`
    : `Venta #${short}`;
}

function cobroConcept(saleId: string): string {
  return `Cobro venta #${saleId.slice(0, 6).toUpperCase()}`;
}

async function voidAccountMovementsForSale(saleId: string, voidedBy: string): Promise<void> {
  const { error } = await supabase
    .from('account_movements')
    .update({
      voided: true,
      voided_at: new Date().toISOString(),
      voided_by: voidedBy,
    })
    .eq('reference_id', saleId)
    .eq('voided', false);
  if (error) throw error;
}

async function insertSaleAccountDebe(params: {
  saleId: string;
  customerId: string;
  date: string;
  total: number;
  concept: string;
  createdBy: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from('account_movements').insert({
    id: generateId(),
    date: params.date,
    customer_id: params.customerId,
    supplier_id: null,
    concept: params.concept,
    debe: roundMoney(params.total),
    haber: 0,
    reference_type: 'venta',
    reference_id: params.saleId,
    created_by: params.createdBy,
    created_at: now,
    voided: false,
  });
  if (error) throw error;
}

async function insertSaleAccountHaber(params: {
  saleId: string;
  customerId: string;
  date: string;
  total: number;
  createdBy: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from('account_movements').insert({
    id: generateId(),
    date: params.date,
    customer_id: params.customerId,
    supplier_id: null,
    concept: cobroConcept(params.saleId),
    debe: 0,
    haber: roundMoney(params.total),
    reference_type: 'cobro',
    reference_id: params.saleId,
    created_by: params.createdBy,
    created_at: now,
    voided: false,
  });
  if (error) throw error;
}

async function applySaleStockAndInventory(sale: Sale, customerName?: string): Promise<void> {
  for (const item of sale.items) {
    const prod = await productsDB.getById(item.productId);
    if (!prod) throw new Error('PRODUCT_NOT_FOUND');
    if (prod.stock < item.quantity) throw new Error('INSUFFICIENT_STOCK');

    await productsDB.save({ ...prod, stock: prod.stock - item.quantity });
    await inventoryDB.save({
      id: generateId(),
      date: sale.date,
      productId: prod.id,
      type: 'salida',
      quantity: item.quantity,
      referenceId: sale.id,
      reason: sale.pointOfSale === 'mostrador'
        ? 'Venta POS - Consumidor Final'
        : `Venta a ${customerName || 'cliente'}`,
    });
  }
}

async function voidInventoryMovementsForSale(saleId: string): Promise<void> {
  const { data, error } = await supabase
    .from('inventory_movements')
    .select('*')
    .eq('reference_id', saleId)
    .eq('voided', false);
  if (error) throw error;

  for (const mov of data ?? []) {
    const prod = await productsDB.getById(mov.product_id);
    if (prod) {
      const delta = mov.type === 'salida' ? Number(mov.quantity) : mov.type === 'entrada' ? -Number(mov.quantity) : 0;
      if (delta !== 0) {
        await productsDB.save({ ...prod, stock: prod.stock + delta });
      }
    }
    const { error: uErr } = await supabase
      .from('inventory_movements')
      .update({ voided: true })
      .eq('id', mov.id);
    if (uErr) throw uErr;
  }
}

async function voidFinanceMovementsForSale(saleId: string): Promise<string | null> {
  const { data: activeRows, error: selErr } = await supabase
    .from('finance_movements')
    .select('concept')
    .eq('reference_id', saleId)
    .eq('type', 'ingreso')
    .eq('voided', false)
    .order('date', { ascending: false })
    .limit(1);
  if (selErr) throw selErr;

  const concept = activeRows?.[0]?.concept ?? null;

  const { error } = await supabase
    .from('finance_movements')
    .update({ voided: true })
    .eq('reference_id', saleId)
    .eq('voided', false);
  if (error) throw error;

  return concept;
}

async function insertSaleAuditLog(entry: {
  saleId: string;
  action: 'edit' | 'void';
  reason: string;
  performedBy: string;
  snapshot?: unknown;
}): Promise<void> {
  const { error } = await supabase.from('sale_audit_log').insert({
    sale_id: entry.saleId,
    action: entry.action,
    reason: entry.reason.trim(),
    performed_by: entry.performedBy,
    snapshot: entry.snapshot ?? null,
  });
  if (error) {
    // Tabla de auditoría opcional si la migración aún no corrió
    if (error.code === 'PGRST205' || error.message?.includes('sale_audit_log')) return;
    throw error;
  }
}

async function markSaleVoided(saleId: string, userId: string): Promise<void> {
  const payload = {
    voided: true,
    voided_at: new Date().toISOString(),
    voided_by: userId,
  };
  let { error } = await supabase.from('sales').update(payload).eq('id', saleId);
  if (error?.message?.includes('voided_at') || error?.message?.includes('voided_by')) {
    ({ error } = await supabase.from('sales').update({ voided: true }).eq('id', saleId));
  }
  if (error) throw error;
}

export const salesDB = {
  async getAll(options?: { includeVoided?: boolean }): Promise<Sale[]> {
    let query = supabase.from('sales').select('*, sale_items(*)');
    if (!options?.includeVoided) {
      query = query.eq('voided', false);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapSaleFromDB);
  },

  async getById(id: string, includeVoided = false): Promise<Sale | undefined> {
    let query = supabase.from('sales').select('*, sale_items(*)').eq('id', id);
    if (!includeVoided) query = query.eq('voided', false);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data ? mapSaleFromDB(data) : undefined;
  },

  async save(sale: Sale): Promise<void> {
    const condition: SaleCondition =
      sale.condition === 'cuenta_corriente' ? 'cuenta_corriente' : 'contado';
    const paymentMethod =
      condition === 'cuenta_corriente' ? null : normalizePaymentMethod(sale.paymentMethod);

    const { error } = await supabase.from('sales').upsert({
      id: sale.id,
      date: sale.date,
      customer_id: sale.customerId,
      point_of_sale: sale.pointOfSale,
      condition,
      payment_method: paymentMethod,
      total: sale.total,
      voided: sale.voided ?? false,
    });
    if (error) throw error;

    await supabase.from('sale_items').delete().eq('sale_id', sale.id);
    const rows = sale.items.map((it) => ({
      sale_id: sale.id, product_id: it.productId,
      quantity: it.quantity, unit_price: it.unitPrice, subtotal: it.subtotal,
    }));
    if (rows.length > 0) {
      const { error: e2 } = await supabase.from('sale_items').insert(rows);
      if (e2) throw e2;
    }
  },

  /**
   * Crea una venta completa (cabecera + ítems + stock + CC + caja si Contado).
   * Orden fijo; fallar a mitad puede dejar parcial — aplicar migración y revisar
   * si se necesita RPC atómica en un paso posterior.
   */
  async createSale(params: {
    sale: Sale;
    userId: string;
    customerName?: string;
  }): Promise<void> {
    const { sale, userId, customerName } = params;

    if (!sale.customerId) throw new Error('CUSTOMER_REQUIRED');
    if (!sale.items.length || sale.items.some((i) => !i.productId || i.quantity <= 0)) {
      throw new Error('INVALID_ITEMS');
    }
    const condition: SaleCondition =
      sale.condition === 'cuenta_corriente' ? 'cuenta_corriente' : 'contado';
    if (condition === 'contado' && !normalizePaymentMethod(sale.paymentMethod)) {
      throw new Error('PAYMENT_REQUIRED');
    }

    const total = roundMoney(sale.items.reduce((acc, i) => acc + i.subtotal, 0));
    const normalized: Sale = {
      ...sale,
      total,
      condition,
      paymentMethod:
        condition === 'cuenta_corriente' ? null : normalizePaymentMethod(sale.paymentMethod),
      voided: false,
    };

    for (const item of normalized.items) {
      const prod = await productsDB.getById(item.productId);
      if (!prod || prod.stock < item.quantity) throw new Error('INSUFFICIENT_STOCK');
    }

    await this.save(normalized);
    await applySaleStockAndInventory(normalized, customerName);

    const concept = saleConcept(normalized, customerName);
    await insertSaleAccountDebe({
      saleId: normalized.id,
      customerId: normalized.customerId!,
      date: normalized.date,
      total: normalized.total,
      concept,
      createdBy: userId,
    });

    if (normalized.condition === 'contado') {
      await insertSaleAccountHaber({
        saleId: normalized.id,
        customerId: normalized.customerId!,
        date: normalized.date,
        total: normalized.total,
        createdBy: userId,
      });
      await financeDB.save({
        id: generateId(),
        date: normalized.date,
        type: 'ingreso',
        concept,
        amount: normalized.total,
        paymentMethod: normalized.paymentMethod ?? undefined,
        referenceId: normalized.id,
      });
    }
  },

  /** @deprecated Usar voidSale() — anula solo la fila sin revertir stock/finanzas */
  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('sales').update({ voided: true }).eq('id', id);
    if (error) throw error;
  },

  async voidSale(saleId: string, userId: string, reason: string): Promise<void> {
    if (!reason.trim()) throw new Error('REASON_REQUIRED');

    const sale = await this.getById(saleId, true);
    if (!sale) throw new Error('SALE_NOT_FOUND');
    if (sale.voided) throw new Error('SALE_ALREADY_VOIDED');

    const snapshot = { sale, items: sale.items };

    await voidInventoryMovementsForSale(saleId);
    await voidFinanceMovementsForSale(saleId);
    await voidAccountMovementsForSale(saleId, userId);
    await markSaleVoided(saleId, userId);
    await insertSaleAuditLog({
      saleId,
      action: 'void',
      reason,
      performedBy: userId,
      snapshot,
    });
  },

  async editSale(
    saleId: string,
    userId: string,
    reason: string,
    sale: Pick<Sale, 'customerId' | 'paymentMethod' | 'date' | 'items' | 'condition'> & {
      customerName?: string;
    },
  ): Promise<void> {
    if (!reason.trim()) throw new Error('REASON_REQUIRED');
    if (!sale.items.length || sale.items.some((i) => !i.productId || i.quantity <= 0)) {
      throw new Error('INVALID_ITEMS');
    }
    if (!sale.customerId) throw new Error('CUSTOMER_REQUIRED');

    const nextCondition: SaleCondition = sale.condition === 'cuenta_corriente'
      ? 'cuenta_corriente'
      : 'contado';
    if (nextCondition === 'contado' && !normalizePaymentMethod(sale.paymentMethod)) {
      throw new Error('PAYMENT_REQUIRED');
    }

    const existing = await this.getById(saleId);
    if (!existing) throw new Error('SALE_NOT_FOUND');
    if (existing.voided) throw new Error('SALE_ALREADY_VOIDED');

    const snapshot = { sale: existing, items: existing.items };

    const preservedConcept = await voidFinanceMovementsForSale(saleId);
    await voidInventoryMovementsForSale(saleId);
    await voidAccountMovementsForSale(saleId, userId);

    for (const item of sale.items) {
      const prod = await productsDB.getById(item.productId);
      if (!prod || prod.stock < item.quantity) throw new Error('INSUFFICIENT_STOCK');
    }

    const total = roundMoney(sale.items.reduce((acc, i) => acc + i.subtotal, 0));
    const updated: Sale = {
      ...existing,
      customerId: sale.customerId,
      paymentMethod:
        nextCondition === 'cuenta_corriente'
          ? null
          : normalizePaymentMethod(sale.paymentMethod),
      date: sale.date,
      items: sale.items,
      total,
      condition: nextCondition,
    };

    const { error: headerErr } = await supabase.from('sales').update({
      customer_id: updated.customerId,
      payment_method: updated.paymentMethod,
      total: updated.total,
      date: updated.date,
      condition: updated.condition,
      point_of_sale: existing.pointOfSale,
    }).eq('id', saleId);
    if (headerErr) throw headerErr;

    await supabase.from('sale_items').delete().eq('sale_id', saleId);
    const itemRows = sale.items.map((it) => ({
      sale_id: saleId,
      product_id: it.productId,
      quantity: it.quantity,
      unit_price: it.unitPrice,
      subtotal: it.subtotal,
    }));
    if (itemRows.length > 0) {
      const { error: itemsErr } = await supabase.from('sale_items').insert(itemRows);
      if (itemsErr) throw itemsErr;
    }

    await applySaleStockAndInventory(updated, sale.customerName);

    const concept = preservedConcept ?? saleConcept(updated, sale.customerName);

    // Siempre Debe (la venta). Contado agrega Haber + ingreso en caja.
    await insertSaleAccountDebe({
      saleId,
      customerId: updated.customerId!,
      date: updated.date,
      total: updated.total,
      concept,
      createdBy: userId,
    });

    if (updated.condition === 'contado') {
      await insertSaleAccountHaber({
        saleId,
        customerId: updated.customerId!,
        date: updated.date,
        total: updated.total,
        createdBy: userId,
      });
      await financeDB.save({
        id: generateId(),
        date: updated.date,
        type: 'ingreso',
        concept,
        amount: updated.total,
        paymentMethod: updated.paymentMethod ?? undefined,
        referenceId: saleId,
      });
    }

    await insertSaleAuditLog({
      saleId,
      action: 'edit',
      reason,
      performedBy: userId,
      snapshot,
    });
  },
};

// ─── Cuentas corrientes (libro inmutable; corrección = anular + nuevo) ─

export const accountMovementsDB = {
  /** Movimientos del cliente (incluye anulados para el libro). */
  async getByCustomer(customerId: string): Promise<AccountMovement[]> {
    const { data, error } = await supabase
      .from('account_movements')
      .select('*')
      .eq('customer_id', customerId);
    if (error) throw error;
    return (data ?? []).map(mapAccountMovementFromDB).sort(orderAccountMovements);
  },

  /** Movimientos del proveedor (incluye anulados para el libro). */
  async getBySupplier(supplierId: string): Promise<AccountMovement[]> {
    const { data, error } = await supabase
      .from('account_movements')
      .select('*')
      .eq('supplier_id', supplierId);
    if (error) throw error;
    return (data ?? []).map(mapAccountMovementFromDB).sort(orderAccountMovements);
  },

  /** Solo vigentes (voided=false), para armar saldos de listados. */
  async getAllActive(): Promise<AccountMovement[]> {
    const { data, error } = await supabase
      .from('account_movements')
      .select('*')
      .eq('voided', false);
    if (error) throw error;
    return (data ?? []).map(mapAccountMovementFromDB).sort(orderAccountMovements);
  },

  /** Inserta un movimiento nuevo. Nunca actualizar debe/haber de uno existente. */
  async save(movement: AccountMovement): Promise<void> {
    const { error } = await supabase
      .from('account_movements')
      .insert(mapAccountMovementToDB(movement));
    if (error) throw error;
  },

  /** Anulación lógica: no borra ni edita debe/haber. */
  async void(id: string, voidedBy: string): Promise<void> {
    const { error } = await supabase
      .from('account_movements')
      .update({
        voided: true,
        voided_at: new Date().toISOString(),
        voided_by: voidedBy,
      })
      .eq('id', id)
      .eq('voided', false);
    if (error) throw error;
  },
};

// ─── Cobros / Pagos (CC + caja atómicos) ─────────────────────────────

const mapPaymentFromDB = (r: any): Payment => ({
  id: r.id,
  type: r.type,
  customerId: r.customer_id ?? null,
  supplierId: r.supplier_id ?? null,
  date: r.date,
  amount: Number(r.amount),
  paymentMethod: normalizePaymentMethod(r.payment_method) ?? r.payment_method,
  concept: r.concept ?? null,
  createdBy: r.created_by ?? null,
  createdAt: r.created_at,
  voided: r.voided ?? false,
  voidedAt: r.voided_at ?? null,
  voidedBy: r.voided_by ?? null,
});

function isMissingRpcError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST202' ||
    !!error.message?.includes('Could not find the function') ||
    !!error.message?.includes('register_payment') ||
    !!error.message?.includes('void_payment')
  );
}

/** Compensación si falla a mitad en el fallback sin RPC. */
async function rollbackPaymentCreate(paymentId: string): Promise<void> {
  await supabase.from('finance_movements').delete().eq('reference_id', paymentId);
  await supabase
    .from('account_movements')
    .delete()
    .eq('reference_id', paymentId)
    .in('reference_type', ['cobro', 'pago']);
  await supabase.from('payments').delete().eq('id', paymentId);
}

async function createPaymentClientSide(params: {
  type: PaymentType;
  customerId: string | null;
  supplierId: string | null;
  date: string;
  amount: number;
  paymentMethod: PaymentMethodCode;
  concept: string | null;
  createdBy: string;
}): Promise<string> {
  const amount = roundMoney(params.amount);
  if (!(amount > 0)) throw new Error('INVALID_AMOUNT');

  const paymentId = generateId();
  const concept =
    (params.concept && params.concept.trim()) ||
    defaultPaymentConcept(params.type, params.paymentMethod);
  const now = new Date().toISOString();

  try {
    const { error: pErr } = await supabase.from('payments').insert({
      id: paymentId,
      type: params.type,
      customer_id: params.customerId,
      supplier_id: params.supplierId,
      date: params.date,
      amount,
      payment_method: params.paymentMethod,
      concept: params.concept?.trim() || null,
      created_by: params.createdBy,
      created_at: now,
      voided: false,
    });
    if (pErr) throw pErr;

    const { error: aErr } = await supabase.from('account_movements').insert({
      id: generateId(),
      date: params.date,
      customer_id: params.type === 'cobro' ? params.customerId : null,
      supplier_id: params.type === 'pago' ? params.supplierId : null,
      concept,
      debe: params.type === 'pago' ? amount : 0,
      haber: params.type === 'cobro' ? amount : 0,
      reference_type: params.type,
      reference_id: paymentId,
      created_by: params.createdBy,
      created_at: now,
      voided: false,
    });
    if (aErr) throw aErr;

    const { error: fErr } = await supabase.from('finance_movements').insert({
      id: generateId(),
      date: params.date,
      type: params.type === 'cobro' ? 'ingreso' : 'egreso',
      concept,
      payment_method: params.paymentMethod,
      amount,
      reference_id: paymentId,
      voided: false,
    });
    if (fErr) throw fErr;

    return paymentId;
  } catch (err) {
    await rollbackPaymentCreate(paymentId);
    throw err;
  }
}

export const paymentsDB = {
  async getById(id: string): Promise<Payment | undefined> {
    const { data, error } = await supabase.from('payments').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? mapPaymentFromDB(data) : undefined;
  },

  /**
   * Registra cobro o pago: payment + account_movement + finance_movement.
   * Prefiere RPC atómica; si falta la migración de funciones, usa cliente con rollback.
   */
  async register(params: {
    type: PaymentType;
    customerId?: string | null;
    supplierId?: string | null;
    date: string;
    amount: number;
    paymentMethod: PaymentMethodCode;
    concept?: string | null;
    createdBy: string;
  }): Promise<string> {
    const amount = roundMoney(params.amount);
    if (!(amount > 0)) throw new Error('INVALID_AMOUNT');
    if (!['efectivo', 'transferencia', 'tarjeta', 'qr'].includes(params.paymentMethod)) {
      throw new Error('INVALID_PAYMENT_METHOD');
    }
    if (params.type === 'cobro' && !params.customerId) throw new Error('CUSTOMER_REQUIRED');
    if (params.type === 'pago' && !params.supplierId) throw new Error('SUPPLIER_REQUIRED');

    const { data, error } = await supabase.rpc('register_payment', {
      p_type: params.type,
      p_customer_id: params.type === 'cobro' ? params.customerId : null,
      p_supplier_id: params.type === 'pago' ? params.supplierId : null,
      p_date: params.date,
      p_amount: amount,
      p_payment_method: params.paymentMethod,
      p_concept: params.concept?.trim() || null,
      p_created_by: params.createdBy,
    });

    if (!error) return data as string;
    if (!isMissingRpcError(error)) throw error;

    return createPaymentClientSide({
      type: params.type,
      customerId: params.type === 'cobro' ? params.customerId ?? null : null,
      supplierId: params.type === 'pago' ? params.supplierId ?? null : null,
      date: params.date,
      amount,
      paymentMethod: params.paymentMethod,
      concept: params.concept?.trim() || null,
      createdBy: params.createdBy,
    });
  },

  /** Anula payment + CC + finanzas. Motivo obligatorio. */
  async void(paymentId: string, userId: string, reason: string): Promise<void> {
    if (!reason.trim()) throw new Error('REASON_REQUIRED');

    const { error } = await supabase.rpc('void_payment', {
      p_payment_id: paymentId,
      p_user_id: userId,
      p_reason: reason.trim(),
    });

    if (!error) return;
    if (!isMissingRpcError(error)) throw error;

    // Fallback no-RPC: anular las tres patas; si falla a mitad, lanzar
    const payment = await this.getById(paymentId);
    if (!payment) throw new Error('PAYMENT_NOT_FOUND');
    if (payment.voided) throw new Error('PAYMENT_ALREADY_VOIDED');

    const now = new Date().toISOString();
    const { error: pErr } = await supabase
      .from('payments')
      .update({ voided: true, voided_at: now, voided_by: userId })
      .eq('id', paymentId)
      .eq('voided', false);
    if (pErr) throw pErr;

    const { error: aErr } = await supabase
      .from('account_movements')
      .update({ voided: true, voided_at: now, voided_by: userId })
      .eq('reference_id', paymentId)
      .in('reference_type', ['cobro', 'pago'])
      .eq('voided', false);
    if (aErr) throw aErr;

    const { error: fErr } = await supabase
      .from('finance_movements')
      .update({ voided: true })
      .eq('reference_id', paymentId)
      .eq('voided', false);
    if (fErr) throw fErr;
  },
};

// ─── Configuración (fila única id=1) ─────────────────────────────────

export const db = {
  async getSettings(): Promise<Settings> {
    const { data, error } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
    if (error) throw error;
    return {
      businessName: data?.business_name ?? 'La Hueveria',
      defaultPriceListId: data?.default_price_list_id ?? null,
      setupCompleted: data?.setup_completed ?? false,
    };
  },
  async setSettings(settings: Settings): Promise<void> {
    const { error } = await supabase.from('settings').upsert({
      id: 1,
      business_name: settings.businessName,
      default_price_list_id: settings.defaultPriceListId,
      setup_completed: settings.setupCompleted,
    });
    if (error) throw error;
  },
};