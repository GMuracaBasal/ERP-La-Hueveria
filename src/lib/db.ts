import { supabase } from './supabase';
import { generateId } from './utils';
import {
  User, Product, PriceList, Supplier, Customer,
  Purchase, Sale, InventoryMovement, FinanceMovement, Settings,
  AccountMovement, PointOfSale, SaleCondition, PurchaseCondition,
  Payment, PaymentType, TreasuryAccount, TreasuryTransfer,
  ReceivedCheck, ReceivedCheckDraft,
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
  cuit: r.cuit ?? null, contactName: r.contact_name ?? null,
});
const mapCustomerToDB = (c: Customer) => ({
  id: c.id, name: c.name, phone: c.phone, email: c.email,
  address: c.address, price_list_id: c.priceListId, notes: c.notes,
  cuit: c.cuit ?? null, contact_name: c.contactName ?? null,
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
  accountId: r.account_id ?? null,
  transferId: r.transfer_id ?? null,
  createdAt: r.created_at ?? undefined,
});
const mapFinanceToDB = (m: FinanceMovement) => ({
  id: m.id, date: m.date, type: m.type, concept: m.concept,
  payment_method: normalizePaymentMethod(m.paymentMethod) ?? m.paymentMethod ?? null,
  amount: m.amount, reference_id: m.referenceId,
  voided: m.voided ?? false,
  account_id: m.accountId ?? null,
  transfer_id: m.transferId ?? null,
});

const mapSupplierFromDB = (r: any): Supplier => ({
  id: r.id, name: r.name, phone: r.phone, email: r.email,
  address: r.address, notes: r.notes,
  cuit: r.cuit ?? null, contactName: r.contact_name ?? null,
});
const mapSupplierToDB = (s: Supplier) => ({
  id: s.id, name: s.name, phone: s.phone, email: s.email,
  address: s.address, notes: s.notes,
  cuit: s.cuit ?? null, contact_name: s.contactName ?? null,
});

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
export const suppliersDB = simpleCRUD<Supplier>('suppliers', mapSupplierFromDB, mapSupplierToDB);
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
  /** Libro de una cuenta (incluye anulados para mostrarlos tachados). */
  async getByAccount(accountId: string): Promise<FinanceMovement[]> {
    const { data, error } = await supabase
      .from('finance_movements')
      .select('*')
      .eq('account_id', accountId);
    if (error) throw error;
    return (data ?? []).map(mapFinanceFromDB);
  },
};

const mapTreasuryAccountFromDB = (r: any): TreasuryAccount => ({
  id: r.id,
  name: r.name,
  type: r.type,
  bank: r.bank ?? null,
  accountNumber: r.account_number ?? null,
  currency: r.currency === 'USD' ? 'USD' : 'ARS',
  initialBalance: Number(r.initial_balance),
  openingDate: r.opening_date,
  isDefault: !!r.is_default,
  enabled: r.enabled !== false,
  notes: r.notes ?? null,
  createdAt: r.created_at,
  createdBy: r.created_by ?? null,
});

const mapTreasuryAccountToDB = (a: TreasuryAccount) => ({
  id: a.id,
  name: a.name,
  type: a.type,
  bank: a.bank,
  account_number: a.accountNumber,
  currency: a.currency,
  initial_balance: a.initialBalance,
  opening_date: a.openingDate,
  is_default: a.isDefault,
  enabled: a.enabled,
  notes: a.notes,
  created_by: a.createdBy,
});

