import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { salesDB } from '../lib/db';
import { Sale, SaleItem, Product, Customer, PriceList, Settings, SaleCondition } from '../types';
import { Button, Modal, SearchableSelect, useConfirm, useToast } from '../components/ui';
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { isConsumidorFinal } from '../lib/consumidorFinal';
import {
  canModifySale,
  isCuentaCorrienteSale,
  getSaleRpcErrorMessage,
} from '../lib/salePermissions';
import {
  resolvePriceList,
  getListedPrice,
  hasSellablePrice,
  saleHasUnsellableItems,
} from '../lib/priceLists';
import {
  POS_PAYMENT_OPTIONS,
  TERMINAL_PAYMENT_OPTIONS,
  paymentMethodLabel,
  type PaymentMethodCode,
} from '../lib/paymentMethods';
import PrintableVoucher from './PrintableVoucher';
import TreasuryAccountSelect, { useArsTreasuryAccounts } from './TreasuryAccountSelect';

type Mode = 'view' | 'edit' | 'void';

interface SaleTicketModalProps {
  sale: Sale | null;
  onClose: () => void;
  onUpdated: () => void;
  products: Product[];
  customers: Customer[];
  priceLists: PriceList[];
  settings: Settings | null;
  /** Limita medios de pago y cliente al estilo POS (Caja) */
  posStyle?: boolean;
  /** Modo inicial al abrir (ojo=view, lápiz=edit, X=void). */
  initialMode?: Mode;
}

function getAvailableStock(productId: string, originalSale: Sale, products: Product[]): number {
  const p = products.find((x) => x.id === productId);
  if (!p) return 0;
  const originalQty = originalSale.items
    .filter((i) => i.productId === productId)
    .reduce((a, i) => a + i.quantity, 0);
  return p.stock + originalQty;
}

