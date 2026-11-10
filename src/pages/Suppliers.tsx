import React, { useEffect, useState } from 'react';
import { accountMovementsDB, suppliersDB, purchasesDB, productsDB } from '../lib/db';
import { AccountMovement, Product, Purchase, Supplier } from '../types';
import { Button, ActionButtons, Modal, useConfirm, useToast } from '../components/ui';
import { formatCurrency, generateId } from '../lib/utils';
import { rpcErrorText } from '../lib/checks';
import { balancesByParty, computeBalance } from '../lib/accountMovements';
import CuentaCorriente from '../components/CuentaCorriente';
import RegistrarMovimientoModal from '../components/RegistrarMovimientoModal';
import PurchaseTicketModal from '../components/PurchaseTicketModal';

const emptyForm = {
  name: '',
  cuit: '',
  contactName: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
};

export default function Suppliers() {
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [movements, setMovements] = useState<AccountMovement[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [movModalOpen, setMovModalOpen] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [ticketPurchase, setTicketPurchase] = useState<Purchase | null>(null);
  const [products, setProducts] = useState<Product[]>([]);

  const loadList = async () => {
    try {
      const [list, activeMovs] = await Promise.all([
        suppliersDB.getAll(),
        accountMovementsDB.getAllActive(),
      ]);
      setSuppliers(list);
      setBalances(balancesByParty(activeMovs, 'supplier'));
    } catch {
      toast.error('No se pudieron cargar los proveedores.');
    }
  };

  const loadBook = async (supplierId: string) => {
    try {
      setMovements(await accountMovementsDB.getBySupplier(supplierId));
    } catch {
      toast.error('No se pudo cargar la cuenta corriente.');
    }
  };

  useEffect(() => {
    loadList();
    (async () => {
      try {
        setProducts(await productsDB.getAll());
      } catch {
        /* ticket opcional */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openPurchaseFromBook = async (id: string) => {
    try {
      const purchase = await purchasesDB.getById(id, true);
      if (!purchase) {
        toast.error('No se encontró la compra.');
        return;
      }
      setTicketPurchase(purchase);
    } catch {
      toast.error('No se pudo abrir el comprobante de compra.');
    }
  };

  const openDetail = async (supplier: Supplier) => {
    setSelected(supplier);
    await loadBook(supplier.id);
  };

  const refreshDetail = async () => {
    if (!selected) return;
    const fresh = await suppliersDB.getById(selected.id);
    if (fresh) setSelected(fresh);
    await loadBook(selected.id);
    await loadList();
  };

  const handleOpenModal = (item?: Supplier) => {
    if (item) {
      setEditing(item);
      setFormData({
        name: item.name,
        cuit: item.cuit || '',
        contactName: item.contactName || '',
        phone: item.phone,
        email: item.email,
        address: item.address,
        notes: item.notes,
      });
    } else {
      setEditing(null);
      setFormData(emptyForm);
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        cuit: formData.cuit.trim() || null,
        contactName: formData.contactName.trim() || null,
      };
      if (editing) {
        const updated = { ...editing, ...payload };
        await suppliersDB.save(updated);
        if (selected?.id === editing.id) setSelected(updated);
      } else {
        await suppliersDB.save({ id: generateId(), ...payload });
      }
      toast.success(editing ? 'Proveedor actualizado correctamente.' : 'Proveedor creado correctamente.');
      setIsModalOpen(false);
      await loadList();
    } catch (err) {
      toast.error(rpcErrorText(err) || 'Supabase no devolvió el motivo del error.');
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Eliminar proveedor',
      description: 'Esta acción no se puede deshacer.',
      confirmLabel: 'Sí, eliminar',
    });
    if (!ok) return;
    try {
      await suppliersDB.delete(id);
      toast.success('Proveedor eliminado correctamente.');
      if (selected?.id === id) {
        setSelected(null);
        setMovements([]);
      }
      await loadList();
    } catch (err) {
      toast.error(rpcErrorText(err) || 'Supabase no devolvió el motivo del error.');
    }
  };

  const supplierForm = (
    <form onSubmit={handleSave} className="space-y-4">
      <div>
        <label className="block text-sm">Razón Social</label>
        <input
          required
          className="w-full border p-2 rounded"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm">CUIT / CUIL</label>
          <input
            className="w-full border p-2 rounded"
            value={formData.cuit}
            onChange={(e) => setFormData({ ...formData, cuit: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm">Persona de Contacto</label>
          <input
            className="w-full border p-2 rounded"
            value={formData.contactName}
            onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
          />
        </div>
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
              Datos del proveedor
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
              <div className="text-xs text-brand-muted uppercase font-bold">CUIT / CUIL</div>
              <div className="text-gray-800">{selected.cuit || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-brand-muted uppercase font-bold">Persona de Contacto</div>
              <div className="text-gray-800">{selected.contactName || '—'}</div>
            </div>
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
          partyType="supplier"
          onChanged={refreshDetail}
          onRegistrar={() => setMovModalOpen(true)}
          onOpenDocument={({ type, id }) => {
            if (type === 'compra') openPurchaseFromBook(id);
          }}
        />

        <RegistrarMovimientoModal
          isOpen={movModalOpen}
          onClose={() => setMovModalOpen(false)}
          onSaved={refreshDetail}
          partyType="supplier"
          partyId={selected.id}
          partyName={selected.name}
          currentBalance={computeBalance(movements, 'supplier')}
        />

        <PurchaseTicketModal
          purchase={ticketPurchase}
          onClose={() => setTicketPurchase(null)}
          onUpdated={refreshDetail}
          products={products}
          suppliers={suppliers}
          initialMode="view"
        />

        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Editar Proveedor">
          {supplierForm}
        </Modal>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Proveedores</h1>
        <Button onClick={() => handleOpenModal()}>Nuevo Proveedor</Button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-brand-border flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-brand-border flex justify-between items-center bg-brand-cream/30">
          <h2 className="font-bold text-brand-brown flex items-center gap-2">
            <span className="w-2 h-4 bg-brand-orange rounded-full" />
            Directorio de Proveedores
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[10px] uppercase text-white font-bold bg-brand-navy">
              <tr>
                <th className="px-6 py-3 text-left">Razón Social</th>
                <th className="px-6 py-3 text-left">Contacto</th>
                <th className="px-6 py-3 text-left">Dirección</th>
                <th className="px-6 py-3 text-right">Saldo</th>
                <th className="px-6 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-sm text-gray-600">
              {suppliers.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => openDetail(s)}
                >
                  <td className="px-6 py-3 font-medium text-gray-800">{s.name}</td>
                  <td className="px-6 py-3">
                    <div className="text-gray-800">{s.contactName?.trim() || s.phone || '—'}</div>
                    <div className="text-xs text-gray-500">{s.email}</div>
                  </td>
                  <td className="px-6 py-3 text-gray-500">{s.address}</td>
                  <td className="px-6 py-3 text-right font-mono font-medium text-gray-800">
                    {formatCurrency(balances.get(s.id) ?? 0)}
                  </td>
                  <td className="px-6 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end">
                      <ActionButtons
                        onEdit={() => handleOpenModal(s)}
                        onDelete={() => handleDelete(s.id)}
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
        title={editing ? 'Editar Proveedor' : 'Nuevo Proveedor'}
      >
        {supplierForm}
      </Modal>
    </div>
  );
}