export const treasuryAccountsDB = {
  async getAll(): Promise<TreasuryAccount[]> {
    const { data, error } = await supabase
      .from('treasury_accounts')
      .select('*')
      .order('currency', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapTreasuryAccountFromDB);
  },
  async getById(id: string): Promise<TreasuryAccount | undefined> {
    const { data, error } = await supabase
      .from('treasury_accounts')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapTreasuryAccountFromDB(data) : undefined;
  },
  async save(account: TreasuryAccount): Promise<void> {
    const row = mapTreasuryAccountToDB(account);
    if (account.isDefault) {
      const { is_default: _ignored, ...withoutDefault } = row;
      const { error } = await supabase.from('treasury_accounts').upsert(withoutDefault);
      if (error) throw error;
      const { error: rpcErr } = await supabase.rpc('set_default_treasury_account', {
        p_account_id: account.id,
      });
      if (!rpcErr) return;
      if (!isMissingRpcError(rpcErr)) throw rpcErr;
      const { error: unsetErr } = await supabase
        .from('treasury_accounts')
        .update({ is_default: false })
        .neq('id', account.id)
        .eq('is_default', true);
      if (unsetErr) throw unsetErr;
      const { error: setErr } = await supabase
        .from('treasury_accounts')
        .update({ is_default: true, enabled: true })
        .eq('id', account.id);
      if (setErr) throw setErr;
      return;
    }
    const { error } = await supabase.from('treasury_accounts').upsert({ ...row, is_default: false });
    if (error) throw error;
  },
};

/** Cobros/pagos/ventas/compras: solo ARS habilitada. Si no hay id, usa la default ARS. */
async function requireArsTreasuryAccountId(accountId?: string | null): Promise<string> {
  const accounts = await treasuryAccountsDB.getAll();
  if (accountId) {
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) throw new Error('ACCOUNT_NOT_FOUND');
    if (!acc.enabled) throw new Error('ACCOUNT_DISABLED');
    if (acc.currency !== 'ARS') throw new Error('ACCOUNT_NOT_ARS');
    return acc.id;
  }
  const ars = accounts.filter((a) => a.enabled && a.currency === 'ARS');
  const def = ars.find((a) => a.isDefault) ?? ars[0];
  if (!def) throw new Error('ACCOUNT_REQUIRED');
  return def.id;
}

const mapTreasuryTransferFromDB = (r: any): TreasuryTransfer => ({
  id: r.id,
  date: r.date,
  fromAccountId: r.from_account_id,
  toAccountId: r.to_account_id,
  amountFrom: Number(r.amount_from),
  amountTo: Number(r.amount_to),
  concept: r.concept ?? null,
  createdBy: r.created_by ?? null,
  createdAt: r.created_at,
  voided: !!r.voided,
  voidedAt: r.voided_at ?? null,
  voidedBy: r.voided_by ?? null,
  voidReason: r.void_reason ?? null,
});

