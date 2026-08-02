import React, { useState, useEffect } from 'react';
import { ToggleLeft, ToggleRight, Pencil } from 'lucide-react';
import { usersDB } from '../lib/db';
import { User, Role } from '../types';
import { Button, Modal, Badge, SearchableSelect, AntiAutofillInput, useConfirm, useToast } from '../components/ui';
import { hashPassword, generateId } from '../lib/utils';
import { MODULES } from '../lib/modules';
import { useAuth } from '../contexts/AuthContext';

const emptyForm = {
  fullName: '',
  username: '',
  email: '',
  password: '',
  role: 'vendedor' as Role,
  modules: ['pos', 'caja'] as string[],
};

export default function Users() {
  const { user: currentUser } = useAuth();
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState(emptyForm);

  const loadUsers = async () => setUsers(await usersDB.getAll());
  useEffect(() => { loadUsers(); }, []);

  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        fullName: user.fullName,
        username: user.username,
        email: user.email || '',
        password: '',
        role: user.role,
        modules: user.modules?.length ? [...user.modules] : (user.role === 'vendedor' ? ['pos', 'caja'] : []),
      });
    } else {
      setEditingUser(null);
      setFormData({ ...emptyForm, modules: ['pos', 'caja'] });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
    setFormData(emptyForm);
  };

  const toggleModule = (moduleId: string) => {
    setFormData((prev) => ({
      ...prev,
      modules: prev.modules.includes(moduleId)
        ? prev.modules.filter((id) => id !== moduleId)
        : [...prev.modules, moduleId],
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.fullName.trim()) {
      toast.error('El nombre es obligatorio.');
      return;
    }
    if (!formData.username.trim()) {
      toast.error('El nombre de usuario es obligatorio.');
      return;
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(formData.username)) {
      toast.error('El usuario solo puede contener letras, números, puntos, guiones y guiones bajos.');
      return;
    }
    if (!editingUser && !formData.password) {
      toast.error('La contraseña es obligatoria al crear un usuario.');
      return;
    }
    if (formData.role === 'vendedor' && formData.modules.length === 0) {
      toast.error('Seleccioná al menos un módulo para el vendedor.');
      return;
    }

    try {
      const modules = formData.role === 'admin' ? [] : formData.modules;

      if (editingUser) {
        const updatedUser: User = {
          ...editingUser,
          fullName: formData.fullName.trim(),
          username: formData.username.trim(),
          email: formData.email.trim() || null,
          role: formData.role,
          modules,
        };
        if (formData.password) {
          updatedUser.passwordHash = await hashPassword(formData.password);
        }
        await usersDB.save(updatedUser);
      } else {
        await usersDB.save({
          id: generateId(),
          fullName: formData.fullName.trim(),
          username: formData.username.trim(),
          email: formData.email.trim() || null,
          passwordHash: await hashPassword(formData.password),
          role: formData.role,
          active: true,
          modules,
        });
      }
      toast.success(editingUser ? 'Usuario actualizado correctamente.' : 'Usuario creado correctamente.');
      handleCloseModal();
      loadUsers();
    } catch {
      toast.error('No se pudo completar la operación. Intentá de nuevo.');
    }
  };

  const handleToggleActive = async (u: User) => {
    if (u.active) {
      if (u.id === currentUser?.id) {
        toast.error('No podés desactivar tu propio usuario.');
        return;
      }
      if (u.role === 'admin') {
        const activeAdmins = users.filter((x) => x.role === 'admin' && x.active);
        if (activeAdmins.length <= 1) {
          toast.error('Tiene que quedar al menos un administrador activo.');
          return;
        }
      }
      const ok = await confirm({
        title: 'Desactivar usuario',
        description: `¿Desactivar a ${u.fullName}? No podrá iniciar sesión hasta que lo reactives.`,
        confirmLabel: 'Sí, desactivar',
      });
      if (!ok) return;
    }

    try {
      await usersDB.save({ ...u, active: !u.active });
      toast.success(u.active ? 'Usuario desactivado.' : 'Usuario activado.');
      loadUsers();
    } catch {
      toast.error('No se pudo completar la operación. Intentá de nuevo.');
    }
  };

  const moduleLabel = (id: string) => MODULES.find((m) => m.id === id)?.label ?? id;

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
            <thead className="text-[10px] uppercase text-white font-bold bg-brand-navy">
              <tr>
                <th className="px-6 py-3 text-left">Nombre</th>
                <th className="px-6 py-3 text-left">Usuario</th>
                <th className="px-6 py-3 text-left">Email</th>
                <th className="px-6 py-3 text-left">Rol</th>
                <th className="px-6 py-3 text-left">Módulos</th>
                <th className="px-6 py-3 text-left">Estado</th>
                <th className="px-6 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-sm text-gray-600">
              {users.map((u) => (
                <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 font-medium text-gray-800">
                    {u.fullName}
                    {u.id === currentUser?.id && (
                      <span className="ml-1 text-xs font-normal text-gray-400">(vos)</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-gray-500">{u.username}</td>
                  <td className="px-6 py-3 text-gray-500">{u.email || '—'}</td>
                  <td className="px-6 py-3">
                    <Badge variant={u.role === 'admin' ? 'warning' : 'default'}>
                      {u.role === 'admin' ? 'Admin' : 'Vendedor'}
                    </Badge>
                  </td>
                  <td className="px-6 py-3">
                    {u.role === 'admin' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-brand-durazno/40 text-brand-navy">
                        Todos
                      </span>
                    ) : u.modules?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {u.modules.map((id) => (
                          <span
                            key={id}
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-gray-100 text-gray-600"
                          >
                            {moduleLabel(id)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Sin módulos</span>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    <Badge variant={u.active ? 'success' : 'danger'}>
                      {u.active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        onClick={() => handleOpenModal(u)}
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        onClick={() => handleToggleActive(u)}
                        title={u.active ? 'Desactivar' : 'Activar'}
                      >
                        {u.active
                          ? <ToggleRight className="w-4 h-4 text-green-600" />
                          : <ToggleLeft className="w-4 h-4 text-gray-400" />}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}>
        <form
          key={editingUser?.id ?? 'create'}
          onSubmit={handleSave}
          autoComplete="off"
          className="space-y-4"
        >
          <div>
            <label className="block text-sm mb-1">Nombre Completo</label>
            <AntiAutofillInput
              required
              name="nuevo-nombre-completo"
              autoComplete="off"
              className="w-full border p-2 rounded-lg"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Nombre de Usuario</label>
            <AntiAutofillInput
              required
              name="nuevo-usuario"
              autoComplete="off"
              className="w-full border p-2 rounded-lg"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Email <span className="text-gray-400 font-normal">(opcional)</span></label>
            <AntiAutofillInput
              type="email"
              name="nuevo-email"
              autoComplete="off"
              className="w-full border p-2 rounded-lg"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">
              Contraseña {editingUser && '(Dejar en blanco para no cambiar)'}
            </label>
            <AntiAutofillInput
              type="password"
              required={!editingUser}
              name="nueva-contrasena"
              autoComplete="new-password"
              className="w-full border p-2 rounded-lg"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Rol</label>
            <SearchableSelect
              options={[
                { value: 'vendedor', label: 'Vendedor' },
                { value: 'admin', label: 'Administrador' },
              ]}
              value={{ value: formData.role, label: formData.role === 'admin' ? 'Administrador' : 'Vendedor' }}
              onChange={(selected: any) => {
                const role = (selected?.value as Role) || 'vendedor';
                setFormData({
                  ...formData,
                  role,
                  modules: role === 'vendedor' && formData.modules.length === 0
                    ? ['pos', 'caja']
                    : formData.modules,
                });
              }}
            />
          </div>

          {formData.role === 'vendedor' ? (
            <div>
              <label className="block text-sm mb-2">Módulos habilitados</label>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border border-brand-border rounded-lg p-3 bg-brand-cream/20">
                {MODULES.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.modules.includes(m.id)}
                      onChange={() => toggleModule(m.id)}
                      className="rounded border-brand-border text-brand-teja focus:ring-brand-teja"
                    />
                    {m.label}
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 bg-brand-cream/40 border border-brand-border rounded-lg p-3">
              Los administradores acceden a todos los módulos.
            </p>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="secondary" type="button" onClick={handleCloseModal}>Cancelar</Button>
            <Button type="submit">Guardar</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
