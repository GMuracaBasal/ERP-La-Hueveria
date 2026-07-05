export type Role = 'admin' | 'vendedor';

export interface User {
  id: string;
  fullName: string;
  username: string;
  passwordHash: string;
  role: Role;
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

export interface Sale {
  id: string;
  date: string;
  customerId: string | null; // null represents 'Consumidor Final'
  paymentMethod: string;
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

export interface Settings {
  businessName: string;
  defaultPriceListId: string | null;
  setupCompleted: boolean;
}
