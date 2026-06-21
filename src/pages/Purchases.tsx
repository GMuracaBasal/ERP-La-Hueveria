import React, { useState, useEffect } from 'react';
import { purchasesDB, suppliersDB, productsDB, inventoryDB, financeDB } from '../lib/db';
import { Purchase, PurchaseItem, Supplier, Product } from '../types';
import { Button, Modal, Badge, SearchableSelect } from '../components/ui';
import { generateId, formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function Purchases() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [detailsModal, setDetailsModal] = useState<Purchase | null>(null);

  const [formData, setFormData] = useState({ supplierId: '', invoiceNumber: '', notes: '' });
  const [items, setItems] = useState<PurchaseItem[]>([]);

  const load = () => {
    setPurchases(purchasesDB.getAll().sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setSuppliers(suppliersDB.getAll());
    setProducts(productsDB.getAll());
  };
  useEffect(() => load(), []);

  const handleOpenModal = () => {
    setFormData({ supplierId: '', invoiceNumber: '', notes: '' });
    setItems([]);
    setIsModalOpen(true);
  };

  const addItem = () => setItems([...items, { productId: '', quantity: 1, unitCost: 0, subtotal: 0 }]);
  
  const updateItem = (index: number, field: keyof PurchaseItem, value: any) => {
    const newItems = [...items];
    const item = newItems[index];
    
    if (field === 'productId') {
      const p = products.find(prod => prod.id === value);
      item.productId = value;
      item.unitCost = p ? p.costPrice : 0;
    } else {
      (item as any)[field] = value;
    }
    
    item.subtotal = item.quantity * item.unitCost;
    setItems(newItems);
  };

  const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index));

  const total = items.reduce((acc, curr) => acc + curr.subtotal, 0);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.supplierId) return alert('Seleccione un proveedor');
    if (items.length === 0 || items.some(i => !i.productId || i.quantity <= 0)) return alert('agregue productos válidos');

    const p: Purchase = {
      id: generateId(),
      date: new Date().toISOString(),
      ...formData,
      total,
      items
    };

    // 1. Guardar Compra
    purchasesDB.save(p);

    // 2. Finanzas (Egreso)
    financeDB.save({
      id: generateId(),
      date: p.date,
      type: 'egreso',
      concept: `Compra Proveedor (REF: ${p.invoiceNumber || p.id.slice(0,6)})`,
      amount: p.total,
      referenceId: p.id
    });

    // 3. Inventario y actualización de costo
    items.forEach(item => {
      const dbProd = productsDB.getById(item.productId);
      if (dbProd) {
        dbProd.stock += item.quantity;
        dbProd.costPrice = item.unitCost; // Actualiza con ultimo precio de compra
        productsDB.save(dbProd);

        inventoryDB.save({
          id: generateId(),
          date: p.date,
          productId: dbProd.id,
          type: 'entrada',
          quantity: item.quantity,
          referenceId: p.id,
          reason: `Compra a proveedor`
        });
      }
    });

    setIsModalOpen(false);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Compras (Ingreso Stock)</h1>
        <Button onClick={handleOpenModal}>Registrar Compra</Button>
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
            <thead className="text-[10px] uppercase text-gray-400 font-bold border-b border-gray-50 bg-white">
              <tr>
                <th className="px-6 py-3 text-left">Fecha</th>
                <th className="px-6 py-3 text-left">Proveedor / Factura</th>
                <th className="px-6 py-3 text-left">Total</th>
                <th className="px-6 py-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="text-sm text-gray-600">
              {purchases.map(p => (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3">{format(new Date(p.date), 'dd MMM yyyy', {locale: es})}</td>
                  <td className="px-6 py-3">
                    <div className="font-medium text-gray-900">{suppliers.find(s=>s.id===p.supplierId)?.name || 'N/A'}</div>
                    <div className="text-xs text-gray-500">{p.invoiceNumber || 'S/N'}</div>
                  </td>
                  <td className="px-6 py-3 font-bold text-gray-900">{formatCurrency(p.total)}</td>
                  <td className="px-6 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setDetailsModal(p)}>Ver Detalles</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Registrar Nueva Compra">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm mb-1">Proveedor</label>
              <SearchableSelect
                options={suppliers.map(s => ({ value: s.id, label: s.name }))}
                value={formData.supplierId ? { value: formData.supplierId, label: suppliers.find(s => s.id === formData.supplierId)?.name } : null}
                onChange={(selected: any) => setFormData({...formData, supplierId: selected?.value || ''})}
                placeholder="Seleccione..."
              />
            </div>
            <div><label className="block text-sm mb-1">Factura / Remito (Opcional)</label><input className="w-full border p-2 rounded-lg" value={formData.invoiceNumber} onChange={e => setFormData({...formData, invoiceNumber: e.target.value})} /></div>
          </div>
          <div><label className="block text-sm mb-1">Notas</label><textarea className="w-full border p-2 rounded-lg" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} /></div>
          
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
                      options={products.map(p => ({ value: p.id, label: p.name }))}
                      value={item.productId ? { value: item.productId, label: products.find(p => p.id === item.productId)?.name } : null}
                      onChange={(selected: any) => updateItem(index, 'productId', selected?.value || '')}
                      placeholder="Producto..."
                    />
                  </div>
                  <input type="number" min="1" className="w-20 border p-2 rounded text-sm h-[38px]" placeholder="Cant" value={item.quantity} onChange={e => updateItem(index, 'quantity', Number(e.target.value))} />
                  <input type="number" step="0.01" min="0" className="w-24 border p-2 rounded text-sm h-[38px]" placeholder="Costo Un." value={item.unitCost} onChange={e => updateItem(index, 'unitCost', Number(e.target.value))} />
                  <div className="w-24 text-right font-medium text-sm">{formatCurrency(item.subtotal)}</div>
                  <button type="button" onClick={() => removeItem(index)} className="text-red-500 hover:text-red-700 px-2 font-bold">×</button>
                </div>
              ))}
            </div>
            {items.length > 0 && (
              <div className="text-right text-lg font-bold mt-4 pt-4 border-t text-gray-900">
                Total: {formatCurrency(total)}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>Cancelar</Button><Button type="submit">Confirmar Compra</Button></div>
        </form>
      </Modal>

      <Modal isOpen={!!detailsModal} onClose={() => setDetailsModal(null)} title="Detalles de la Compra">
        {detailsModal && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 text-sm">
              <div><span className="font-semibold">Fecha:</span> {format(new Date(detailsModal.date), "dd/MM/yyyy HH:mm")}</div>
              <div><span className="font-semibold">Proveedor:</span> {suppliers.find(s=>s.id===detailsModal.supplierId)?.name}</div>
              <div><span className="font-semibold">Factura:</span> {detailsModal.invoiceNumber || 'N/A'}</div>
              <div><span className="font-semibold">Total:</span> {formatCurrency(detailsModal.total)}</div>
            </div>
            <div className="border-t pt-4">
              <h4 className="font-medium mb-2">Items Adquiridos</h4>
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50"><tr><th className="p-2">Prod</th><th className="p-2">Cant</th><th className="p-2">Costo U.</th><th className="p-2">SubT</th></tr></thead>
                <tbody>
                  {detailsModal.items.map((i, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="p-2">{products.find(p=>p.id===i.productId)?.name}</td>
                      <td className="p-2">{i.quantity}</td>
                      <td className="p-2">{formatCurrency(i.unitCost)}</td>
                      <td className="p-2 font-medium">{formatCurrency(i.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-sm border-t pt-4"><span className="font-semibold">Notas:</span> {detailsModal.notes || 'Sin observaciones'}</div>
          </div>
        )}
      </Modal>
    </div>
  );
}
