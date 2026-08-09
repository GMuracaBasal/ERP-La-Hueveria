import React, { useEffect, useState } from 'react';
import { purchasesDB } from '../lib/db';
import { Purchase, PurchaseItem, Product, Supplier } from '../types';
import { Button, Modal, Badge, SearchableSelect, useToast } from './ui';
import { formatCurrency, formatFechaHora } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { canModifyPurchase, getPurchaseErrorMessage } from '../lib/purchasePermissions';

type Mode = 'view' | 'edit' | 'void';

interface PurchaseTicketModalProps {
  purchase: Purchase | null;
  onClose: () => void;
  onUpdated: () => void;
  products: Product[];
  suppliers: Supplier[];
  initialMode?: Mode;
}

function getAvailableStockAfterVoid(
  productId: string,
  original: Purchase,
  products: Product[],
): number {
  const p = products.find((x) => x.id === productId);
  if (!p) return 0;
  // Al editar se revierten las entradas; el stock "disponible" para mostrar
  // es el actual menos lo que esta compra había sumado (porque se va a revertir).
  const originalQty = original.items
    .filter((i) => i.productId === productId)
    .reduce((a, i) => a + i.quantity, 0);
  return Math.max(0, p.stock - originalQty);
}

export default function PurchaseTicketModal({
  purchase,
  onClose,
  onUpdated,
  products,
  suppliers,
  initialMode = 'view',
}: PurchaseTicketModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('view');
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [editReason, setEditReason] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!purchase) return;
    const baseCan = canModifyPurchase(user, purchase);
    let next: Mode = initialMode;
    if (initialMode === 'edit' && !baseCan) next = 'view';
    if (initialMode === 'void' && !baseCan) next = 'view';
    setMode(next);
    setSupplierId(purchase.supplierId);
    setInvoiceNumber(purchase.invoiceNumber);
    setNotes(purchase.notes);
    setItems(purchase.items.map((i) => ({ ...i })));
    setEditReason('');
    setVoidReason('');
  }, [purchase, initialMode, user]);

  if (!purchase) return null;

  const isVoided = !!purchase.voided;
  const canModify = canModifyPurchase(user, purchase);
  const supplierName = suppliers.find((s) => s.id === purchase.supplierId)?.name;
  const editTotal = items.reduce((acc, i) => acc + i.subtotal, 0);

  const updateItem = (index: number, field: keyof PurchaseItem, value: string | number) => {
    const newItems = [...items];
    const item = { ...newItems[index] };
    if (field === 'productId') {
      item.productId = value as string;
      const p = products.find((x) => x.id === value);
      item.unitCost = p?.costPrice ?? 0;
    } else if (field === 'quantity') {
      item.quantity = value as number;
    } else if (field === 'unitCost') {
      item.unitCost = value as number;
    }
    item.subtotal = item.quantity * item.unitCost;
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
    if (!supplierId) {
      toast.error('Debés seleccionar un proveedor.');
      return;
    }
    if (items.length === 0 || items.some((i) => !i.productId || i.quantity <= 0)) {
      toast.error('Agregá al menos un producto válido.');
      return;
    }

    setSubmitting(true);
    try {
      await purchasesDB.editPurchase(purchase.id, user.id, editReason, {
        supplierId,
        invoiceNumber,
        notes,
        date: purchase.date,
        items,
        supplierName: suppliers.find((s) => s.id === supplierId)?.name,
      });
      toast.success('Compra actualizada correctamente.');
      try {
        await Promise.resolve(onUpdated());
      } catch {
        /* ignore refresh errors */
      }
      onClose();
    } catch (err) {
      toast.error(getPurchaseErrorMessage(err));
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
      await purchasesDB.voidPurchase(purchase.id, user.id, voidReason);
      toast.success('Compra anulada correctamente.');
      try {
        await Promise.resolve(onUpdated());
      } catch {
        /* ignore */
      }
      onClose();
    } catch (err) {
      toast.error(getPurchaseErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const title =
    mode === 'edit' ? 'Editar Compra' :
    mode === 'void' ? 'Anular Compra' :
    'Comprobante de Compra';

  return (
    <Modal isOpen={!!purchase} onClose={onClose} title={title}>
      {mode === 'view' && (
        <div className="space-y-4">
          <div className="text-center pb-4 border-b border-dashed">
            {isVoided && <Badge variant="danger" className="mb-2">ANULADO</Badge>}
            <div className="text-sm text-gray-500">
              Compra #{purchase.id.slice(0, 8).toUpperCase()}
            </div>
            <div className="text-sm text-gray-500">{formatFechaHora(purchase.date)}</div>
          </div>
          <div className="text-sm space-y-1">
            <div>
              <span className="font-semibold">Proveedor:</span> {supplierName || '—'}
            </div>
            <div>
              <span className="font-semibold">Factura:</span>{' '}
              {purchase.invoiceNumber || 'S/N'}
            </div>
          </div>
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b">
                <th className="p-1">Producto</th>
                <th className="p-1 text-center">Cant</th>
                <th className="p-1 text-right">Costo U.</th>
                <th className="p-1 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {purchase.items.map((i, idx) => (
                <tr key={idx}>
                  <td className="p-1 pr-2">
                    {products.find((p) => p.id === i.productId)?.name}
                  </td>
                  <td className="p-1 text-center">{i.quantity}</td>
                  <td className="p-1 text-right">{formatCurrency(i.unitCost)}</td>
                  <td className="p-1 text-right">{formatCurrency(i.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t pt-4 flex justify-between font-bold text-lg">
            <span>TOTAL</span>
            <span className={isVoided ? 'line-through text-gray-400' : ''}>
              {formatCurrency(purchase.total)}
            </span>
          </div>
          {purchase.notes ? (
            <p className="text-sm text-brand-muted">
              <span className="font-semibold text-gray-700">Notas:</span> {purchase.notes}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-4 border-t">
            {!isVoided && canModify && (
              <>
                <Button variant="secondary" onClick={() => setMode('edit')}>Editar</Button>
                <Button variant="danger" onClick={() => setMode('void')}>Anular</Button>
              </>
            )}
          </div>
          {!isVoided && !canModify && user?.role === 'vendedor' && (
            <p className="text-xs text-brand-muted italic">
              Solo un administrador puede modificar compras de días ya cerrados.
            </p>
          )}
        </div>
      )}

      {mode === 'edit' && (
        <form onSubmit={handleEditSave} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">Proveedor</label>
            <SearchableSelect
              options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
              value={
                supplierId
                  ? {
                      value: supplierId,
                      label: suppliers.find((s) => s.id === supplierId)?.name,
                    }
                  : null
              }
              onChange={(selected: { value: string } | null) =>
                setSupplierId(selected?.value || '')
              }
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Factura / Remito</label>
            <input
              className="w-full border p-2 rounded-lg text-sm"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Notas</label>
            <textarea
              className="w-full border p-2 rounded-lg text-sm"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="border-t pt-4 space-y-2 max-h-48 overflow-y-auto">
            {items.map((item, index) => (
              <div key={index} className="flex gap-2 items-center bg-gray-50 p-2 rounded border">
                <div className="flex-1">
                  <SearchableSelect
                    options={products.map((p) => ({
                      value: p.id,
                      label: `${p.name} (stock ${getAvailableStockAfterVoid(p.id, purchase, products)})`,
                    }))}
                    value={
                      item.productId
                        ? {
                            value: item.productId,
                            label: products.find((p) => p.id === item.productId)?.name,
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
                  value={item.unitCost}
                  onChange={(e) => updateItem(index, 'unitCost', Number(e.target.value))}
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
                setItems([...items, { productId: '', quantity: 1, unitCost: 0, subtotal: 0 }])
              }
            >
              + Agregar producto
            </Button>
          </div>

          <div className="text-right font-bold text-lg">
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
              placeholder="Ej: corrección de cantidad / costo..."
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
            Esta acción revertirá el stock, el asiento en cuenta corriente del proveedor y el
            egreso en caja. No se puede deshacer.
          </p>
          <p className="text-sm">
            Compra <strong>#{purchase.id.slice(0, 8).toUpperCase()}</strong> —{' '}
            {formatCurrency(purchase.total)}
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
              placeholder="Ej: factura duplicada, mercadería no recibida..."
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
