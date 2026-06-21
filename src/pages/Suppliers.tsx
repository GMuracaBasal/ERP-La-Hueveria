import React, { useState, useEffect } from 'react';
import { suppliersDB } from '../lib/db';
import { Supplier } from '../types';
import { Button, ActionButtons, Modal } from '../components/ui';
import { generateId } from '../lib/utils';

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', address: '', notes: '' });

  const load = () => setSuppliers(suppliersDB.getAll());
  useEffect(() => load(), []);

  const handleOpenModal = (item?: Supplier) => {
    if (item) {
      setEditing(item);
      setFormData(item);
    } else {
      setEditing(null);
      setFormData({ name: '', phone: '', email: '', address: '', notes: '' });
    }
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      suppliersDB.save({ ...editing, ...formData });
    } else {
      suppliersDB.save({ id: generateId(), ...formData });
    }
    setIsModalOpen(false);
    load();
  };

  const handleDelete = (id: string) => {
    if (confirm('¿Eliminar proveedor?')) {
      suppliersDB.delete(id);
      load();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Proveedores</h1>
        <Button onClick={() => handleOpenModal()}>Nuevo Proveedor</Button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-brand-border flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-brand-border flex justify-between items-center bg-brand-cream/30">
          <h2 className="font-bold text-brand-brown flex items-center gap-2">
            <span className="w-2 h-4 bg-brand-orange rounded-full"></span>
            Directorio de Proveedores
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[10px] uppercase text-gray-400 font-bold border-b border-gray-50 bg-white">
              <tr>
                <th className="px-6 py-3 text-left">Razón Social</th>
                <th className="px-6 py-3 text-left">Contacto</th>
                <th className="px-6 py-3 text-left">Dirección</th>
                <th className="px-6 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-sm text-gray-600">
              {suppliers.map(s => (
                <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 font-medium text-gray-800">{s.name}</td>
                  <td className="px-6 py-3">
                    <div className="text-gray-800">{s.phone}</div>
                    <div className="text-xs text-gray-500">{s.email}</div>
                  </td>
                  <td className="px-6 py-3 text-gray-500">{s.address}</td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex justify-end"><ActionButtons onEdit={() => handleOpenModal(s)} onDelete={() => handleDelete(s.id)} /></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editing ? 'Editar Proveedor' : 'Nuevo Proveedor'}>
        <form onSubmit={handleSave} className="space-y-4">
          <div><label className="block text-sm">Razón Social</label><input required className="w-full border p-2 rounded" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm">Teléfono</label><input className="w-full border p-2 rounded" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} /></div>
            <div><label className="block text-sm">Email</label><input type="email" className="w-full border p-2 rounded" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} /></div>
          </div>
          <div><label className="block text-sm">Dirección</label><input className="w-full border p-2 rounded" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} /></div>
          <div><label className="block text-sm">Notas</label><textarea className="w-full border p-2 rounded" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} /></div>
          <div className="flex justify-end gap-2 mt-4"><Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>Cancelar</Button><Button type="submit">Guardar</Button></div>
        </form>
      </Modal>
    </div>
  );
}
