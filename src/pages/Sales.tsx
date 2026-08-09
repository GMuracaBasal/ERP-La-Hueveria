import React, { useState, useEffect, useMemo } from 'react';
import { salesDB, customersDB, productsDB, priceListsDB, db } from '../lib/db';
import { Sale, SaleItem, Customer, Product, PriceList, Settings, SaleCondition } from '../types';
import { Button, Modal, Badge, SearchableSelect, DocumentActions, useToast } from '../components/ui';
import SaleTicketModal from '../components/SaleTicketModal';
import InputFecha from '../components/InputFecha';
import FiltroFechas, { defaultDateRange, isDateInRange } from '../components/FiltroFechas';
import { generateId, formatCurrency, formatFechaHora, isoDateToTimestamp, todayISODate } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { isConsumidorFinal } from '../lib/consumidorFinal';
import {
  canModifySale,
  getSaleRpcErrorMessage,
} from '../lib/salePermissions';
import {
  TERMINAL_PAYMENT_OPTIONS,
  paymentMethodLabel,
  type PaymentMethodCode,
} from '../lib/paymentMethods';

export default function Sales() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [dateRange, setDateRange] = useState(defaultDateRange);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [detailsModal, setDetailsModal] = useState<Sale | null>(null);
  const [ticketMode, setTicketMode] = useState<'view' | 'edit' | 'void'>('view');

  const openTicket = (sale: Sale, mode: 'view' | 'edit' | 'void' = 'view') => {
    setTicketMode(mode);
    setDetailsModal(sale);
  };

  const [customerId, setCustomerId] = useState('');
  const [condition, setCondition] = useState<SaleCondition>('contado');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodCode>('efectivo');
  const [saleDate, setSaleDate] = useState(todayISODate);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [settings, setSettings] = useState<Settings | null>(null);

  const namedCustomers = useMemo(
    () => customers.filter((c) => !isConsumidorFinal(c)),
    [customers],
  );

  const filteredSales = useMemo(
    () =>
      sales
        .filter((s) => s.pointOfSale === 'mayorista')
        .filter((s) => isDateInRange(s.date, dateRange.from, dateRange.to)),
    [sales, dateRange],
  );

  const load = async () => {
    const allSales = await salesDB.getAll({ includeVoided: true });
    setSales(allSales.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setCustomers(await customersDB.getAll());
    setProducts(await productsDB.getAll());
    setPriceLists(await priceListsDB.getAll());
  };

  useEffect(() => {
    (async () => {
      setSettings(await db.getSettings());
      load();
    })();
  }, []);

  const getActivePrices = (): Record<string, number> => {
    let targetListId = settings?.defaultPriceListId;
    if (customerId) {
      const c = customers.find((c) => c.id === customerId);
      if (c?.priceListId) targetListId = c.priceListId;
    }
    const list = priceLists.find((l) => l.id === targetListId);
    return list ? list.prices : {};
  };

  const activePrices = getActivePrices();

  const handleOpenModal = () => {
    setCustomerId('');
    setCondition('contado');
    setPaymentMethod('efectivo');
    setSaleDate(todayISODate());
    setItems([]);
    setIsModalOpen(true);
  };

  const addItem = () => setItems([...items, { productId: '', quantity: 1, unitPrice: 0, subtotal: 0 }]);

  const updateItem = (index: number, field: keyof SaleItem, value: string | number) => {
    const newItems = [...items];
    const item = newItems[index];

    if (field === 'productId') {
      item.productId = value as string;
      item.unitPrice = activePrices[value as string] || 0;
    } else if (field === 'quantity') {
      item.quantity = value as number;
    } else if (field === 'unitPrice') {
      item.unitPrice = value as number;
    }

    item.subtotal = item.quantity * item.unitPrice;
    setItems(newItems);
  };

  const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index));

  const total = items.reduce((acc, curr) => acc + curr.subtotal, 0);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!customerId) {
      toast.error('Debés seleccionar un cliente.');
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

    for (const item of items) {
      const p = products.find((p) => p.id === item.productId);
      if (p && p.stock < item.quantity) {
        toast.error(`Stock insuficiente para el producto: ${p.name}. (Disponible: ${p.stock})`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const saleId = generateId();
      const dateStr = isoDateToTimestamp(saleDate);
      const customerName = namedCustomers.find((c) => c.id === customerId)?.name;

      await salesDB.createSale({
        userId: user.id,
        customerName,
        sale: {
          id: saleId,
          date: dateStr,
          customerId,
          pointOfSale: 'mayorista',
          condition,
          paymentMethod: condition === 'contado' ? paymentMethod : null,
          total,
          items,
        },
      });

      toast.success(
        condition === 'cuenta_corriente'
          ? 'Venta en cuenta corriente registrada (sin ingreso a caja).'
          : 'Venta registrada correctamente.',
      );
      setIsModalOpen(false);
      load();
    } catch (err) {
      toast.error(getSaleRpcErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const conditionLabel = (c: SaleCondition) =>
    c === 'cuenta_corriente' ? 'Cuenta Corriente' : 'Contado';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ventas (Mayorista)</h1>
          <p className="text-sm text-gray-500 mt-1">
            Cliente obligatorio · Contado o Cuenta Corriente
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <FiltroFechas from={dateRange.from} to={dateRange.to} onChange={setDateRange} />
          <Button onClick={handleOpenModal} size="lg" className="shadow-md">Nueva Venta</Button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-brand-border flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-brand-border flex justify-between items-center bg-brand-cream/30">
          <h2 className="font-bold text-brand-brown flex items-center gap-2">
            <span className="w-2 h-4 bg-brand-orange rounded-full"></span>
            Historial de Ventas Mayoristas
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[10px] uppercase text-white font-bold bg-brand-navy">
              <tr>
                <th className="px-6 py-3 text-left">Fecha</th>
                <th className="px-6 py-3 text-left">Cliente</th>
                <th className="px-6 py-3 text-left">Condición</th>
                <th className="px-6 py-3 text-left">Medio Pago</th>
                <th className="px-6 py-3 text-left">Total</th>
                <th className="px-6 py-3 text-left">Estado</th>
                <th className="px-6 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-sm text-gray-600">
              {filteredSales.map((s) => {
                const canMod = canModifySale(user, s);
                return (
                <tr
                  key={s.id}
                  className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${s.voided ? 'opacity-60' : ''}`}
                >
                  <td className="px-6 py-3">{formatFechaHora(s.date)}</td>
                  <td className="px-6 py-3 font-medium text-gray-800">
                    {s.customerId
                      ? customers.find((c) => c.id === s.customerId)?.name ?? '—'
                      : <span className="text-gray-500 italic">Consumidor Final</span>}
                  </td>
                  <td className="px-6 py-3">
                    <Badge variant={s.condition === 'cuenta_corriente' ? 'warning' : 'default'}>
                      {conditionLabel(s.condition)}
                    </Badge>
                  </td>
                  <td className="px-6 py-3">
                    {s.paymentMethod
                      ? <Badge variant="default">{paymentMethodLabel(s.paymentMethod)}</Badge>
                      : <span className="text-gray-400 text-xs">—</span>}
                  </td>
                  <td className={`px-6 py-3 font-bold ${s.voided ? 'text-gray-400 line-through' : 'text-green-700'}`}>
                    {formatCurrency(s.total)}
                  </td>
                  <td className="px-6 py-3">
                    {s.voided ? <Badge variant="danger">ANULADO</Badge> : <Badge variant="success">ACTIVA</Badge>}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <DocumentActions
                      onView={() => openTicket(s, 'view')}
                      onEdit={() => openTicket(s, 'edit')}
                      onVoid={() => openTicket(s, 'void')}
                      canEdit={canMod}
                      canVoid={canMod}
                    />
                  </td>
                </tr>
                );
              })}
              {filteredSales.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    No hay ventas mayoristas en el período seleccionado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Registrar Venta Mayorista">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">Fecha</label>
            <InputFecha
              value={saleDate}
              onChange={setSaleDate}
              disabled={user?.role !== 'admin'}
              required
              maxDate={new Date()}
              className="w-full max-w-[10rem]"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">
              Cliente <span className="text-brand-danger">*</span>
            </label>
            <SearchableSelect
              options={namedCustomers.map((c) => ({ value: c.id, label: c.name }))}
              value={
                customerId
                  ? { value: customerId, label: namedCustomers.find((c) => c.id === customerId)?.name }
                  : null
              }
              onChange={(selected: { value: string } | null) => {
                setCustomerId(selected?.value || '');
                setItems([]);
              }}
              placeholder="Seleccionar cliente..."
            />
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
                    : 'contado') as SaleCondition;
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
                  Sin cobro: asienta Debe en la cuenta del cliente. No ingresa a caja.
                </p>
              </div>
            )}
          </div>

          <div className="border-t pt-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-medium text-gray-900">Productos</h3>
              <Button type="button" size="sm" variant="secondary" onClick={addItem} disabled={!customerId}>
                + Agregar Fila
              </Button>
            </div>
            {!customerId && (
              <p className="text-xs text-brand-muted mb-2">Seleccioná un cliente para cargar productos.</p>
            )}
            <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
              {items.map((item, index) => (
                <div key={index} className="flex gap-2 items-center bg-gray-50 p-2 rounded border">
                  <div className="flex-1">
                    <SearchableSelect
                      options={products.map((p) => ({
                        value: p.id,
                        label: `${p.name} (${p.stock} ${p.unit} disp.)`,
                      }))}
                      value={
                        item.productId
                          ? {
                              value: item.productId,
                              label: `${products.find((p) => p.id === item.productId)?.name} (${products.find((p) => p.id === item.productId)?.stock} ${products.find((p) => p.id === item.productId)?.unit} disp.)`,
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
                    placeholder="Cant"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, 'quantity', Number(e.target.value))}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-24 border p-2 rounded text-sm text-green-700 bg-green-50 font-bold h-[38px]"
                    placeholder="Precio Un."
                    value={item.unitPrice}
                    onChange={(e) => updateItem(index, 'unitPrice', Number(e.target.value))}
                  />
                  <div className="w-24 text-right font-medium text-sm">{formatCurrency(item.subtotal)}</div>
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
              <div className="text-right text-3xl font-bold mt-4 pt-4 border-t text-green-700">
                Total: {formatCurrency(total)}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Guardando…' : 'Cerrar Venta'}
            </Button>
          </div>
        </form>
      </Modal>

      <SaleTicketModal
        sale={detailsModal}
        onClose={() => setDetailsModal(null)}
        onUpdated={load}
        products={products}
        customers={customers}
        priceLists={priceLists}
        settings={settings}
        initialMode={ticketMode}
      />
    </div>
  );
}
