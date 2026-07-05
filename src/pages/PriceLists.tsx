import React, { useState, useEffect } from 'react';
import { priceListsDB, productsDB } from '../lib/db';
import { PriceList, Product } from '../types';
import { Button, ActionButtons, Modal, Badge, useConfirm, useToast } from '../components/ui';
import { generateId, formatCurrency } from '../lib/utils';

export default function PriceLists() {
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const [lists, setLists] = useState<PriceList[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<PriceList | null>(null);
  
  // This state holds the internal prices being edited for the modal
  const [formData, setFormData] = useState<{name: string, isDefault: boolean, prices: Record<string, number>}>({ name: '', isDefault: false, prices: {} });

  const load = async () => {
    setLists(await priceListsDB.getAll());
    setProducts(await productsDB.getAll());
  };
  useEffect(() => { load(); }, []);

  const handleOpenModal = async (item?: PriceList) => {
    if (item) {
      setEditing(item);
      setFormData({ name: item.name, isDefault: item.isDefault, prices: { ...item.prices } });
    } else {
      setEditing(null);
      const defaultPrices: Record<string, number> = {};
      const allProducts = await productsDB.getAll();
      for (const p of allProducts) { defaultPrices[p.id] = 0; }
      setFormData({ name: '', isDefault: false, prices: defaultPrices });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Si la gurdada esDefault, hay que quitar default a todas las demas
      if (formData.isDefault) {
        for (const l of lists) {
          if (l.isDefault && (!editing || l.id !== editing.id)) {
            l.isDefault = false;
            await priceListsDB.save(l);
          }
        }
      }

      if (editing) {
        await priceListsDB.save({ ...editing, ...formData });
      } else {
        await priceListsDB.save({ id: generateId(), ...formData });
      }
      toast.success(editing ? 'Lista de precios actualizada correctamente.' : 'Lista de precios creada correctamente.');
      setIsModalOpen(false);
      load();
    } catch {
      toast.error('No se pudo completar la operación. Intentá de nuevo.');
    }
  };

  const handleDelete = async (id: string) => {
    const list = lists.find(l => l.id === id);
    if (list?.isDefault) return alert('No puedes eliminar la lista por defecto. Asigna otra primero.');
    const ok = await confirm({
      title: 'Eliminar lista de precios',
      description: 'Esta acción no se puede deshacer. Puede afectar a clientes asignados a ella.',
      confirmLabel: 'Sí, eliminar',
    });
    if (ok) {
      try {
        await priceListsDB.delete(id);
        toast.success('Lista de precios eliminada correctamente.');
        load();
      } catch {
        toast.error('No se pudo completar la operación. Intentá de nuevo.');
      }
    }
  };

  const handlePriceChange = (productId: string, val: string) => {
    setFormData(prev => ({
      ...prev,
      prices: { ...prev.prices, [productId]: Number(val) }
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Listas de Precios</h1>
        <Button onClick={() => handleOpenModal()}>Nueva Lista</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {lists.map(list => (
          <div key={list.id} className="bg-white rounded-2xl shadow-sm border border-brand-border flex flex-col overflow-hidden hover:shadow-md transition-shadow">
            <div className="px-6 py-4 border-b border-brand-border bg-brand-cream/30 flex justify-between items-start">
              <div>
                <h3 className="font-bold text-lg text-brand-brown">{list.name}</h3>
                {list.isDefault && <Badge variant="success" className="mt-2 text-[10px]">LISTA POR DEFECTO</Badge>}
              </div>
              <ActionButtons onEdit={() => handleOpenModal(list)} onDelete={() => handleDelete(list.id)} />
            </div>
            <div className="p-4">
              <div className="text-xs uppercase font-bold text-gray-400 mb-2">{Object.keys(list.prices).length} PRODUCTOS</div>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-sm">
                  <tbody className="text-gray-600">
                    {products.slice(0, 5).map(p => (
                      <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                        <td className="py-2 truncate pr-2 font-medium">{p.name}</td>
                        <td className="py-2 text-right font-bold text-gray-900">{formatCurrency(list.prices[p.id] || 0)}</td>
                      </tr>
                    ))}
                    {products.length > 5 && (
                      <tr><td colSpan={2} className="text-center py-2 text-gray-400 text-xs italic">...y {products.length - 5} más</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editing ? 'Editar Lista de Precios' : 'Nueva Lista'}>
        <form onSubmit={handleSave} className="space-y-4">
          <div><label className="block text-sm">Nombre de la Lista</label><input required className="w-full border p-2 rounded" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
          <div>
            <label className="flex items-center space-x-2 text-sm text-gray-700">
              <input type="checkbox" className="rounded text-brand-orange focus:ring-brand-orange" checked={formData.isDefault} onChange={e => setFormData({...formData, isDefault: e.target.checked})} />
              <span>Usar como lista por defecto (Consumidor Final)</span>
            </label>
          </div>
          <div className="mt-4 pt-4 border-t">
            <h4 className="font-medium mb-2 text-sm text-gray-700">Precios de los Productos</h4>
            <div className="max-h-[50vh] overflow-y-auto">
              {products.map(p => (
                <div key={p.id} className="flex justify-between items-center py-2 border-b last:border-0 pr-2">
                  <div className="flex-1 truncate pr-4 text-sm text-gray-700">
                    {p.name} <span className="text-xs text-gray-400 block">Costo: {formatCurrency(p.costPrice)}</span>
                  </div>
                  <div className="w-32">
                    <input type="number" required min="0" step="0.01" className="w-full border p-1 rounded text-right" value={formData.prices[p.id] !== undefined ? formData.prices[p.id] : ''} onChange={e => handlePriceChange(p.id, e.target.value)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4"><Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>Cancelar</Button><Button type="submit">Guardar</Button></div>
        </form>
      </Modal>
    </div>
  );
}
