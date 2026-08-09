import React, { useState } from 'react';
import type { AccountMovement, AccountPartyType } from '../types';
import { Badge, Button, Modal, useConfirm, useToast } from './ui';
import { formatCurrency, formatFechaHora } from '../lib/utils';
import { computeBalance, withRunningBalance } from '../lib/accountMovements';
import { accountMovementsDB, paymentsDB } from '../lib/db';
import { useAuth } from '../contexts/AuthContext';

interface CuentaCorrienteProps {
  movements: AccountMovement[];
  partyType: AccountPartyType;
  onChanged: () => void;
  onRegistrar: () => void;
  /** Abre el comprobante (venta/compra) en modo lectura. */
  onOpenDocument?: (ref: { type: 'venta' | 'compra'; id: string }) => void;
}

/** Cobro/pago autónomo (tabla payments), no el cobro embebido en una venta/compra Contado. */
function isStandalonePayment(m: AccountMovement, all: AccountMovement[]): boolean {
  if (m.referenceType !== 'cobro' && m.referenceType !== 'pago') return false;
  if (!m.referenceId) return false;
  return !all.some(
    (x) =>
      x.referenceId === m.referenceId &&
      (x.referenceType === 'venta' || x.referenceType === 'compra'),
  );
}

/** Libro reutilizable (cliente o proveedor). Se embebe en la ficha del titular. */
export default function CuentaCorriente({
  movements,
  partyType,
  onChanged,
  onRegistrar,
  onOpenDocument,
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

  const [voidTarget, setVoidTarget] = useState<AccountMovement | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidError, setVoidError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const refBadge = (m: AccountMovement) => {
    if (m.voided) return null;
    if (m.referenceType === 'ajuste') return <Badge variant="default">Ajuste</Badge>;
    if (m.referenceType === 'cobro') return <Badge variant="success">Cobro</Badge>;
    if (m.referenceType === 'pago') return <Badge variant="warning">Pago</Badge>;
    if (m.referenceType === 'venta') return <Badge variant="default">Venta</Badge>;
    if (m.referenceType === 'compra') return <Badge variant="default">Compra</Badge>;
    return null;
  };

  const isDocumentRef = (m: AccountMovement): m is AccountMovement & { referenceId: string } =>
    (m.referenceType === 'venta' || m.referenceType === 'compra') && !!m.referenceId;

  const canVoidFromBook = (m: AccountMovement) => {
    if (m.voided) return false;
    if (m.referenceType === 'ajuste') return true;
    if (m.referenceType === 'cobro' || m.referenceType === 'pago') {
      return isStandalonePayment(m, movements);
    }
    return false;
  };

  const openVoid = async (m: AccountMovement) => {
    if (m.referenceType === 'venta' || m.referenceType === 'compra') {
      toast.warning(
        m.referenceType === 'venta'
          ? 'Las ventas se anulan desde el ticket de venta, no desde el libro.'
          : 'Las compras se anulan desde Compras, no desde el libro.',
      );
      return;
    }

    if (m.referenceType === 'ajuste') {
      if (!user) return;
      const ok = await confirm({
        title: 'Anular ajuste',
        description: `Se anulará "${m.concept}". El saldo se recalculará sin esta línea. No se puede deshacer.`,
        confirmLabel: 'Sí, anular',
      });
      if (!ok) return;
      try {
        await accountMovementsDB.void(m.id, user.id);
        toast.success('Movimiento anulado correctamente.');
        onChanged();
      } catch {
        toast.error('No se pudo anular el movimiento. Intentá de nuevo.');
      }
      return;
    }

    if (!isStandalonePayment(m, movements)) {
      toast.warning('Este movimiento se anula desde el comprobante de venta/compra.');
      return;
    }

    setVoidTarget(m);
    setVoidReason('');
    setVoidError('');
  };

  const handleVoidPayment = async () => {
    if (!user || !voidTarget?.referenceId) return;
    const reason = voidReason.trim();
    if (!reason) {
      setVoidError('El motivo es obligatorio.');
      return;
    }
    setSubmitting(true);
    try {
      await paymentsDB.void(voidTarget.referenceId, user.id, reason);
      toast.success(
        voidTarget.referenceType === 'cobro'
          ? 'Cobro anulado (cuenta corriente + caja).'
          : 'Pago anulado (cuenta corriente + caja).',
      );
      setVoidTarget(null);
      onChanged();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('REASON_REQUIRED')) {
        setVoidError('El motivo es obligatorio.');
      } else if (msg.includes('PAYMENT_ALREADY_VOIDED')) {
        toast.error('Este cobro/pago ya fue anulado.');
        setVoidTarget(null);
        onChanged();
      } else if (msg.includes('PAYMENT_NOT_FOUND')) {
        toast.warning('Este movimiento se anula desde el comprobante de venta/compra.');
        setVoidTarget(null);
      } else {
        toast.error('No se pudo anular. Intentá de nuevo.');
      }
    } finally {
      setSubmitting(false);
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
                  Sin movimientos. Registrá un cobro, pago o ajuste de apertura.
                </td>
              </tr>
            )}
            {rows.map((m) => {
              const clickable = isDocumentRef(m) && !!onOpenDocument;
              return (
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
                      {clickable ? (
                        <button
                          type="button"
                          className={`text-left font-medium text-brand-teja hover:underline ${
                            m.voided ? 'line-through opacity-70' : ''
                          }`}
                          onClick={() =>
                            onOpenDocument!({
                              type: m.referenceType as 'venta' | 'compra',
                              id: m.referenceId!,
                            })
                          }
                        >
                          {m.concept}
                        </button>
                      ) : (
                        <span className={m.voided ? 'line-through' : ''}>{m.concept}</span>
                      )}
                      {m.voided && <Badge variant="danger">ANULADO</Badge>}
                      {refBadge(m)}
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
                    {canVoidFromBook(m) && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => openVoid(m)}
                      >
                        Anular
                      </Button>
                    )}
                    {!m.voided &&
                      (m.referenceType === 'venta' ||
                        m.referenceType === 'compra' ||
                        ((m.referenceType === 'cobro' || m.referenceType === 'pago') &&
                          !isStandalonePayment(m, movements))) && (
                        <span className="text-xs text-brand-muted italic">Desde el comprobante</span>
                      )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={!!voidTarget}
        onClose={() => setVoidTarget(null)}
        title={voidTarget?.referenceType === 'cobro' ? 'Anular cobro' : 'Anular pago'}
      >
        <div className="space-y-4">
          <p className="text-sm text-brand-muted">
            Se anulará <strong>{voidTarget?.concept}</strong> en la cuenta corriente y su
            movimiento en caja. No se puede deshacer.
          </p>
          <div>
            <label className="block text-sm font-semibold mb-1">
              Motivo <span className="text-brand-danger">*</span>
            </label>
            <textarea
              className={`w-full border border-brand-border rounded-lg p-2 text-sm ${
                voidError ? 'border-red-400' : ''
              }`}
              rows={3}
              value={voidReason}
              onChange={(e) => {
                setVoidReason(e.target.value);
                setVoidError('');
              }}
              placeholder="Ej: cobro duplicado, medio de pago incorrecto..."
            />
            {voidError && <p className="text-xs text-brand-danger mt-1">{voidError}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setVoidTarget(null)}>
              Cancelar
            </Button>
            <Button variant="danger" disabled={submitting} onClick={handleVoidPayment}>
              {submitting ? 'Anulando…' : 'Sí, anular'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
