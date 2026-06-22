import React, { useState, useEffect } from 'react';
import { usersDB } from '../lib/db';
import { User, Role } from '../types';
import { Button, ActionButtons, Modal, Badge, SearchableSelect } from '../components/ui';
import { hashPassword, generateId } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

export default function Users() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const [formData, setFormData] = useState({ fullName: '', username: '', password: '', role: 'vendedor' as Role });

  const loadUsers = async () => setUsers(await usersDB.getAll());
  useEffect(() => { loadUsers(); }, []);

  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({ fullName: user.fullName, username: user.username, password: '', role: user.role });
    } else {
      setEditingUser(null);
      setFormData({ fullName: '', username: '', password: '', role: 'vendedor' });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingUser) {
      const updatedUser = { ...editingUser, fullName: formData.fullName, username: formData.username, role: formData.role };
      if (formData.password) updatedUser.passwordHash = await hashPassword(formData.password);
      await usersDB.save(updatedUser);
    } else {
      const passwordHash = await hashPassword(formData.password || '123456');
      await usersDB.save({ id: generateId(), fullName: formData.fullName, username: formData.username, passwordHash, role: formData.role });
    }
    setIsModalOpen(false);
    loadUsers();
  };

  const handleDelete = async (id: string) => {
    if (id === currentUser?.id) return alert('No puedes eliminar tu propio usuario');
    if (confirm('¿Eliminar usuario?')) {
      await usersDB.delete(id);
      loadUsers();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
        <Button onClick={() => handleOpenModal()}>Nuevo Usuario</Button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-brand-border flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-brand-border flex justify-between items-center bg-brand-cream/30">
          <h2 className="font-bold text-brand-brown flex items-center gap-2">
            <span className="w-2 h-4 bg-brand-orange rounded-full"></span>
            Gestión de Personal
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[10px] uppercase text-gray-400 font-bold border-b border-gray-50 bg-white">
              <tr>
                <th className="px-6 py-3 text-left">Nombre</th>
                <th className="px-6 py-3 text-left">Usuario</th>
                <th className="px-6 py-3 text-left">Rol</th>
                <th className="px-6 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-sm text-gray-600">
              {users.map(u => (
                <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 font-medium text-gray-800">{u.fullName}</td>
                  <td className="px-6 py-3 text-gray-500">{u.username}</td>
                  <td className="px-6 py-3"><Badge variant={u.role === 'admin' ? 'warning' : 'default'}>{u.role}</Badge></td>
                  <td className="px-6 py-3 text-right">
                     <div className="flex justify-end"><ActionButtons onEdit={() => handleOpenModal(u)} onDelete={() => handleDelete(u.id)} /></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}>
        <form onSubmit={handleSave} className="space-y-4">
          <div><label className="block text-sm mb-1">Nombre Completo</label><input required className="w-full border p-2 rounded-lg" value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} /></div>
          <div><label className="block text-sm mb-1">Nombre de Usuario</label><input required className="w-full border p-2 rounded-lg" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} /></div>
          <div><label className="block text-sm mb-1">Contraseña {editingUser && '(Dejar en blanco para no cambiar)'}</label><input type="password" required={!editingUser} className="w-full border p-2 rounded-lg" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} /></div>
          <div><label className="block text-sm mb-1">Rol</label>
            <SearchableSelect 
              options={[
                { value: 'vendedor', label: 'Vendedor' },
                { value: 'admin', label: 'Administrador' }
              ]}
              value={{ value: formData.role, label: formData.role === 'admin' ? 'Administrador' : 'Vendedor' }}
              onChange={(selected: any) => setFormData({...formData, role: selected?.value as Role || 'vendedor'})}
            />
          </div>
          <div className="flex justify-end gap-2 mt-4"><Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>Cancelar</Button><Button type="submit">Guardar</Button></div>
        </form>
      </Modal>
    </div>
  );
}
