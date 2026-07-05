import React, { useState, useEffect } from 'react';
import { salesDB } from '../lib/db';
import { Sale, SaleItem, Product, Customer, PriceList, Settings } from '../types';
import { Button, Modal, Badge, SearchableSelect, useToast } from '../components/ui';
import { formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import {
  canModifySale,
  isMostradorContadoSale,
  getSaleRpcErrorMessage,
} from '../lib/salePermissions';

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
}

const POS_PAYMENT_OPTIONS = [
  { value: 'Efectivo', label: 'Efectivo' },
  { value: 'QR / Transferencia', label: 'QR / Transferencia' },
];

const TERMINAL_PAYMENT_OPTIONS = [
  { value: 'Efectivo', label: 'Efectivo' },
  { value: 'Transferencia', label: 'Transferencia' },
  { value: 'Tarjeta de Débito', label: 'Tarjeta de Débito' },
  { value: 'Tarjeta de Crédito', label: 'Tarjeta de Crédito' },
];

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
}: SaleTicketModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('view');
  const [customerId, setCustomerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Efectivo');
  const [items, setItems] = useState<SaleItem[]>([]);
  const [editReason, setEditReason] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!sale) return;
    setMode('view');
    setCustomerId(sale.customerId || '');
    setPaymentMethod(sale.paymentMethod);
    setItems(sale.items.map((i) => ({ ...i })));
    setEditReason('');
    setVoidReason('');
  }, [sale]);

  if (!sale) return null;

  const isVoided = !!sale.voided;
  const canModify = canModifySale(user, sale) && isMostradorContadoSale(sale);
  const paymentOptions = posStyle || sale.customerId === null ? POS_PAYMENT_OPTIONS : TERMINAL_PAYMENT_OPTIONS;

  const getActivePrices = (): Record<string, number> => {
    let targetListId = settings?.defaultPriceListId;
    if (customerId) {
      const c = customers.find((c) => c.id === customerId);
      if (c?.priceListId) targetListId = c.priceListId;
    }
    const list = priceLists.find((l) => l.id === targetListId);
    return list?.prices ?? {};
  };

  const activePrices = getActivePrices();
  const editTotal = items.reduce((acc, i) => acc + i.subtotal, 0);

  const updateItem = (index: number, field: keyof SaleItem, value: string | number) => {
    const newItems = [...items];
    const item = { ...newItems[index] };
    if (field === 'productId') {
      item.productId = value as string;
      item.unitPrice = activePrices[value as string] || 0;
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
    for (const item of items) {
      const available = getAvailableStock(item.productId, sale, products);
      if (available < item.quantity) {
        const name = products.find((p) => p.id === item.productId)?.name || 'Producto';
        toast.error(`Stock insuficiente para ${name}. Disponible: ${available}`);
        return;
      }
    }

    setSubmitting(true);
    try {
      await salesDB.editSale(sale.id, user.id, editReason, {
        customerId: posStyle ? null : customerId || null,
        paymentMethod,
        date: sale.date,
        items,
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
    <Modal isOpen={!!sale} onClose={onClose} title={title}>
      {mode === 'view' && (
        <div className="space-y-4">
          <div className="text-center pb-4 border-b border-dashed relative">
            {isVoided && (
              <Badge variant="danger" className="mb-2">ANULADO</Badge>
            )}
            <h2 className="text-lg font-bold">{settings?.businessName}</h2>
            <div className="text-sm text-gray-500">Ticket #{sale.id.slice(0, 8).toUpperCase()}</div>
            <div className="text-sm text-gray-500">
              {format(new Date(sale.date), 'dd/MM/yyyy HH:mm')}
            </div>
          </div>
          <div className="text-sm">
            <span className="font-semibold">Cliente:</span>{' '}
            {sale.customerId
              ? customers.find((c) => c.id === sale.customerId)?.name
              : 'Consumidor Final'}
            <br />
            <span className="font-semibold">Pago:</span> {sale.paymentMethod}
          </div>
          <table className="w-full text-sm text-left font-mono">
            <thead>
              <tr className="border-b">
                <th className="p-1">Desc</th>
                <th className="p-1 text-center">Cant</th>
                <th className="p-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((i, idx) => (
                <tr key={idx}>
                  <td className="p-1 pr-2 truncate max-w-[200px]">
                    {products.find((p) => p.id === i.productId)?.name}
                  </td>
                  <td className="p-1 text-center">{i.quantity}</td>
                  <td className="p-1 text-right">{formatCurrency(i.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-dashed pt-4 flex justify-between items-end font-bold text-lg">
            <span>TOTAL</span>
            <span className={isVoided ? 'line-through text-gray-400' : ''}>
              {formatCurrency(sale.total)}
            </span>
          </div>

          {!isVoided && canModify && (
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="secondary" onClick={() => setMode('edit')}>Editar</Button>
              <Button variant="danger" onClick={() => setMode('void')}>Anular</Button>
            </div>
          )}
          {!isVoided && !canModify && isMostradorContadoSale(sale) && user?.role === 'vendedor' && (
            <p className="text-xs text-brand-muted italic pt-2">
              Solo un administrador puede modificar ventas de cajas ya cerradas.
            </p>
          )}
          {!isVoided && !isMostradorContadoSale(sale) && (
            <p className="text-xs text-brand-muted italic pt-2">
              Las ventas en Cuenta Corriente no pueden modificarse en esta etapa.
            </p>
          )}
        </div>
      )}

      {mode === 'edit' && (
        <form onSubmit={handleEditSave} className="space-y-4">
          {!posStyle && (
            <div>
              <label className="block text-sm mb-1">Cliente</label>
              <SearchableSelect
                options={[
                  { value: '', label: 'Consumidor Final' },
                  ...customers.map((c) => ({ value: c.id, label: c.name })),
                ]}
                value={
                  customerId
                    ? { value: customerId, label: customers.find((c) => c.id === customerId)?.name }
                    : { value: '', label: 'Consumidor Final' }
                }
                onChange={(selected: { value: string } | null) => {
                  setCustomerId(selected?.value || '');
                  setItems([]);
                }}
              />
            </div>
          )}
          <div>
            <label className="block text-sm mb-1">Medio de Pago</label>
            <SearchableSelect
              options={paymentOptions}
              value={{ value: paymentMethod, label: paymentMethod }}
              onChange={(selected: { value: string } | null) =>
                setPaymentMethod(selected?.value || paymentOptions[0].value)
              }
            />
          </div>

          <div className="border-t pt-4 space-y-2 max-h-48 overflow-y-auto">
            {items.map((item, index) => (
              <div key={index} className="flex gap-2 items-center bg-gray-50 p-2 rounded border">
                <div className="flex-1">
                  <SearchableSelect
                    options={products.map((p) => ({
                      value: p.id,
                      label: `${p.name} (${getAvailableStock(p.id, sale, products)} ${p.unit} disp.)`,
                    }))}
                    value={
                      item.productId
                        ? {
                            value: item.productId,
                            label: `${products.find((p) => p.id === item.productId)?.name} (${getAvailableStock(item.productId, sale, products)} disp.)`,
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
        <div className="space-y-4">
          <p className="text-sm text-brand-muted">
            Esta acción revertirá el stock y el ingreso en caja. No se puede deshacer.
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
