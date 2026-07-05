import React, { useState, useEffect } from 'react';
import { salesDB, customersDB, productsDB, inventoryDB, financeDB, priceListsDB, db } from '../lib/db';
import { Sale, SaleItem, Customer, Product, PriceList, Settings } from '../types';
import { Button, Modal, Badge, SearchableSelect, useToast } from '../components/ui';
import SaleTicketModal from '../components/SaleTicketModal';
import { generateId, formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function Sales() {
  const { toast } = useToast();
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [detailsModal, setDetailsModal] = useState<Sale | null>(null);

  const [customerId, setCustomerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Efectivo');
  const [items, setItems] = useState<SaleItem[]>([]);

  const [settings, setSettings] = useState<Settings | null>(null);

  const load = async () => {
    const allSales = await salesDB.getAll({ includeVoided: true });
    setSales(allSales.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
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
      const c = customers.find(c => c.id === customerId);
      if (c && c.priceListId) targetListId = c.priceListId;
    }
    const list = priceLists.find(l => l.id === targetListId);
    return list ? list.prices : {};
  };

  const activePrices = getActivePrices();

  const handleOpenModal = () => {
    setCustomerId('');
    setPaymentMethod('Efectivo');
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
    } else {
      (item as Record<string, unknown>)[field] = value;
    }
    
    item.subtotal = item.quantity * item.unitPrice;
    setItems(newItems);
  };

  const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index));

  const total = items.reduce((acc, curr) => acc + curr.subtotal, 0);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0 || items.some(i => !i.productId || i.quantity <= 0)) return alert('Agregue productos válidos');

    for (const item of items) {
      const p = products.find(p => p.id === item.productId);
      if (p && p.stock < item.quantity) {
        return alert(`Stock insuficiente para el producto: ${p.name}. (Disponible: ${p.stock})`);
      }
    }

    try {
      const saleId = generateId();
      const dateStr = new Date().toISOString();

      const sale: Sale = {
        id: saleId,
        date: dateStr,
        customerId: customerId || null,
        paymentMethod,
        total,
        items
      };

      await salesDB.save(sale);

      await financeDB.save({
        id: generateId(),
        date: dateStr,
        type: 'ingreso',
        concept: `Venta #${saleId.slice(0,6).toUpperCase()}`,
        amount: total,
        paymentMethod,
        referenceId: saleId
      });

      for (const item of items) {
        const dbProd = await productsDB.getById(item.productId);
        if (dbProd) {
          dbProd.stock -= item.quantity;
          await productsDB.save(dbProd);

          await inventoryDB.save({
            id: generateId(),
            date: dateStr,
            productId: dbProd.id,
            type: 'salida',
            quantity: item.quantity,
            referenceId: saleId,
            reason: `Venta a ${customerId ? customers.find(c=>c.id === customerId)?.name : 'Consumidor Final'}`
          });
        }
      }

      toast.success('Venta registrada correctamente.');
      setIsModalOpen(false);
      load();
    } catch {
      toast.error('No se pudo completar la operación. Intentá de nuevo.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Ventas (Terminal / Mostrador)</h1>
        <Button onClick={handleOpenModal} size="lg" className="shadow-md">Nueva Venta</Button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-brand-border flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-brand-border flex justify-between items-center bg-brand-cream/30">
          <h2 className="font-bold text-brand-brown flex items-center gap-2">
            <span className="w-2 h-4 bg-brand-orange rounded-full"></span>
            Historial de Ventas
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[10px] uppercase text-white font-bold bg-brand-navy">
              <tr>
                <th className="px-6 py-3 text-left">Fecha</th>
                <th className="px-6 py-3 text-left">Cliente</th>
                <th className="px-6 py-3 text-left">Medio Pago</th>
                <th className="px-6 py-3 text-left">Total</th>
                <th className="px-6 py-3 text-left">Estado</th>
                <th className="px-6 py-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="text-sm text-gray-600">
              {sales.map(s => (
                <tr
                  key={s.id}
                  className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${s.voided ? 'opacity-60' : ''}`}
                >
                  <td className="px-6 py-3">{format(new Date(s.date), 'dd MMM yyyy HH:mm', {locale: es})}</td>
                  <td className="px-6 py-3 font-medium text-gray-800">
                    {s.customerId ? customers.find(c=>c.id===s.customerId)?.name : <span className="text-gray-500 italic">Consumidor Final</span>}
                  </td>
                  <td className="px-6 py-3"><Badge variant="default">{s.paymentMethod}</Badge></td>
                  <td className={`px-6 py-3 font-bold ${s.voided ? 'text-gray-400 line-through' : 'text-green-700'}`}>
                    {formatCurrency(s.total)}
                  </td>
                  <td className="px-6 py-3">
                    {s.voided ? <Badge variant="danger">ANULADO</Badge> : <Badge variant="success">ACTIVA</Badge>}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setDetailsModal(s)}>Ver Ticket</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Registrar Venta" >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm mb-1">Cliente</label>
              <SearchableSelect 
                options={[
                  { value: '', label: 'Consumidor Final' },
                  ...customers.map(c => ({ value: c.id, label: c.name }))
                ]}
                value={customerId ? { value: customerId, label: customers.find(c => c.id === customerId)?.name } : { value: '', label: 'Consumidor Final' }}
                onChange={(selected: { value: string } | null) => { setCustomerId(selected?.value || ''); setItems([]); }}
                placeholder="Seleccionar cliente..."
              />
            </div>
            <div><label className="block text-sm mb-1">Medio de Pago</label>
              <SearchableSelect 
                options={[
                  { value: 'Efectivo', label: 'Efectivo' },
                  { value: 'Transferencia', label: 'Transferencia' },
                  { value: 'Tarjeta de Débito', label: 'Tarjeta de Débito' },
                  { value: 'Tarjeta de Crédito', label: 'Tarjeta de Crédito' },
                  { value: 'Cuenta Corriente', label: 'Cuenta Corriente' },
                ]}
                value={{ value: paymentMethod, label: paymentMethod }}
                onChange={(selected: { value: string } | null) => setPaymentMethod(selected?.value || 'Efectivo')}
                placeholder="Seleccionar medio p..."
              />
            </div>
          </div>
          
          <div className="border-t pt-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-medium text-gray-900">Productos</h3>
              <Button type="button" size="sm" variant="secondary" onClick={addItem}>+ Agregar Fila</Button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
              {items.map((item, index) => (
                <div key={index} className="flex gap-2 items-center bg-gray-50 p-2 rounded border">
                  <div className="flex-1">
                    <SearchableSelect
                      options={products.map(p => ({ value: p.id, label: `${p.name} (${p.stock} ${p.unit} disp.)` }))}
                      value={item.productId ? { value: item.productId, label: `${products.find(p => p.id === item.productId)?.name} (${products.find(p => p.id === item.productId)?.stock} ${products.find(p => p.id === item.productId)?.unit} disp.)` } : null}
                      onChange={(selected: { value: string } | null) => updateItem(index, 'productId', selected?.value || '')}
                      placeholder="Producto..."
                    />
                  </div>
                  <input type="number" min="1" className="w-16 border p-2 rounded text-sm h-[38px]" placeholder="Cant" value={item.quantity} onChange={e => updateItem(index, 'quantity', Number(e.target.value))} />
                  <input type="number" step="0.01" min="0" className="w-24 border p-2 rounded text-sm text-green-700 bg-green-50 font-bold h-[38px]" placeholder="Precio Un." value={item.unitPrice} onChange={e => updateItem(index, 'unitPrice', Number(e.target.value))} />
                  <div className="w-24 text-right font-medium text-sm">{formatCurrency(item.subtotal)}</div>
                  <button type="button" onClick={() => removeItem(index)} className="text-red-500 hover:text-red-700 px-2 font-bold">×</button>
                </div>
              ))}
            </div>
            {items.length > 0 && (
              <div className="text-right text-3xl font-bold mt-4 pt-4 border-t text-green-700">
                Total: {formatCurrency(total)}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>Cancelar</Button><Button type="submit">Cerrar Venta</Button></div>
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
      />
    </div>
  );
}
