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
  cuit?: string | null;
  contactName?: string | null;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  priceListId: string | null;
  notes: string;
  cuit?: string | null;
  contactName?: string | null;
}

export interface PurchaseItem {
  productId: string;
  quantity: number;
  unitCost: number;
  subtotal: number;
}

/** Condición comercial de compra (mismo vocabulario que ventas). */
export type PurchaseCondition = 'contado' | 'cuenta_corriente';

export interface Purchase {
  id: string;
  date: string;
  supplierId: string;
  invoiceNumber: string;
  notes: string;
  condition: PurchaseCondition;
  /** Medio real del pago. Null cuando condition = cuenta_corriente. */
  paymentMethod: string | null;
  /** Cuenta de tesorería del pago. Null cuando condition = cuenta_corriente. */
  accountId?: string | null;
  total: number;
  items: PurchaseItem[];
  voided?: boolean;
  voidedAt?: string | null;
  voidedBy?: string | null;
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
  /** Cuenta de tesorería del cobro. Null cuando condition = cuenta_corriente. */
  accountId?: string | null;
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
  /** Cuenta de tesorería. Null solo si la migración aún no corrió. */
  accountId?: string | null;
  /** Presente cuando el movimiento es una pata de transferencia. */
  transferId?: string | null;
  createdAt?: string;
}

export type TreasuryAccountType = 'efectivo' | 'banco' | 'billetera' | 'otra';
export type TreasuryCurrency = 'ARS' | 'USD';

export interface TreasuryAccount {
  id: string;
  name: string;
  type: TreasuryAccountType;
  bank: string | null;
  accountNumber: string | null;
  currency: TreasuryCurrency;
  initialBalance: number;
  openingDate: string;
  isDefault: boolean;
  enabled: boolean;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface TreasuryTransfer {
  id: string;
  date: string;
  fromAccountId: string;
  toAccountId: string;
  amountFrom: number;
  amountTo: number;
  concept: string | null;
  createdBy: string | null;
  createdAt: string;
  voided: boolean;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason?: string | null;
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

/** Cobro a cliente o pago a proveedor (mueve CC + caja juntos). */
export type PaymentType = 'cobro' | 'pago';

export interface Payment {
  id: string;
  type: PaymentType;
  customerId: string | null;
  supplierId: string | null;
  date: string;
  amount: number;
  /** Código: efectivo | transferencia | tarjeta | qr */
  paymentMethod: string;
  /** Cuenta ARS donde entra (cobro) o sale (pago) la plata. */
  accountId?: string | null;
  concept: string | null;
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