export default function SaleTicketModal({
  sale,
  onClose,
  onUpdated,
  products,
  customers,
  priceLists,
  settings,
  posStyle = false,
  initialMode = 'view',
}: SaleTicketModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [mode, setMode] = useState<Mode>('view');
  const [customerId, setCustomerId] = useState('');
  const [condition, setCondition] = useState<SaleCondition>('contado');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodCode>('efectivo');
  const [accountId, setAccountId] = useState('');
  const { accounts: arsAccounts, defaultId: defaultAccountId } = useArsTreasuryAccounts();
  const [items, setItems] = useState<SaleItem[]>([]);
  const [editReason, setEditReason] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!sale) return;
    const baseCan = canModifySale(user, sale);
    let next: Mode = initialMode;
    if (initialMode === 'edit' && !baseCan) next = 'view';
    if (initialMode === 'void' && !baseCan) next = 'view';
    setMode(next);
    setCustomerId(sale.customerId || '');
    setCondition(
      posStyle || sale.pointOfSale === 'mostrador'
        ? 'contado'
        : sale.condition,
    );
    setPaymentMethod((sale.paymentMethod as PaymentMethodCode) || 'efectivo');
    setAccountId(sale.accountId || '');
    setItems(sale.items.map((i) => ({ ...i })));
    setEditReason('');
    setVoidReason('');
  }, [sale, initialMode, user, posStyle]);

  useEffect(() => {
    if (!accountId && defaultAccountId) setAccountId(defaultAccountId);
  }, [accountId, defaultAccountId]);

  const namedCustomers = useMemo(
    () => customers.filter((c) => !isConsumidorFinal(c)),
    [customers],
  );

  if (!sale) return null;

  const isVoided = !!sale.voided;
  const baseCanModify = canModifySale(user, sale);
  const canEdit = baseCanModify;
  const canVoid = baseCanModify;
  const canChangeCondition = !posStyle && sale.pointOfSale === 'mayorista';
  const paymentOptions =
    posStyle || sale.pointOfSale === 'mostrador'
      ? POS_PAYMENT_OPTIONS
      : TERMINAL_PAYMENT_OPTIONS;

  const customer = sale.customerId
    ? customers.find((c) => c.id === sale.customerId)
    : undefined;
  const customerName = customer?.name || 'Consumidor Final';

  const voucher = {
    docType: 'venta' as const,
    documentNumber: sale.id,
    date: sale.date,
    businessName: settings?.businessName || 'La Huevería',
    party: {
      sectionTitle: 'DESTINATARIO',
      name: customerName,
      taxId: customer?.cuit || null,
      contactName: customer?.contactName || null,
      address: customer?.address || null,
      phone: customer?.phone || null,
    },
    commercial: {
      condition: isCuentaCorrienteSale(sale) ? 'Cuenta Corriente' : 'Contado',
      paymentMethod: isCuentaCorrienteSale(sale)
        ? '—'
        : paymentMethodLabel(sale.paymentMethod),
      pointOfSale: sale.pointOfSale === 'mayorista' ? 'Mayorista' : 'Mostrador',
    },
    items: sale.items.map((i) => ({
      productName: products.find((p) => p.id === i.productId)?.name || 'Producto',
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      subtotal: i.subtotal,
    })),
    total: sale.total,
    voided: isVoided,
  };

  const getActiveList = (): PriceList | null => {
    const c = customerId ? customers.find((cust) => cust.id === customerId) : undefined;
    return resolvePriceList(priceLists, c?.priceListId);
  };

  const activeList = getActiveList();
  const editTotal = items.reduce((acc, i) => acc + i.subtotal, 0);

  const updateItem = (index: number, field: keyof SaleItem, value: string | number) => {
    const newItems = [...items];
    const item = { ...newItems[index] };
    if (field === 'productId') {
      const productId = value as string;
      if (productId && !hasSellablePrice(activeList, productId)) {
        toast.warning('Este producto no tiene precio en la lista del cliente.');
      }
      item.productId = productId;
      item.unitPrice = getListedPrice(activeList, productId) ?? 0;
    } else {
      (item as Record<string, unknown>)[field] = value;
    }
    item.subtotal = item.quantity * item.unitPrice;
    newItems[index] = item;
    setItems(newItems);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!editReason.trim()) {
      toast.error('Debés indicar un motivo para la edición.');
      return;
    }
    if (items.length === 0 || items.some((i) => !i.productId || i.quantity <= 0)) {
      toast.error('Agregá al menos un producto válido.');
      return;
    }
    if (saleHasUnsellableItems(items, editTotal)) {
      const ok = await confirm({
        title: 'Hay productos con precio en $0. ¿Querés guardar la venta igual?',
        confirmLabel: 'Sí, guardar',
      });
      if (!ok) return;
    }

    const resolvedCustomerId = posStyle ? sale.customerId : customerId;
    if (!resolvedCustomerId) {
      toast.error('Debés seleccionar un cliente.');
      return;
    }

    const resolvedCondition: SaleCondition =
      canChangeCondition ? condition : 'contado';
    if (resolvedCondition === 'contado' && !paymentMethod) {
      toast.error('Debés indicar el medio de pago.');
      return;
    }
    if (canChangeCondition && resolvedCondition === 'contado' && !accountId) {
      toast.error('Seleccioná la cuenta donde entra el cobro.');
      return;
    }

    for (const item of items) {
      const available = getAvailableStock(item.productId, sale, products);
      if (available < item.quantity) {
        const name = products.find((p) => p.id === item.productId)?.name || 'Producto';
        toast.error(`Stock insuficiente para ${name}. Disponible: ${available}`);
        return;
      }
    }

    const editCustomerName = customers.find((c) => c.id === resolvedCustomerId)?.name;

    setSubmitting(true);
    try {
      await salesDB.editSale(sale.id, user.id, editReason, {
        customerId: resolvedCustomerId,
        condition: resolvedCondition,
        paymentMethod: resolvedCondition === 'contado' ? paymentMethod : null,
        accountId: resolvedCondition === 'contado' ? (accountId || sale.accountId || null) : null,
        date: sale.date,
        items,
        customerName: editCustomerName,
      });
      toast.success('Venta actualizada correctamente.');
      try {
        await Promise.resolve(onUpdated());
      } catch {
        // La venta ya se guardó; cerrar igual aunque falle el refresh
      }
      onClose();
    } catch (err) {
      toast.error(getSaleRpcErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoid = async () => {
    if (!user) return;
    if (!voidReason.trim()) {
      toast.error('Debés indicar un motivo para la anulación.');
      return;
    }
    setSubmitting(true);
    try {
      await salesDB.voidSale(sale.id, user.id, voidReason);
      toast.success('Venta anulada correctamente.');
      try {
        await Promise.resolve(onUpdated());
      } catch {
        // La venta ya se anuló; cerrar igual aunque falle el refresh
      }
      onClose();
    } catch (err) {
      toast.error(getSaleRpcErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const title =
    mode === 'edit' ? 'Editar Venta' :
    mode === 'void' ? 'Anular Venta' :
    'Ticket de Venta';

  return (
    <Modal isOpen={!!sale} onClose={onClose} title={title} wide={mode === 'view'}>
      {mode === 'view' && (
        <div className="space-y-4">
          <div className="no-print">
            <PrintableVoucher {...voucher} className="voucher-preview" />
          </div>

          {typeof document !== 'undefined' &&
            createPortal(
              <div className="printable-ticket" aria-hidden="true">
                <PrintableVoucher {...voucher} />
              </div>,
              document.body,
            )}

          <p className="text-xs text-brand-muted no-print">
            Tip: en el diálogo de impresión, desactivá “Encabezados y pies de página” para no
            imprimir la fecha/URL del navegador.
          </p>

          <div className="flex justify-end gap-2 pt-4 border-t no-print">
            <Button variant="secondary" onClick={() => window.print()}>
              Imprimir
            </Button>
            {!isVoided && canEdit && (
              <Button variant="secondary" onClick={() => setMode('edit')}>Editar</Button>
            )}
            {!isVoided && canVoid && (
              <Button variant="danger" onClick={() => setMode('void')}>Anular</Button>
            )}
          </div>
          {!isVoided && !baseCanModify && user?.role === 'vendedor' && (
            <p className="text-xs text-brand-muted italic pt-2 no-print">
              Solo un administrador puede modificar ventas de cajas ya cerradas.
            </p>
          )}
        </div>
      )}

      {mode === 'edit' && (
        <form onSubmit={handleEditSave} className="space-y-4 no-print">
          {!posStyle && sale.pointOfSale === 'mayorista' && (
            <div>
              <label className="block text-sm mb-1">Cliente</label>
              <SearchableSelect
                options={namedCustomers.map((c) => ({ value: c.id, label: c.name }))}
                value={
                  customerId
                    ? {
                        value: customerId,
                        label: customers.find((c) => c.id === customerId)?.name,
                      }
                    : null
                }
                onChange={(selected: { value: string } | null) => {
                  setCustomerId(selected?.value || '');
                  setItems([]);
                }}
              />
            </div>
          )}
          {canChangeCondition && (
            <div>
              <label className="block text-sm mb-1">Condición</label>
              <SearchableSelect
                options={[
                  { value: 'contado', label: 'Contado' },
                  { value: 'cuenta_corriente', label: 'Cuenta Corriente' },
                ]}
                value={{
                  value: condition,
                  label: condition === 'cuenta_corriente' ? 'Cuenta Corriente' : 'Contado',
                }}
                onChange={(selected: { value: string } | null) => {
                  const next = (selected?.value === 'cuenta_corriente'
                    ? 'cuenta_corriente'
                    : 'contado') as SaleCondition;
                  setCondition(next);
                  if (next === 'contado' && !paymentMethod) {
                    setPaymentMethod(paymentOptions[0].value);
                  }
                }}
              />
            </div>
          )}
          {condition === 'contado' ? (
            <div>
              <label className="block text-sm mb-1">Medio de Pago</label>
              <SearchableSelect
                options={paymentOptions}
                value={
                  paymentOptions.find((o) => o.value === paymentMethod) ??
                  paymentOptions[0]
                }
                onChange={(selected: { value: string } | null) =>
                  setPaymentMethod(
                    (selected?.value as PaymentMethodCode) || paymentOptions[0].value,
                  )
                }
              />
            </div>
          ) : (
            <p className="text-xs text-brand-muted italic">
              Sin cobro: solo Debe en la cuenta del cliente. No ingresa a caja.
            </p>
          )}
          {canChangeCondition && condition === 'contado' && (
            <TreasuryAccountSelect
              accounts={arsAccounts}
              value={accountId}
              onChange={setAccountId}
              label="¿En qué cuenta entra el cobro?"
            />
          )}

          <div className="border-t pt-4 space-y-2 max-h-48 overflow-y-auto">
            {items.map((item, index) => (
              <div key={index} className="flex gap-2 items-center bg-gray-50 p-2 rounded border">
                <div className="flex-1">
                  <SearchableSelect
                    options={products.map((p) => ({
                      value: p.id,
                      label: hasSellablePrice(activeList, p.id)
                        ? `${p.name} (${getAvailableStock(p.id, sale, products)} ${p.unit} disp.)`
                        : `${p.name} — Sin precio`,
                    }))}
                    value={
                      item.productId
                        ? {
                            value: item.productId,
                            label: hasSellablePrice(activeList, item.productId)
                              ? `${products.find((p) => p.id === item.productId)?.name} (${getAvailableStock(item.productId, sale, products)} disp.)`
                              : `${products.find((p) => p.id === item.productId)?.name} — Sin precio`,
                          }
                        : null
                    }
                    onChange={(selected: { value: string } | null) =>
                      updateItem(index, 'productId', selected?.value || '')
                    }
                    placeholder="Producto..."
                  />
                </div>
                <input
                  type="number"
                  min="1"
                  className="w-16 border p-2 rounded text-sm h-[38px]"
                  value={item.quantity}
                  onChange={(e) => updateItem(index, 'quantity', Number(e.target.value))}
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-24 border p-2 rounded text-sm h-[38px]"
                  value={item.unitPrice}
                  onChange={(e) => updateItem(index, 'unitPrice', Number(e.target.value))}
                />
                <div className="w-20 text-right text-sm">{formatCurrency(item.subtotal)}</div>
                <button
                  type="button"
                  onClick={() => setItems(items.filter((_, i) => i !== index))}
                  className="text-red-500 px-1 font-bold"
                >
                  ×
                </button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                setItems([...items, { productId: '', quantity: 1, unitPrice: 0, subtotal: 0 }])
              }
            >
              + Agregar producto
            </Button>
          </div>

          <div className="text-right font-bold text-lg text-green-700">
            Total: {formatCurrency(editTotal)}
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">
              Motivo de la edición <span className="text-brand-danger">*</span>
            </label>
            <textarea
              required
              className="w-full border border-brand-border rounded-lg p-2 text-sm"
              rows={2}
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              placeholder="Ej: el cliente pidió un maple más..."
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              Guardar cambios
            </Button>
          </div>
        </form>
      )}

      {mode === 'void' && (
        <div className="space-y-4 no-print">
          <p className="text-sm text-brand-muted">
            {isCuentaCorrienteSale(sale)
              ? 'Esta acción revertirá el stock y anulará el Debe en la cuenta corriente. No se puede deshacer.'
              : 'Esta acción revertirá el stock, el cobro en cuenta corriente y el ingreso en caja. No se puede deshacer.'}
          </p>
          <p className="text-sm">
            Ticket <strong>#{sale.id.slice(0, 8).toUpperCase()}</strong> —{' '}
            {formatCurrency(sale.total)}
          </p>
          <div>
            <label className="block text-sm font-semibold mb-1">
              Motivo de la anulación <span className="text-brand-danger">*</span>
            </label>
            <textarea
              className="w-full border border-brand-border rounded-lg p-2 text-sm"
              rows={3}
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Ej: error en el cobro, cliente devolvió la mercadería..."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" autoFocus onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="danger" disabled={submitting} onClick={handleVoid}>
              Sí, anular
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
