import { supabase } from './supabase';
import {
  User, Product, PriceList, Supplier, Customer,
  Purchase, Sale, InventoryMovement, FinanceMovement, Settings
} from '../types';

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
});
const mapUserToDB = (u: User) => ({
  id: u.id, full_name: u.fullName, username: u.username,
  password_hash: u.passwordHash, role: u.role,
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
  paymentMethod: r.payment_method, amount: Number(r.amount), referenceId: r.reference_id,
  voided: r.voided ?? false,
});
const mapFinanceToDB = (m: FinanceMovement) => ({
  id: m.id, date: m.date, type: m.type, concept: m.concept,
  payment_method: m.paymentMethod, amount: m.amount, reference_id: m.referenceId,
  voided: m.voided ?? false,
});

const mapSupplierToDB = (s: Supplier) => ({ ...s });

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

export const purchasesDB = {
  async getAll(): Promise<Purchase[]> {
    const { data, error } = await supabase
      .from('purchases')
      .select('*, purchase_items(*)')
      .eq('voided', false);
    if (error) throw error;
    return (data ?? []).map((p) => ({
      id: p.id, date: p.date, supplierId: p.supplier_id,
      invoiceNumber: p.invoice_number, notes: p.notes, total: Number(p.total),
      items: (p.purchase_items ?? []).map((it: any) => ({
        productId: it.product_id, quantity: Number(it.quantity),
        unitCost: Number(it.unit_cost), subtotal: Number(it.subtotal),
      })),
    }));
  },

  async getById(id: string): Promise<Purchase | undefined> {
    const all = await this.getAll();
    return all.find((p) => p.id === id);
  },

  async save(purchase: Purchase): Promise<void> {
    const { error } = await supabase.from('purchases').upsert({
      id: purchase.id, date: purchase.date, supplier_id: purchase.supplierId,
      invoice_number: purchase.invoiceNumber, notes: purchase.notes, total: purchase.total,
    });
    if (error) throw error;

    await supabase.from('purchase_items').delete().eq('purchase_id', purchase.id);
    const rows = purchase.items.map((it) => ({
      purchase_id: purchase.id, product_id: it.productId,
      quantity: it.quantity, unit_cost: it.unitCost, subtotal: it.subtotal,
    }));
    if (rows.length > 0) {
      const { error: e2 } = await supabase.from('purchase_items').insert(rows);
      if (e2) throw e2;
    }
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('purchases').update({ voided: true }).eq('id', id);
    if (error) throw error;
  },
};

// ─── Ventas (con items en tabla hija) ────────────────────────────────

const mapSaleFromDB = (s: any): Sale => ({
  id: s.id,
  date: s.date,
  customerId: s.customer_id,
  paymentMethod: s.payment_method,
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
});

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
    const { error } = await supabase.from('sales').upsert({
      id: sale.id, date: sale.date, customer_id: sale.customerId,
      payment_method: sale.paymentMethod, total: sale.total,
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

  /** @deprecated Usar voidSale() — anula solo la fila sin revertir stock/finanzas */
  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('sales').update({ voided: true }).eq('id', id);
    if (error) throw error;
  },

  async voidSale(saleId: string, userId: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('void_sale', {
      p_sale_id: saleId,
      p_user_id: userId,
      p_reason: reason.trim(),
    });
    if (error) throw error;
  },

  async editSale(
    saleId: string,
    userId: string,
    reason: string,
    sale: Pick<Sale, 'customerId' | 'paymentMethod' | 'date' | 'items'>,
  ): Promise<void> {
    const { error } = await supabase.rpc('edit_sale', {
      p_sale_id: saleId,
      p_user_id: userId,
      p_reason: reason.trim(),
      p_payment_method: sale.paymentMethod,
      p_customer_id: sale.customerId,
      p_date: sale.date,
      p_items: sale.items.map((it) => ({
        product_id: it.productId,
        quantity: it.quantity,
        unit_price: it.unitPrice,
        subtotal: it.subtotal,
      })),
    });
    if (error) throw error;
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