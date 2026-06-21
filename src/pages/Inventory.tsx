import React, { useState, useEffect } from 'react';
import { productsDB, inventoryDB } from '../lib/db';
import { Product, InventoryMovement } from '../types';
import { Badge, Button, Modal, SearchableSelect } from '../components/ui';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { generateId } from '../lib/utils';
import { ArrowDown, ArrowUp, RefreshCcw } from 'lucide-react';

export default function Inventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [filterCategory, setFilterCategory] = useState('');
  const [search, setSearch] = useState('');
  const [isAdjModalOpen, setIsAdjModalOpen] = useState(false);
  const [adjData, setAdjData] = useState({ productId: '', quantity: 0, reason: 'Rotura' });

  const load = () => {
    setProducts(productsDB.getAll());
    setMovements(inventoryDB.getAll().sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  };
  useEffect(() => load(), []);

  const handleAdjust = (e: React.FormEvent) => {
    e.preventDefault();
    const prod = productsDB.getById(adjData.productId);
    if (!prod) return;

    // Generar movimiento de ajuste
    // Calculate difference (la quantity en el form será la nueva cantidad absoluta)
    // Actually, it's easier if user enters the absolute stock or the diff? "Ajuste manual de stock": User enters exactly how much was lost, OR new real stock.
    // Let's do absolute new stock:
    const diff = adjData.quantity - prod.stock;
    if (diff === 0) {
      setIsAdjModalOpen(false);
      return;
    }

    const type = diff > 0 ? 'entrada' : 'salida';
    
    prod.stock = adjData.quantity;
    productsDB.save(prod);

    inventoryDB.save({
      id: generateId(),
      date: new Date().toISOString(),
      productId: prod.id,
      type: 'ajuste',
      quantity: Math.abs(diff),
      reason: adjData.reason
    });

    setIsAdjModalOpen(false);
    load();
  };

  const getProductName = (id: string) => products.find(p => p.id === id)?.name || 'Desconocido';
  const categories = Array.from(new Set(products.map(p => p.category)));

  const filteredProd = products.filter(p => {
    if (filterCategory && p.category !== filterCategory) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Control de Inventario</h1>
        <Button onClick={() => { setAdjData({ productId: products[0]?.id || '', quantity: 0, reason: 'Rotura' }); setIsAdjModalOpen(true); }} variant="secondary">
          Ajuste Manual
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-brand-border flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b border-brand-border flex justify-between items-center bg-brand-cream/30">
            <h2 className="font-bold text-brand-brown flex items-center gap-2">
               <span className="w-2 h-4 bg-brand-orange rounded-full"></span>
               Stock Actual
            </h2>
          </div>
          <div className="p-4 bg-brand-cream/10 border-b border-brand-border">
            <div className="flex gap-4">
              <input type="text" placeholder="Buscar producto..." className="border border-brand-border p-2 rounded-lg flex-1 text-sm bg-white" value={search} onChange={e => setSearch(e.target.value)} />
              <div className="w-[200px]">
                <SearchableSelect 
                  options={[
                    { value: '', label: 'Todas las categorías' },
                    ...categories.map(c => ({ value: c, label: c }))
                  ]}
                  value={{ value: filterCategory, label: filterCategory || 'Todas las categorías' }}
                  onChange={(selected: any) => setFilterCategory(selected?.value || '')}
                />
              </div>
            </div>
          </div>
          <div className="overflow-y-auto max-h-[500px]">
             <table className="min-w-full text-sm">
               <thead className="text-[10px] uppercase text-gray-400 font-bold border-b border-gray-50 bg-white sticky top-0"><tr><th className="px-6 py-3 text-left">Producto</th><th className="px-6 py-3 text-right">Stock / Mínimo</th></tr></thead>
               <tbody className="text-sm text-gray-600">
                {filteredProd.map(p => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3">
                      <div className="font-medium text-gray-800">{p.name}</div>
                      <div className="text-xs text-gray-500">{p.sku}</div>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Badge variant={p.stock <= p.minStock ? 'danger' : 'success'}>{p.stock} / {p.minStock}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-brand-border flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b border-brand-border flex justify-between items-center bg-brand-cream/30">
             <h2 className="font-bold text-brand-brown flex items-center gap-2">
               <span className="w-2 h-4 bg-brand-orange rounded-full"></span>
               Últimos Movimientos
             </h2>
          </div>
          <div className="overflow-y-auto max-h-[500px]">
            <table className="min-w-full text-sm">
              <tbody className="text-sm text-gray-600">
                {movements.slice(0, 50).map(m => ( // Solo los ultimos 50 para ui rapida
                  <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                       <div className="w-6 h-6 flex justify-center items-center rounded-full bg-brand-cream/50 flex-shrink-0">
                        {m.type === 'entrada' ? <ArrowUp className="w-3 h-3 text-green-500" /> : m.type === 'salida' ? <ArrowDown className="w-3 h-3 text-red-500" /> : <RefreshCcw className="w-3 h-3 text-amber-500" />}
                       </div>
                        <span className="font-medium text-gray-800">{getProductName(m.productId)}</span>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-1 pl-8">{format(new Date(m.date), "dd MMM yyyy HH:mm", { locale: es })} • {m.reason}</div>
                    </td>
                    <td className="px-6 py-3 text-right font-bold">
                      <span className={m.type === 'entrada' ? 'text-green-600' : m.type === 'salida' ? 'text-red-600' : 'text-amber-600'}>
                        {m.type === 'salida' ? '-' : '+'}{m.quantity}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal isOpen={isAdjModalOpen} onClose={() => setIsAdjModalOpen(false)} title="Ajuste Manual de Stock">
        <form onSubmit={handleAdjust} className="space-y-4">
          <div><label className="block text-sm mb-1">Producto</label>
            <SearchableSelect
              options={products.map(p => ({ value: p.id, label: `${p.name} (Actual: ${p.stock})` }))}
              value={adjData.productId ? { value: adjData.productId, label: `${products.find(p => p.id === adjData.productId)?.name} (Actual: ${products.find(p => p.id === adjData.productId)?.stock})` } : null}
              onChange={(selected: any) => {
                const p = productsDB.getById(selected?.value || '');
                setAdjData({...adjData, productId: selected?.value || '', quantity: p ? p.stock : 0});
              }}
              placeholder="Seleccione producto..."
            />
          </div>
          <div><label className="block text-sm mb-1">Nueva Cantidad Real de Stock</label><input type="number" required min="0" className="w-full border p-2 rounded-lg" value={adjData.quantity} onChange={e => setAdjData({...adjData, quantity: Number(e.target.value)})} /></div>
          <div><label className="block text-sm mb-1">Motivo</label>
            <SearchableSelect 
              options={[
                { value: 'Rotura', label: 'Rotura' },
                { value: 'Merma', label: 'Merma' },
                { value: 'Ajuste de inventario', label: 'Ajuste de inventario' },
                { value: 'Otro', label: 'Otro' }
              ]}
              value={{ value: adjData.reason, label: adjData.reason }}
              onChange={(selected: any) => setAdjData({...adjData, reason: selected?.value || 'Otro'})}
            />
          </div>
          <div className="flex justify-end gap-2 mt-4"><Button variant="secondary" type="button" onClick={() => setIsAdjModalOpen(false)}>Cancelar</Button><Button type="submit">Aplicar Ajuste</Button></div>
        </form>
      </Modal>
    </div>
  );
}
