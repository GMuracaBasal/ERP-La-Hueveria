export type Role = 'admin' | 'vendedor';

export interface User {
  id: string;
  fullName: string;
  username: string;
  passwordHash: string;
  role: Role;
  email?: string | null;
  active: boolean;
  modules: string[];
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  costPrice: number;
  stock: number;
  minStock: number;
}

export interface PriceList {
  id: string;
  name: string;
  isDefault: boolean;
  prices: Record<string, number>; // productId -> price
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  priceListId: string | null;
  notes: string;
}

export interface PurchaseItem {
  productId: string;
  quantity: number;
  unitCost: number;
  subtotal: number;
}

export interface Purchase {
  id: string;
  date: string;
  supplierId: string;
  invoiceNumber: string;
  notes: string;
  total: number;
  items: PurchaseItem[];
}

export interface SaleItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

/** Origen de la venta: POS minorista vs Terminal mayorista. */
export type PointOfSale = 'mostrador' | 'mayorista';

/** Condición comercial: Contado (venta+cobro) o Cuenta Corriente (solo Debe). */
export type SaleCondition = 'contado' | 'cuenta_corriente';

export interface Sale {
  id: string;
  date: string;
  /** Cliente titular (siempre un id de customers; Consumidor Final es un cliente real). */
  customerId: string | null;
  pointOfSale: PointOfSale;
  condition: SaleCondition;
  /** Medio real del cobro. Null cuando condition = cuenta_corriente (aún no hay cobro). */
  paymentMethod: string | null;
  total: number;
  items: SaleItem[];
  voided?: boolean;
  voidedAt?: string | null;
  voidedBy?: string | null;
}

export type SaleAuditAction = 'edit' | 'void';

export interface SaleAuditLog {
  id: string;
  saleId: string;
  action: SaleAuditAction;
  reason: string;
  performedBy: string;
  performedAt: string;
  snapshot?: Record<string, unknown> | null;
}

export interface InventoryMovement {
  id: string;
  date: string;
  productId: string;
  type: 'entrada' | 'salida' | 'ajuste';
  quantity: number;
  referenceId?: string;
  reason: string;
  voided?: boolean;
}

export interface FinanceMovement {
  id: string;
  date: string;
  type: 'ingreso' | 'egreso';
  concept: string;
  paymentMethod?: string;
  amount: number;
  referenceId?: string;
  voided?: boolean;
}

export type AccountReferenceType = 'venta' | 'compra' | 'cobro' | 'pago' | 'ajuste';

export type AccountPartyType = 'customer' | 'supplier';

/** Movimiento del libro de cuenta corriente (cliente o proveedor). */
export interface AccountMovement {
  id: string;
  date: string;
  customerId: string | null;
  supplierId: string | null;
  concept: string;
  debe: number;
  haber: number;
  referenceType: AccountReferenceType;
  referenceId: string | null;
  createdBy: string | null;
  createdAt: string;
  voided: boolean;
  voidedAt: string | null;
  voidedBy: string | null;
}

export interface Settings {
  businessName: string;
  defaultPriceListId: string | null;
  setupCompleted: boolean;
}
