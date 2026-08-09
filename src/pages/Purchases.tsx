import React, { useState, useEffect, useMemo } from 'react';
import { purchasesDB, suppliersDB, productsDB } from '../lib/db';
import { Purchase, PurchaseItem, Supplier, Product, PurchaseCondition } from '../types';
import { Button, Modal, Badge, SearchableSelect, DocumentActions, useToast } from '../components/ui';
import PurchaseTicketModal from '../components/PurchaseTicketModal';
import FiltroFechas, { defaultDateRange, isDateInRange } from '../components/FiltroFechas';
import InputFecha from '../components/InputFecha';
import { generateId, formatCurrency, formatFechaHora, isoDateToTimestamp, todayISODate } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { canModifyPurchase, getPurchaseErrorMessage } from '../lib/purchasePermissions';
import {
  TERMINAL_PAYMENT_OPTIONS,
  paymentMethodLabel,
  type PaymentMethodCode,
} from '../lib/paymentMethods';

export default function Purchases() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [dateRange, setDateRange] = useState(defaultDateRange);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [detailsModal, setDetailsModal] = useState<Purchase | null>(null);
  const [ticketMode, setTicketMode] = useState<'view' | 'edit' | 'void'>('view');

  const [formData, setFormData] = useState({ supplierId: '', invoiceNumber: '', notes: '' });
  const [condition, setCondition] = useState<PurchaseCondition>('contado');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodCode>('efectivo');
  const [purchaseDate, setPurchaseDate] = useState(todayISODate);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const conditionLabel = (c: PurchaseCondition) =>
    c === 'cuenta_corriente' ? 'Cuenta Corriente' : 'Contado';

  const filteredPurchases = useMemo(
    () => purchases.filter((p) => isDateInRange(p.date, dateRange.from, dateRange.to)),
    [purchases, dateRange],
  );

  const load = async () => {
    const allPurchases = await purchasesDB.getAll({ includeVoided: true });
    setPurchases(allPurchases.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setSuppliers(await suppliersDB.getAll());
    setProducts(await productsDB.getAll());
  };
  useEffect(() => { load(); }, []);

  const openTicket = (p: Purchase, mode: 'view' | 'edit' | 'void' = 'view') => {
    setTicketMode(mode);
    setDetailsModal(p);
  };

  const handleOpenModal = () => {
    setFormData({ supplierId: '', invoiceNumber: '', notes: '' });
    setCondition('contado');
    setPaymentMethod('efectivo');
    setPurchaseDate(todayISODate());
    setItems([]);
    setIsModalOpen(true);
  };

  const addItem = () => setItems([...items, { productId: '', quantity: 1, unitCost: 0, subtotal: 0 }]);

  const updateItem = (index: number, field: keyof PurchaseItem, value: string | number) => {
    const newItems = [...items];
    const item = newItems[index];

    if (field === 'productId') {
      const p = products.find((prod) => prod.id === value);
      item.productId = value as string;
      item.unitCost = p ? p.costPrice : 0;
    } else if (field === 'quantity') {
      item.quantity = value as number;
    } else if (field === 'unitCost') {
      item.unitCost = value as number;
    }

    item.subtotal = item.quantity * item.unitCost;
    setItems(newItems);
  };

  const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index));

  const total = items.reduce((acc, curr) => acc + curr.subtotal, 0);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!formData.supplierId) {
      toast.error('Seleccioná un proveedor.');
      return;
    }
    if (items.length === 0 || items.some((i) => !i.productId || i.quantity <= 0)) {
      toast.error('Agregá productos válidos.');
      return;
    }
    if (condition === 'contado' && !paymentMethod) {
      toast.error('Debés indicar el medio de pago.');
      return;
    }

    setSubmitting(true);
    try {
      const purchaseDateIso = isoDateToTimestamp(purchaseDate);
      const supplierName = suppliers.find((s) => s.id === formData.supplierId)?.name;
      await purchasesDB.createPurchase({
        userId: user.id,
        supplierName,
        purchase: {
          id: generateId(),
          date: purchaseDateIso,
          ...formData,
          condition,
          paymentMethod: condition === 'contado' ? paymentMethod : null,
          total,
          items,
        },
      });

      toast.success(
        condition === 'cuenta_corriente'
          ? 'Compra en cuenta corriente registrada (sin egreso de caja).'
          : 'Compra registrada correctamente.',
      );
      setIsModalOpen(false);
      load();
    } catch (err) {
      toast.error(getPurchaseErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4 border-b pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Compras (Ingreso Stock)</h1>
        <div className="flex flex-wrap items-center gap-3">
          <FiltroFechas from={dateRange.from} to={dateRange.to} onChange={setDateRange} />
          <Button onClick={handleOpenModal}>Registrar Compra</Button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-brand-border flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-brand-border flex justify-between items-center bg-brand-cream/30">
          <h2 className="font-bold text-brand-brown flex items-center gap-2">
            <span className="w-2 h-4 bg-brand-orange rounded-full"></span>
            Listado de Compras
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[10px] uppercase text-white font-bold bg-brand-navy">
              <tr>
                <th className="px-6 py-3 text-left">Fecha</th>
                <th className="px-6 py-3 text-left">Proveedor / Factura</th>
                <th className="px-6 py-3 text-left">Condición</th>
                <th className="px-6 py-3 text-left">Medio Pago</th>
                <th className="px-6 py-3 text-left">Total</th>
                <th className="px-6 py-3 text-left">Estado</th>
                <th className="px-6 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-sm text-gray-600">
              {filteredPurchases.map((p) => {
                const canMod = canModifyPurchase(user, p);
                return (
                  <tr
                    key={p.id}
                    className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${p.voided ? 'opacity-60' : ''}`}
                  >
                    <td className="px-6 py-3">{formatFechaHora(p.date)}</td>
                    <td className="px-6 py-3">
                      <div className="font-medium text-gray-900">
                        {suppliers.find((s) => s.id === p.supplierId)?.name || 'N/A'}
                      </div>
                      <div className="text-xs text-gray-500">{p.invoiceNumber || 'S/N'}</div>
                    </td>
                    <td className="px-6 py-3">
                      <Badge variant={p.condition === 'cuenta_corriente' ? 'warning' : 'default'}>
                        {conditionLabel(p.condition)}
                      </Badge>
                    </td>
                    <td className="px-6 py-3">
                      {p.paymentMethod
                        ? <Badge variant="default">{paymentMethodLabel(p.paymentMethod)}</Badge>
                        : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                    <td className={`px-6 py-3 font-bold ${p.voided ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                      {formatCurrency(p.total)}
                    </td>
                    <td className="px-6 py-3">
                      {p.voided
                        ? <Badge variant="danger">ANULADO</Badge>
                        : <Badge variant="success">ACTIVA</Badge>}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <DocumentActions
                        onView={() => openTicket(p, 'view')}
                        onEdit={() => openTicket(p, 'edit')}
                        onVoid={() => openTicket(p, 'void')}
                        canEdit={canMod}
                        canVoid={canMod}
                      />
                    </td>
                  </tr>
                );
              })}
              {filteredPurchases.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    No hay compras en el período seleccionado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Registrar Nueva Compra">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">Fecha</label>
            <InputFecha
              value={purchaseDate}
              onChange={setPurchaseDate}
              disabled={user?.role !== 'admin'}
              required
              maxDate={new Date()}
              className="w-full max-w-[10rem]"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1">Proveedor</label>
              <SearchableSelect
                options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                value={
                  formData.supplierId
                    ? {
                        value: formData.supplierId,
                        label: suppliers.find((s) => s.id === formData.supplierId)?.name,
                      }
                    : null
                }
                onChange={(selected: { value: string } | null) =>
                  setFormData({ ...formData, supplierId: selected?.value || '' })
                }
                placeholder="Seleccione..."
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Factura / Remito (Opcional)</label>
              <input
                className="w-full border p-2 rounded-lg"
                value={formData.invoiceNumber}
                onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1">Condición</label>
              <SearchableSelect
                options={[
                  { value: 'contado', label: 'Contado' },
                  { value: 'cuenta_corriente', label: 'Cuenta Corriente' },
                ]}
                value={{
                  value: condition,
                  label: conditionLabel(condition),
                }}
                onChange={(selected: { value: string } | null) => {
                  const next = (selected?.value === 'cuenta_corriente'
                    ? 'cuenta_corriente'
                    : 'contado') as PurchaseCondition;
                  setCondition(next);
                  if (next === 'contado' && !paymentMethod) setPaymentMethod('efectivo');
                }}
              />
            </div>
            {condition === 'contado' ? (
              <div>
                <label className="block text-sm mb-1">Medio de Pago</label>
                <SearchableSelect
                  options={TERMINAL_PAYMENT_OPTIONS}
                  value={
                    TERMINAL_PAYMENT_OPTIONS.find((o) => o.value === paymentMethod) ??
                    TERMINAL_PAYMENT_OPTIONS[0]
                  }
                  onChange={(selected: { value: string } | null) =>
                    setPaymentMethod((selected?.value as PaymentMethodCode) || 'efectivo')
                  }
                  placeholder="Seleccionar medio..."
                />
              </div>
            ) : (
              <div className="flex items-end">
                <p className="text-xs text-brand-muted italic pb-2">
                  Sin pago: asienta Haber en la cuenta del proveedor. No egresa de caja.
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm mb-1">Notas</label>
            <textarea
              className="w-full border p-2 rounded-lg"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <div className="border-t pt-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-medium text-gray-900">Productos</h3>
              <Button type="button" size="sm" variant="secondary" onClick={addItem}>
                + Agregar Fila
              </Button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
              {items.map((item, index) => (
                <div key={index} className="flex gap-2 items-center bg-gray-50 p-2 rounded border">
                  <div className="flex-1">
                    <SearchableSelect
                      options={products.map((p) => ({ value: p.id, label: p.name }))}
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
                    className="w-20 border p-2 rounded text-sm h-[38px]"
                    placeholder="Cant"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, 'quantity', Number(e.target.value))}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-24 border p-2 rounded text-sm h-[38px]"
                    placeholder="Costo Un."
                    value={item.unitCost}
                    onChange={(e) => updateItem(index, 'unitCost', Number(e.target.value))}
                  />
                  <div className="w-24 text-right font-medium text-sm">
                    {formatCurrency(item.subtotal)}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="text-red-500 hover:text-red-700 px-2 font-bold"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            {items.length > 0 && (
              <div className="text-right text-lg font-bold mt-4 pt-4 border-t text-gray-900">
                Total: {formatCurrency(total)}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Guardando…' : 'Confirmar Compra'}
            </Button>
          </div>
        </form>
      </Modal>

      <PurchaseTicketModal
        purchase={detailsModal}
        onClose={() => setDetailsModal(null)}
        onUpdated={load}
        products={products}
        suppliers={suppliers}
        initialMode={ticketMode}
      />
    </div>
  );
}
