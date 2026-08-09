import React, { useEffect, useState } from 'react';
import { accountMovementsDB, customersDB, priceListsDB } from '../lib/db';
import { AccountMovement, Customer, PriceList } from '../types';
import { Button, ActionButtons, Modal, Badge, SearchableSelect, useConfirm, useToast } from '../components/ui';
import { formatCurrency, generateId } from '../lib/utils';
import { balancesByParty } from '../lib/accountMovements';
import { isConsumidorFinal } from '../lib/consumidorFinal';
import CuentaCorriente from '../components/CuentaCorriente';
import RegistrarMovimientoModal from '../components/RegistrarMovimientoModal';

const emptyForm = {
  name: '',
  phone: '',
  email: '',
  address: '',
  priceListId: '',
  notes: '',
};

export default function Customers() {
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [lists, setLists] = useState<PriceList[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [movements, setMovements] = useState<AccountMovement[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [movModalOpen, setMovModalOpen] = useState(false);
  const [formData, setFormData] = useState(emptyForm);

  const loadList = async () => {
    try {
      const [custs, priceLists, activeMovs] = await Promise.all([
        customersDB.getAll(),
        priceListsDB.getAll(),
        accountMovementsDB.getAllActive(),
      ]);
      setCustomers(custs);
      setLists(priceLists);
      setBalances(balancesByParty(activeMovs, 'customer'));
    } catch {
      toast.error('No se pudieron cargar los clientes.');
    }
  };

  const loadBook = async (customerId: string) => {
    try {
      setMovements(await accountMovementsDB.getByCustomer(customerId));
    } catch {
      toast.error('No se pudo cargar la cuenta corriente.');
    }
  };

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDetail = async (customer: Customer) => {
    setSelected(customer);
    await loadBook(customer.id);
  };

  const refreshDetail = async () => {
    if (!selected) return;
    const fresh = await customersDB.getById(selected.id);
    if (fresh) setSelected(fresh);
    await loadBook(selected.id);
    await loadList();
  };

  const handleOpenModal = (item?: Customer) => {
    if (item) {
      setEditing(item);
      setFormData({ ...item, priceListId: item.priceListId || '' });
    } else {
      setEditing(null);
      setFormData({ ...emptyForm, priceListId: lists[0]?.id || '' });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const dataToSave = { ...formData, priceListId: formData.priceListId || null };
      if (editing) {
        const updated = { ...editing, ...dataToSave };
        await customersDB.save(updated);
        if (selected?.id === editing.id) setSelected(updated);
      } else {
        await customersDB.save({ id: generateId(), ...dataToSave });
      }
      toast.success(editing ? 'Cliente actualizado correctamente.' : 'Cliente creado correctamente.');
      setIsModalOpen(false);
      await loadList();
    } catch {
      toast.error('No se pudo completar la operación. Intentá de nuevo.');
    }
  };

  const handleDelete = async (id: string) => {
    const target = customers.find((c) => c.id === id);
    if (target && isConsumidorFinal(target)) {
      toast.error('No se puede eliminar el cliente Consumidor Final (requerido por el POS).');
      return;
    }
    const ok = await confirm({
      title: 'Eliminar cliente',
      description: 'Esta acción no se puede deshacer.',
      confirmLabel: 'Sí, eliminar',
    });
    if (!ok) return;
    try {
      await customersDB.delete(id);
      toast.success('Cliente eliminado correctamente.');
      if (selected?.id === id) {
        setSelected(null);
        setMovements([]);
      }
      await loadList();
    } catch {
      toast.error('No se pudo completar la operación. Intentá de nuevo.');
    }
  };

  const getListName = (id: string | null) => {
    if (!id) return '- Ninguna -';
    return lists.find((l) => l.id === id)?.name || 'Desconocida';
  };

  const customerForm = (
    <form onSubmit={handleSave} className="space-y-4">
      <div>
        <label className="block text-sm">Razón Social / Nombre</label>
        <input
          required
          className="w-full border p-2 rounded"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm">Teléfono</label>
          <input
            className="w-full border p-2 rounded"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm">Email</label>
          <input
            type="email"
            className="w-full border p-2 rounded"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
        </div>
      </div>
      <div>
        <label className="block text-sm">Dirección</label>
        <input
          className="w-full border p-2 rounded"
          value={formData.address}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
        />
      </div>
      <div>
        <label className="block text-sm mb-1">Lista de Precios</label>
        <SearchableSelect
          options={[
            { value: '', label: '- Seleccione una lista -' },
            ...lists.map((l) => ({ value: l.id, label: l.name })),
          ]}
          value={
            formData.priceListId
              ? { value: formData.priceListId, label: lists.find((l) => l.id === formData.priceListId)?.name }
              : { value: '', label: '- Seleccione una lista -' }
          }
          onChange={(sel: { value: string } | null) =>
            setFormData({ ...formData, priceListId: sel?.value || '' })
          }
        />
      </div>
      <div>
        <label className="block text-sm">Notas</label>
        <textarea
          className="w-full border p-2 rounded"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
        />
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
          Cancelar
        </Button>
        <Button type="submit">Guardar</Button>
      </div>
    </form>
  );

  if (selected) {
    return (
      <div className="space-y-6">
        <div>
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setMovements([]);
              loadList();
            }}
            className="text-sm text-brand-muted hover:text-brand-brown mb-1"
          >
            ← Volver al listado
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{selected.name}</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-brand-border overflow-hidden">
          <div className="px-6 py-4 border-b border-brand-border flex flex-wrap justify-between items-center gap-3 bg-brand-cream/30">
            <h2 className="font-bold text-brand-brown flex items-center gap-2">
              <span className="w-2 h-4 bg-brand-orange rounded-full" />
              Datos del cliente
            </h2>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => handleOpenModal(selected)}>
                Editar
              </Button>
              <Button variant="danger" onClick={() => handleDelete(selected.id)}>
                Eliminar
              </Button>
            </div>
          </div>
          <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs text-brand-muted uppercase font-bold">Teléfono</div>
              <div className="text-gray-800">{selected.phone || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-brand-muted uppercase font-bold">Email</div>
              <div className="text-gray-800">{selected.email || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-brand-muted uppercase font-bold">Dirección</div>
              <div className="text-gray-800">{selected.address || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-brand-muted uppercase font-bold">Lista de precios</div>
              <div>
                <Badge variant="success">{getListName(selected.priceListId)}</Badge>
              </div>
            </div>
            {selected.notes ? (
              <div className="sm:col-span-2">
                <div className="text-xs text-brand-muted uppercase font-bold">Notas</div>
                <div className="text-gray-800 whitespace-pre-wrap">{selected.notes}</div>
              </div>
            ) : null}
          </div>
        </div>

        <CuentaCorriente
          movements={movements}
          partyType="customer"
          onChanged={refreshDetail}
          onRegistrar={() => setMovModalOpen(true)}
        />

        <RegistrarMovimientoModal
          isOpen={movModalOpen}
          onClose={() => setMovModalOpen(false)}
          onSaved={refreshDetail}
          partyType="customer"
          partyId={selected.id}
          partyName={selected.name}
        />

        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Editar Cliente">
          {customerForm}
        </Modal>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
        <Button onClick={() => handleOpenModal()}>Nuevo Cliente</Button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-brand-border flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-brand-border flex justify-between items-center bg-brand-cream/30">
          <h2 className="font-bold text-brand-brown flex items-center gap-2">
            <span className="w-2 h-4 bg-brand-orange rounded-full" />
            Directorio de Clientes
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[10px] uppercase text-white font-bold bg-brand-navy">
              <tr>
                <th className="px-6 py-3 text-left">Razón Social</th>
                <th className="px-6 py-3 text-left">Contacto</th>
                <th className="px-6 py-3 text-left">Lista Asignada</th>
                <th className="px-6 py-3 text-right">Saldo</th>
                <th className="px-6 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-sm text-gray-600">
              {customers.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => openDetail(c)}
                >
                  <td className="px-6 py-3 font-medium text-gray-800">{c.name}</td>
                  <td className="px-6 py-3">
                    <div className="text-gray-800">{c.phone}</div>
                    <div className="text-xs text-gray-500">{c.email}</div>
                  </td>
                  <td className="px-6 py-3">
                    <Badge variant="success">{getListName(c.priceListId)}</Badge>
                  </td>
                  <td className="px-6 py-3 text-right font-mono font-medium text-gray-800">
                    {formatCurrency(balances.get(c.id) ?? 0)}
                  </td>
                  <td className="px-6 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end">
                      <ActionButtons
                        onEdit={() => handleOpenModal(c)}
                        onDelete={() => handleDelete(c.id)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editing ? 'Editar Cliente' : 'Nuevo Cliente'}
      >
        {customerForm}
      </Modal>
    </div>
  );
}