export const treasuryTransfersDB = {
  async getById(id: string): Promise<TreasuryTransfer | undefined> {
    const { data, error } = await supabase
      .from('treasury_transfers')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapTreasuryTransferFromDB(data) : undefined;
  },

  async register(params: {
    date: string;
    fromAccountId: string;
    toAccountId: string;
    amountFrom: number;
    amountTo: number;
    concept?: string | null;
    createdBy: string;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('register_treasury_transfer', {
      p_date: params.date,
      p_from_account_id: params.fromAccountId,
      p_to_account_id: params.toAccountId,
      p_amount_from: params.amountFrom,
      p_amount_to: params.amountTo,
      p_concept: params.concept?.trim() || null,
      p_created_by: params.createdBy,
    });
    if (!error) return data as string;
    if (!isMissingRpcError(error)) throw error;
    return createTreasuryTransferClientSide(params);
  },

  async void(transferId: string, userId: string, reason: string): Promise<void> {
    if (!reason.trim()) throw new Error('REASON_REQUIRED');
    const { error } = await supabase.rpc('void_treasury_transfer', {
      p_transfer_id: transferId,
      p_user_id: userId,
      p_reason: reason.trim(),
    });
    if (!error) return;
    if (!isMissingRpcError(error)) throw error;
    await voidTreasuryTransferClientSide(transferId, userId, reason.trim());
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
    // Una sola default: bajar las demás ANTES de marcar esta, para no chocar
    // con un índice único parcial sobre is_default = true.
    if (list.isDefault) {
      const { error: unsetErr } = await supabase
        .from('price_lists')
        .update({ is_default: false })
        .neq('id', list.id)
        .eq('is_default', true);
      if (unsetErr) throw unsetErr;
    }

    const { error } = await supabase.from('price_lists').upsert({
      id: list.id, name: list.name, is_default: list.isDefault,
    });
    if (error) throw error;

    if (list.isDefault) {
      await supabase
        .from('settings')
        .update({ default_price_list_id: list.id })
        .eq('id', 1);
    }

    await supabase.from('price_list_items').delete().eq('price_list_id', list.id);
    const rows = Object.entries(list.prices)
      .filter(([, price]) => typeof price === 'number' && Number.isFinite(price))
      .map(([productId, price]) => ({
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
    accountId: condition === 'cuenta_corriente' ? null : (p.account_id ?? null),
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
      account_id: condition === 'cuenta_corriente' ? null : (purchase.accountId ?? null),
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
    const accountId =
      condition === 'contado' ? await requireArsTreasuryAccountId(purchase.accountId) : null;
    const normalized: Purchase = {
      ...purchase,
      total,
      condition,
      paymentMethod: condition === 'cuenta_corriente'
        ? null
        : normalizePaymentMethod(purchase.paymentMethod),
      accountId,
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
        accountId: normalized.accountId,
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
      'supplierId' | 'invoiceNumber' | 'notes' | 'date' | 'items' | 'condition' | 'paymentMethod' | 'accountId'
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
    const accountId =
      nextCondition === 'contado'
        ? await requireArsTreasuryAccountId(data.accountId ?? existing.accountId)
        : null;
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
      accountId,
    };

    const { error: headerErr } = await supabase.from('purchases').update({
      supplier_id: updated.supplierId,
      invoice_number: updated.invoiceNumber,
      notes: updated.notes,
      total: updated.total,
      date: updated.date,
      condition: updated.condition,
      payment_method: updated.paymentMethod,
      account_id: updated.accountId,
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
        accountId: updated.accountId,
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
    accountId: condition === 'cuenta_corriente' ? null : (s.account_id ?? null),
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
      account_id: condition === 'cuenta_corriente' ? null : (sale.accountId ?? null),
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
    const accountId =
      condition === 'contado' ? await requireArsTreasuryAccountId(sale.accountId) : null;
    const normalized: Sale = {
      ...sale,
      total,
      condition,
      paymentMethod:
        condition === 'cuenta_corriente' ? null : normalizePaymentMethod(sale.paymentMethod),
      accountId,
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
        accountId: normalized.accountId,
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
    sale: Pick<Sale, 'customerId' | 'paymentMethod' | 'date' | 'items' | 'condition' | 'accountId'> & {
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
    const accountId =
      nextCondition === 'contado'
        ? await requireArsTreasuryAccountId(sale.accountId ?? existing.accountId)
        : null;
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
      accountId,
    };

    const { error: headerErr } = await supabase.from('sales').update({
      customer_id: updated.customerId,
      payment_method: updated.paymentMethod,
      total: updated.total,
      date: updated.date,
      condition: updated.condition,
      point_of_sale: existing.pointOfSale,
      account_id: updated.accountId,
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
        accountId: updated.accountId,
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

// ─── Cheques recibidos (cartera; la plata entra recién al acreditar) ─

const mapReceivedCheckFromDB = (r: any): ReceivedCheck => ({
  id: r.id,
  checkNumber: r.check_number,
  kind: r.kind === 'echeq' ? 'echeq' : 'papel',
  bank: r.bank ?? null,
  drawerName: r.drawer_name ?? null,
  drawerTaxId: r.drawer_tax_id ?? null,
  amount: Number(r.amount),
  issueDate: r.issue_date ?? null,
  dueDate: r.due_date,
  customerId: r.customer_id ?? null,
  paymentId: r.payment_id ?? null,
  status: r.status,
  depositAccountId: r.deposit_account_id ?? null,
  depositedAt: r.deposited_at ?? null,
  creditedAt: r.credited_at ?? null,
  rejectedAt: r.rejected_at ?? null,
  rejectionReason: r.rejection_reason ?? null,
  endorsedToSupplierId: r.endorsed_to_supplier_id ?? null,
  endorsedAt: r.endorsed_at ?? null,
  notes: r.notes ?? null,
  createdBy: r.created_by ?? null,
  createdAt: r.created_at,
  voided: !!r.voided,
  voidedAt: r.voided_at ?? null,
  voidedBy: r.voided_by ?? null,
  voidReason: r.void_reason ?? null,
});

function isMissingChecksTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = error.message ?? '';
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    (msg.includes('received_checks') && (msg.includes('does not exist') || msg.includes('schema cache')))
  );
}

function checkPayload(check: ReceivedCheckDraft, amount: number) {
  return {
    check_number: check.checkNumber.trim(),
    kind: check.kind,
    bank: check.bank?.trim() || null,
    drawer_name: check.drawerName?.trim() || null,
    drawer_tax_id: check.drawerTaxId?.trim() || null,
    amount,
    issue_date: check.issueDate || null,
    due_date: check.dueDate,
    notes: check.notes?.trim() || null,
  };
}

export const receivedChecksDB = {
  async listActive(): Promise<ReceivedCheck[]> {
    const { data, error } = await supabase
      .from('received_checks')
      .select('*')
      .eq('voided', false)
      .order('due_date', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapReceivedCheckFromDB);
  },

  /** Cheques del cliente que todavía no son plata ni fueron rechazados. */
  async listOpenByCustomer(customerId: string): Promise<ReceivedCheck[]> {
    const { data, error } = await supabase
      .from('received_checks')
      .select('*')
      .eq('customer_id', customerId)
      .eq('voided', false)
      .in('status', ['en_cartera', 'depositado'])
      .order('due_date', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapReceivedCheckFromDB);
  },

  /** Vigentes de un cobro. Si la tabla todavía no existe, devuelve [] para no romper anulaciones viejas. */
  async listByPayment(paymentId: string): Promise<ReceivedCheck[]> {
    const { data, error } = await supabase
      .from('received_checks')
      .select('*')
      .eq('payment_id', paymentId)
      .eq('voided', false);
    if (error) {
      if (isMissingChecksTable(error)) return [];
      throw error;
    }
    return (data ?? []).map(mapReceivedCheckFromDB);
  },

  /** Cartera inicial: solo el cheque. No toca cuenta corriente ni tesorería. */
  async createPortfolio(input: ReceivedCheckDraft & { createdBy: string }): Promise<string> {
    const amount = roundMoney(input.amount);
    if (!(amount > 0)) throw new Error('INVALID_AMOUNT');
    if (!input.checkNumber.trim()) throw new Error('CHECK_NUMBER_REQUIRED');
    if (!input.dueDate) throw new Error('DUE_DATE_REQUIRED');
    if (input.kind !== 'papel' && input.kind !== 'echeq') throw new Error('INVALID_CHECK_KIND');

    const id = generateId();
    const { error } = await supabase.from('received_checks').insert({
      id,
      check_number: input.checkNumber.trim(),
      kind: input.kind,
      bank: input.bank?.trim() || null,
      drawer_name: input.drawerName?.trim() || null,
      drawer_tax_id: input.drawerTaxId?.trim() || null,
      amount,
      issue_date: input.issueDate || null,
      due_date: input.dueDate,
      customer_id: input.customerId || null,
      payment_id: null,
      status: 'en_cartera',
      notes: input.notes?.trim() || null,
      created_by: input.createdBy,
      voided: false,
    });
    if (error) throw error;
    return id;
  },

  async deposit(checkId: string, accountId: string, date: string, userId: string): Promise<void> {
    const { error } = await supabase.rpc('deposit_check', {
      p_check_id: checkId,
      p_account_id: accountId,
      p_date: date,
      p_user_id: userId,
    });
    if (error) throw error;
  },

  async credit(checkId: string, date: string, userId: string): Promise<void> {
    const { error } = await supabase.rpc('credit_check', {
      p_check_id: checkId,
      p_date: date,
      p_user_id: userId,
    });
    if (error) throw error;
  },

  async reject(checkId: string, date: string, reason: string, userId: string): Promise<void> {
    if (!reason.trim()) throw new Error('REASON_REQUIRED');
    const { error } = await supabase.rpc('reject_check', {
      p_check_id: checkId,
      p_date: date,
      p_reason: reason.trim(),
      p_user_id: userId,
    });
    if (error) throw error;
  },

  async void(checkId: string, reason: string, userId: string): Promise<void> {
    if (!reason.trim()) throw new Error('REASON_REQUIRED');
    const { error } = await supabase.rpc('void_received_check', {
      p_check_id: checkId,
      p_reason: reason.trim(),
      p_user_id: userId,
    });
    if (error) throw error;
  },

  /** Acompaña la anulación de un cobro: saca de la cartera lo que todavía no se acreditó. */
  async voidOpenForPayment(paymentId: string, userId: string, reason: string): Promise<void> {
    const { error } = await supabase
      .from('received_checks')
      .update({
        voided: true,
        voided_at: new Date().toISOString(),
        voided_by: userId,
        void_reason: reason.trim(),
      })
      .eq('payment_id', paymentId)
      .eq('voided', false)
      .in('status', ['en_cartera', 'depositado']);
    if (error && !isMissingChecksTable(error)) throw error;
  },
};

// ─── Cobros / Pagos (CC + caja, o CC + cheque en cartera) ────────────

const mapPaymentFromDB = (r: any): Payment => ({
  id: r.id,
  type: r.type,
  customerId: r.customer_id ?? null,
  supplierId: r.supplier_id ?? null,
  date: r.date,
  amount: Number(r.amount),
  paymentMethod: normalizePaymentMethod(r.payment_method) ?? r.payment_method,
  accountId: r.account_id ?? null,
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
    !!error.message?.includes('void_payment') ||
    !!error.message?.includes('register_treasury_transfer') ||
    !!error.message?.includes('void_treasury_transfer') ||
    !!error.message?.includes('set_default_treasury_account')
  );
}

async function createTreasuryTransferClientSide(params: {
  date: string;
  fromAccountId: string;
  toAccountId: string;
  amountFrom: number;
  amountTo: number;
  concept?: string | null;
  createdBy: string;
}): Promise<string> {
  const transferId = generateId();
  const fromAcc = await treasuryAccountsDB.getById(params.fromAccountId);
  const toAcc = await treasuryAccountsDB.getById(params.toAccountId);
  if (!fromAcc || !toAcc) throw new Error('ACCOUNTS_REQUIRED');
  if (params.fromAccountId === params.toAccountId) throw new Error('SAME_ACCOUNT');
  if (!fromAcc.enabled || !toAcc.enabled) throw new Error('FROM_ACCOUNT_DISABLED');
  const amountFrom = roundMoney(params.amountFrom);
  const amountTo = roundMoney(params.amountTo);
  if (!(amountFrom > 0) || !(amountTo > 0)) throw new Error('INVALID_AMOUNT');
  if (fromAcc.currency === toAcc.currency && amountFrom !== amountTo) {
    throw new Error('AMOUNTS_MUST_MATCH');
  }

  const custom = params.concept?.trim() || '';
  const fromConcept = custom
    ? `Transferencia a ${toAcc.name} — ${custom}`
    : `Transferencia a ${toAcc.name}`;
  const toConcept = custom
    ? `Transferencia de ${fromAcc.name} — ${custom}`
    : `Transferencia de ${fromAcc.name}`;

  try {
    const { error: tErr } = await supabase.from('treasury_transfers').insert({
      id: transferId,
      date: params.date,
      from_account_id: params.fromAccountId,
      to_account_id: params.toAccountId,
      amount_from: amountFrom,
      amount_to: amountTo,
      concept: custom || null,
      created_by: params.createdBy,
      voided: false,
    });
    if (tErr) throw tErr;

    const { error: eErr } = await supabase.from('finance_movements').insert({
      id: generateId(),
      date: params.date,
      type: 'egreso',
      concept: fromConcept,
      payment_method: 'transferencia',
      amount: amountFrom,
      reference_id: transferId,
      account_id: params.fromAccountId,
      transfer_id: transferId,
      voided: false,
    });
    if (eErr) throw eErr;

    const { error: iErr } = await supabase.from('finance_movements').insert({
      id: generateId(),
      date: params.date,
      type: 'ingreso',
      concept: toConcept,
      payment_method: 'transferencia',
      amount: amountTo,
      reference_id: transferId,
      account_id: params.toAccountId,
      transfer_id: transferId,
      voided: false,
    });
    if (iErr) throw iErr;

    return transferId;
  } catch (err) {
    await supabase.from('finance_movements').delete().eq('transfer_id', transferId);
    await supabase.from('treasury_transfers').delete().eq('id', transferId);
    throw err;
  }
}

async function voidTreasuryTransferClientSide(transferId: string, userId: string, reason: string): Promise<void> {
  const transfer = await treasuryTransfersDB.getById(transferId);
  if (!transfer) throw new Error('TRANSFER_NOT_FOUND');
  if (transfer.voided) throw new Error('TRANSFER_ALREADY_VOIDED');
  if (!reason.trim()) throw new Error('REASON_REQUIRED');

  const now = new Date().toISOString();
  const { error: tErr } = await supabase
    .from('treasury_transfers')
    .update({
      voided: true,
      voided_at: now,
      voided_by: userId,
      void_reason: reason.trim(),
    })
    .eq('id', transferId)
    .eq('voided', false);
  if (tErr) throw tErr;

  const { error: fErr } = await supabase
    .from('finance_movements')
    .update({ voided: true })
    .eq('transfer_id', transferId)
    .eq('voided', false);
  if (fErr) {
    await supabase
      .from('treasury_transfers')
      .update({ voided: false, voided_at: null, voided_by: null, void_reason: null })
      .eq('id', transferId);
    throw fErr;
  }
}

/** Compensación si falla a mitad en el fallback sin RPC. El cheque se borra antes que el payment (FK). */
async function rollbackPaymentCreate(paymentId: string): Promise<void> {
  await supabase.from('received_checks').delete().eq('payment_id', paymentId);
  await supabase.from('finance_movements').delete().eq('reference_id', paymentId);
  await supabase
    .from('account_movements')
    .delete()
    .eq('reference_id', paymentId)
    .in('reference_type', ['cobro', 'pago']);
  await supabase.from('payments').delete().eq('id', paymentId);
}

/** Cobro con cheque sin RPC: payment + haber + cheque. Si algo falla, no queda el cheque sin la cuenta corriente. */
async function createCheckPaymentClientSide(params: {
  customerId: string;
  date: string;
  amount: number;
  concept: string | null;
  createdBy: string;
  check: ReceivedCheckDraft;
}): Promise<string> {
  const amount = roundMoney(params.amount);
  const checkAmount = roundMoney(params.check.amount);
  if (!(amount > 0) || checkAmount !== amount) throw new Error('CHECK_AMOUNT_MISMATCH');
  if (!params.check.checkNumber.trim()) throw new Error('CHECK_NUMBER_REQUIRED');
  if (!params.check.dueDate) throw new Error('DUE_DATE_REQUIRED');

  const paymentId = generateId();
  const concept = (params.concept && params.concept.trim()) || defaultPaymentConcept('cobro', 'cheque');
  const now = new Date().toISOString();

  try {
    const { error: pErr } = await supabase.from('payments').insert({
      id: paymentId,
      type: 'cobro',
      customer_id: params.customerId,
      supplier_id: null,
      date: params.date,
      amount,
      payment_method: 'cheque',
      concept: params.concept?.trim() || null,
      created_by: params.createdBy,
      created_at: now,
      voided: false,
      account_id: null,
    });
    if (pErr) throw pErr;

    const { error: aErr } = await supabase.from('account_movements').insert({
      id: generateId(),
      date: params.date,
      customer_id: params.customerId,
      supplier_id: null,
      concept,
      debe: 0,
      haber: amount,
      reference_type: 'cobro',
      reference_id: paymentId,
      created_by: params.createdBy,
      created_at: now,
      voided: false,
    });
    if (aErr) throw aErr;

    const { error: cErr } = await supabase.from('received_checks').insert({
      id: generateId(),
      check_number: params.check.checkNumber.trim(),
      kind: params.check.kind,
      bank: params.check.bank?.trim() || null,
      drawer_name: params.check.drawerName?.trim() || null,
      drawer_tax_id: params.check.drawerTaxId?.trim() || null,
      amount,
      issue_date: params.check.issueDate || null,
      due_date: params.check.dueDate,
      customer_id: params.customerId,
      payment_id: paymentId,
      status: 'en_cartera',
      notes: params.check.notes?.trim() || null,
      created_by: params.createdBy,
      voided: false,
    });
    if (cErr) throw cErr;

    return paymentId;
  } catch (err) {
    await rollbackPaymentCreate(paymentId);
    throw err;
  }
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
  accountId: string;
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
      account_id: params.accountId,
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
      account_id: params.accountId,
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
   * Registra cobro o pago.
   * Efectivo/transferencia/tarjeta/QR: payment + cuenta corriente + finance_movement en una cuenta ARS.
   * Cheque (solo cobro): payment + haber del cliente + cheque en cartera. Ninguna cuenta se mueve.
   * Prefiere RPC atómica; si falta la función, usa cliente con rollback.
   */
  async register(params: {
    type: PaymentType;
    customerId?: string | null;
    supplierId?: string | null;
    date: string;
    amount: number;
    paymentMethod: PaymentMethodCode | 'cheque';
    concept?: string | null;
    createdBy: string;
    accountId?: string | null;
    check?: ReceivedCheckDraft | null;
  }): Promise<string> {
    const amount = roundMoney(params.amount);
    if (!(amount > 0)) throw new Error('INVALID_AMOUNT');
    if (params.type === 'cobro' && !params.customerId) throw new Error('CUSTOMER_REQUIRED');
    if (params.type === 'pago' && !params.supplierId) throw new Error('SUPPLIER_REQUIRED');

    const isCheck = params.paymentMethod === 'cheque';
    if (isCheck) {
      if (params.type !== 'cobro' || !params.customerId) throw new Error('CHECK_ONLY_ON_COLLECTION');
      if (!params.check) throw new Error('CHECK_REQUIRED');
      if (!params.check.checkNumber.trim()) throw new Error('CHECK_NUMBER_REQUIRED');
      if (!params.check.dueDate) throw new Error('DUE_DATE_REQUIRED');
      if (params.check.kind !== 'papel' && params.check.kind !== 'echeq') {
        throw new Error('INVALID_CHECK_KIND');
      }
      if (roundMoney(params.check.amount) !== amount) throw new Error('CHECK_AMOUNT_MISMATCH');
    } else if (!['efectivo', 'transferencia', 'tarjeta', 'qr'].includes(params.paymentMethod)) {
      throw new Error('INVALID_PAYMENT_METHOD');
    }

    const accountId = isCheck ? null : await requireArsTreasuryAccountId(params.accountId);

    const { data, error } = await supabase.rpc('register_payment', {
      p_type: params.type,
      p_customer_id: params.type === 'cobro' ? params.customerId : null,
      p_supplier_id: params.type === 'pago' ? params.supplierId : null,
      p_date: params.date,
      p_amount: amount,
      p_payment_method: params.paymentMethod,
      p_concept: params.concept?.trim() || null,
      p_created_by: params.createdBy,
      p_account_id: accountId,
      p_check: isCheck && params.check ? checkPayload(params.check, amount) : null,
    });

    if (!error) return data as string;
    if (!isMissingRpcError(error)) throw error;

    if (isCheck && params.check && params.customerId) {
      return createCheckPaymentClientSide({
        customerId: params.customerId,
        date: params.date,
        amount,
        concept: params.concept?.trim() || null,
        createdBy: params.createdBy,
        check: params.check,
      });
    }

    return createPaymentClientSide({
      type: params.type,
      customerId: params.type === 'cobro' ? params.customerId ?? null : null,
      supplierId: params.type === 'pago' ? params.supplierId ?? null : null,
      date: params.date,
      amount,
      paymentMethod: params.paymentMethod as PaymentMethodCode,
      concept: params.concept?.trim() || null,
      createdBy: params.createdBy,
      accountId: accountId as string,
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

    // Fallback no-RPC: anular las patas; si el cheque ya se acreditó, no se toca nada.
    const payment = await this.getById(paymentId);
    if (!payment) throw new Error('PAYMENT_NOT_FOUND');
    if (payment.voided) throw new Error('PAYMENT_ALREADY_VOIDED');

    const linkedChecks = await receivedChecksDB.listByPayment(paymentId);
    if (linkedChecks.some((c) => c.status === 'acreditado')) {
      throw new Error('CHECK_ALREADY_CREDITED');
    }
    if (linkedChecks.some((c) => c.status === 'endosado')) {
      throw new Error('CHECK_ENDORSED');
    }

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

    await receivedChecksDB.voidOpenForPayment(paymentId, userId, reason.trim());
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