import React from 'react';
import type { AccountMovement, AccountPartyType } from '../types';
import { Badge, Button, useConfirm, useToast } from './ui';
import { formatCurrency, formatFechaHora } from '../lib/utils';
import { computeBalance, withRunningBalance } from '../lib/accountMovements';
import { accountMovementsDB } from '../lib/db';
import { useAuth } from '../contexts/AuthContext';

interface CuentaCorrienteProps {
  movements: AccountMovement[];
  partyType: AccountPartyType;
  onChanged: () => void;
  onRegistrar: () => void;
}

/** Libro reutilizable (cliente o proveedor). Se embebe en la ficha del titular. */
export default function CuentaCorriente({
  movements,
  partyType,
  onChanged,
  onRegistrar,
}: CuentaCorrienteProps) {
  const { user } = useAuth();
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const rows = withRunningBalance(movements, partyType);
  const balance = computeBalance(movements, partyType);
  const balanceHint =
    partyType === 'customer'
      ? balance > 0
        ? 'Nos debe'
        : balance < 0
          ? 'A favor del cliente'
          : 'Al día'
      : balance > 0
        ? 'Le debemos'
        : balance < 0
          ? 'A nuestro favor'
          : 'Al día';

  const handleVoid = async (id: string, concept: string) => {
    if (!user) return;
    const ok = await confirm({
      title: 'Anular movimiento',
      description: `Se anulará "${concept}". El saldo se recalculará sin esta línea. No se puede deshacer.`,
      confirmLabel: 'Sí, anular',
    });
    if (!ok) return;
    try {
      await accountMovementsDB.void(id, user.id);
      toast.success('Movimiento anulado correctamente.');
      onChanged();
    } catch {
      toast.error('No se pudo anular el movimiento. Intentá de nuevo.');
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-brand-border flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-brand-border flex flex-wrap justify-between items-center gap-3 bg-brand-cream/30">
        <div>
          <h2 className="font-bold text-brand-brown flex items-center gap-2">
            <span className="w-2 h-4 bg-brand-orange rounded-full" />
            Cuenta corriente
          </h2>
          <p className="text-sm text-brand-muted mt-1">
            Saldo:{' '}
            <span className="font-bold text-brand-brown">{formatCurrency(balance)}</span>
            <span className="ml-2 text-xs">({balanceHint})</span>
          </p>
        </div>
        <Button onClick={onRegistrar}>Registrar Movimiento</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-[10px] uppercase text-white font-bold bg-brand-navy">
            <tr>
              <th className="px-4 py-3 text-left">Fecha</th>
              <th className="px-4 py-3 text-left">Concepto</th>
              <th className="px-4 py-3 text-right">Debe</th>
              <th className="px-4 py-3 text-right">Haber</th>
              <th className="px-4 py-3 text-right">Saldo</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="text-sm text-gray-600">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-brand-muted italic">
                  Sin movimientos. Registrá un ajuste de apertura para cargar el saldo inicial.
                </td>
              </tr>
            )}
            {rows.map((m) => (
              <tr
                key={m.id}
                className={`border-b border-gray-50 ${
                  m.voided ? 'bg-gray-50 text-gray-400' : 'hover:bg-gray-50'
                }`}
              >
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatFechaHora(m.date)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={m.voided ? 'line-through' : ''}>{m.concept}</span>
                    {m.voided && <Badge variant="danger">ANULADO</Badge>}
                    {m.referenceType === 'ajuste' && !m.voided && (
                      <Badge variant="default">Ajuste</Badge>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {m.debe > 0 ? formatCurrency(m.debe) : '—'}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {m.haber > 0 ? formatCurrency(m.haber) : '—'}
                </td>
                <td className="px-4 py-3 text-right font-mono font-medium text-gray-800">
                  {formatCurrency(m.runningBalance)}
                </td>
                <td className="px-4 py-3 text-right">
                  {!m.voided && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => handleVoid(m.id, m.concept)}
                    >
                      Anular
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
