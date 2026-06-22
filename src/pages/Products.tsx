import React, { useState, useEffect } from 'react';
import { productsDB, priceListsDB, inventoryDB } from '../lib/db';
import { Product } from '../types';
import { Button, ActionButtons, Modal, Badge, SearchableSelect } from '../components/ui';
import { generateId, formatCurrency } from '../lib/utils';
import { format } from 'date-fns';

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [formData, setFormData] = useState({ sku: '', name: '', category: 'Huevos', unit: 'Unidad', costPrice: 0, stock: 0, minStock: 0 });

  const load = async () => setProducts(await productsDB.getAll());
  useEffect(() => { load(); }, []);

  const handleOpenModal = (p?: Product) => {
    if (p) {
      setEditingProduct(p);
      setFormData(p);
    } else {
      setEditingProduct(null);
      setFormData({ sku: `PRD-${Math.floor(Math.random()*10000)}`, name: '', category: 'Huevos', unit: 'Unidad', costPrice: 0, stock: 0, minStock: 10 });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingProduct) {
      await productsDB.save({ ...editingProduct, ...formData });
    } else {
      const newProduct: Product = { id: generateId(), ...formData };
      await productsDB.save(newProduct);
      
      // Añadir a todas las listas de precios en $0
      const lists = await priceListsDB.getAll();
      for (const list of lists) {
        list.prices[newProduct.id] = 0;
        await priceListsDB.save(list);
      }

      if (newProduct.stock > 0) {
        await inventoryDB.save({
          id: generateId(),
          date: new Date().toISOString(),
          productId: newProduct.id,
          type: 'ajuste',
          quantity: newProduct.stock,
          reason: 'Ajuste inicial al crear'
        });
      }
    }
    setIsModalOpen(false);
    load();
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Eliminar producto?')) {
      await productsDB.delete(id);
      load();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Productos</h1>
        <Button onClick={() => handleOpenModal()}>Nuevo Producto</Button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-brand-border flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-brand-border flex justify-between items-center bg-brand-cream/30">
          <h2 className="font-bold text-brand-brown flex items-center gap-2">
            <span className="w-2 h-4 bg-brand-orange rounded-full"></span>
            Catálogo de Productos
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[10px] uppercase text-gray-400 font-bold border-b border-gray-50 bg-white">
              <tr>
                <th className="px-6 py-3 text-left">SKU</th>
                <th className="px-6 py-3 text-left">Nombre</th>
                <th className="px-6 py-3 text-left">Categoría</th>
                <th className="px-6 py-3 text-left">Stock</th>
                <th className="px-6 py-3 text-left">Costo</th>
                <th className="px-6 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-sm text-gray-600">
              {products.map(p => (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 font-mono text-gray-500 text-xs">{p.sku}</td>
                  <td className="px-6 py-3 font-medium text-gray-800">{p.name}</td>
                  <td className="px-6 py-3 text-gray-500">{p.category}</td>
                  <td className="px-6 py-3">
                    <Badge variant={p.stock <= p.minStock ? 'danger' : 'success'}>{p.stock} {p.unit}</Badge>
                  </td>
                  <td className="px-6 py-3 font-medium">{formatCurrency(p.costPrice)}</td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex justify-end"><ActionButtons onEdit={() => handleOpenModal(p)} onDelete={() => handleDelete(p.id)} /></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingProduct ? 'Editar Producto' : 'Nuevo Producto'}>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm">SKU</label><input required className="w-full border p-2 rounded" value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})} /></div>
            <div><label className="block text-sm">Nombre</label><input required className="w-full border p-2 rounded" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
            <div><label className="block text-sm mb-1">Categoría</label>
              <SearchableSelect 
                options={[{value: 'Huevos', label: 'Huevos'}, {value: 'Derivados', label: 'Derivados'}, {value: 'Insumos', label: 'Insumos'}, {value: 'Otros', label: 'Otros'}]}
                value={{value: formData.category, label: formData.category}}
                onChange={(selected: any) => setFormData({...formData, category: selected?.value || 'Huevos'})}
              />
            </div>
            <div><label className="block text-sm mb-1">Unidad de medida</label>
              <SearchableSelect 
                options={[{value: 'Unidad', label: 'Unidad'}, {value: 'Maple', label: 'Maple'}, {value: 'Docena', label: 'Docena'}, {value: 'Kg', label: 'Kg'}]}
                value={{value: formData.unit, label: formData.unit}}
                onChange={(selected: any) => setFormData({...formData, unit: selected?.value || 'Unidad'})}
              />
            </div>
            <div><label className="block text-sm">Precio Costo ($)</label><input type="number" required min="0" step="0.01" className="w-full border p-2 rounded" value={formData.costPrice} onChange={e => setFormData({...formData, costPrice: Number(e.target.value)})} /></div>
            <div><label className="block text-sm">Stock Inicial</label><input type="number" required min="0" disabled={!!editingProduct} className="w-full border p-2 rounded bg-gray-100 disabled:opacity-50" value={formData.stock} onChange={e => setFormData({...formData, stock: Number(e.target.value)})} /></div>
            <div><label className="block text-sm">Stock Mínimo (Alerta)</label><input type="number" required min="0" className="w-full border p-2 rounded" value={formData.minStock} onChange={e => setFormData({...formData, minStock: Number(e.target.value)})} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4"><Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>Cancelar</Button><Button type="submit">Guardar</Button></div>
        </form>
      </Modal>
    </div>
  );
}
