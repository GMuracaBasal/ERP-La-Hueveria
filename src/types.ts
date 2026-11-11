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

/** Cobro a cliente o pago a proveedor. Un cobro con cheque mueve la cuenta corriente y deja el cheque en cartera: no mueve tesorería. */
export type PaymentType = 'cobro' | 'pago';

export type ReceivedCheckKind = 'papel' | 'echeq';
export type ReceivedCheckStatus =
  | 'en_cartera'
  | 'depositado'
  | 'acreditado'
  | 'rechazado'
  | 'endosado'
  | 'anulado';

export type IssuedCheckStatus = 'pendiente' | 'debitado' | 'rechazado' | 'anulado';

/** Cheque emitido por nosotros. Pendiente no es una salida de plata: sale al debitarse. */
export interface IssuedCheck {
  id: string;
  checkNumber: string;
  kind: ReceivedCheckKind;
  accountId: string;
  supplierId: string | null;
  amount: number;
  issueDate: string | null;
  dueDate: string;
  status: IssuedCheckStatus;
  debitedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  voided: boolean;
  voidedAt: string | null;
  voidedBy: string | null;
}

/** Cheque recibido de un cliente. En cartera o depositado no es plata disponible. */
export interface ReceivedCheck {
  id: string;
  checkNumber: string;
  kind: ReceivedCheckKind;
  bank: string | null;
  drawerName: string | null;
  drawerTaxId: string | null;
  amount: number;
  issueDate: string | null;
  dueDate: string;
  customerId: string | null;
  paymentId: string | null;
  status: ReceivedCheckStatus;
  depositAccountId: string | null;
  depositedAt: string | null;
  creditedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  endorsedToSupplierId: string | null;
  endorsedAt: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  voided: boolean;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
}

/** Datos del cheque al cobrar o al cargar cartera inicial. */
export interface ReceivedCheckDraft {
  checkNumber: string;
  kind: ReceivedCheckKind;
  bank?: string | null;
  drawerName?: string | null;
  drawerTaxId?: string | null;
  amount: number;
  issueDate?: string | null;
  dueDate: string;
  notes?: string | null;
  customerId?: string | null;
}

export type PaymentValueMethod =
  | 'efectivo'
  | 'transferencia'
  | 'tarjeta'
  | 'qr'
  | 'cheque_tercero'
  | 'cheque_propio';

/** Línea de un cobro o pago. La cuenta corriente no se entera de cada línea: solo del total. */
export interface PaymentValue {
  id: string;
  paymentId: string;
  method: PaymentValueMethod;
  amount: number;
  accountId: string | null;
  receivedCheckId: string | null;
  issuedCheckId: string | null;
  createdAt: string;
}

/** Una línea lista para registrar. El cheque de tercero en un cobro trae los datos; en un pago, el id de cartera. */
export type PaymentValueInput =
  | { method: 'efectivo' | 'transferencia' | 'tarjeta' | 'qr'; amount: number; accountId: string }
  | { method: 'cheque_tercero'; amount: number; check: ReceivedCheckDraft }
  | { method: 'cheque_tercero'; amount: number; receivedCheckId: string }
  | {
      method: 'cheque_propio';
      amount: number;
      checkNumber: string;
      kind: ReceivedCheckKind;
      accountId: string;
      dueDate: string;
      issueDate?: string | null;
    };

export interface Payment {
  id: string;
  type: PaymentType;
  customerId: string | null;
  supplierId: string | null;
  date: string;
  amount: number;
  /** Resumen: el método si todos los valores coinciden, o mixto. La fuente de verdad es payment_values. */
  paymentMethod: string;
  /** Resumen legado. Null si hay más de un valor o si el valor no es plata. */
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
