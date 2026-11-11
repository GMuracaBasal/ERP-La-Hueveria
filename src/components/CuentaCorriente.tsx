import React, { useState } from 'react';
import { Eye, Printer } from 'lucide-react';
import type { AccountMovement, AccountPartyType } from '../types';
import { Badge, Button, Modal, useConfirm, useToast } from './ui';
import { formatCurrency, formatFecha, formatFechaHora } from '../lib/utils';
import { computeBalance, withRunningBalance, type AccountMovementRow } from '../lib/accountMovements';
import { accountMovementsDB, customersDB, db, paymentsDB, paymentValuesDB, suppliersDB, type PaymentValueView } from '../lib/db';
import { paymentMethodLabel } from '../lib/paymentMethods';
import { getReceivedCheckErrorMessage } from '../lib/checks';
import { useAuth } from '../contexts/AuthContext';
import ReciboModal, { type ReciboModalProps } from './ReciboModal';

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
  // El saldo corrido se calcula de la más vieja a la más nueva; en pantalla se ve al revés.
  const rows = withRunningBalance(movements, partyType).slice().reverse();
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
  const [recibo, setRecibo] = useState<Omit<ReciboModalProps, 'isOpen' | 'onClose'> | null>(null);
  const [valueDetail, setValueDetail] = useState<{ title: string; rows: PaymentValueView[]; total: number } | null>(null);

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

  const openValues = async (m: AccountMovementRow) => {
    if (!m.referenceId) return;
    try {
      const [payment, rows] = await Promise.all([
        paymentsDB.getById(m.referenceId),
        paymentValuesDB.listViews(m.referenceId),
      ]);
      setValueDetail({
        title: m.concept,
        rows,
        total: payment?.amount ?? (m.haber > 0 ? m.haber : m.debe),
      });
    } catch (err) {
      toast.error(getReceivedCheckErrorMessage(err));
    }
  };

  const openRecibo = async (m: AccountMovementRow) => {
    const partyId = partyType === 'customer' ? m.customerId : m.supplierId;
    if (!partyId) {
      toast.error('No se encontró el titular de este movimiento.');
      return;
    }

    try {
      const [titular, payment, settings] = await Promise.all([
        partyType === 'customer' ? customersDB.getById(partyId) : suppliersDB.getById(partyId),
        m.referenceId ? paymentsDB.getById(m.referenceId) : Promise.resolve(undefined),
        db.getSettings(),
      ]);
      let valueRows: PaymentValueView[] = [];
      if (m.referenceId) {
        try {
          valueRows = await paymentValuesDB.listViews(m.referenceId);
        } catch {
          valueRows = [];
        }
      }
      if (!titular) {
        toast.error('No se encontraron los datos del titular.');
        return;
      }

      const amount = payment?.amount ?? (m.haber > 0 ? m.haber : m.debe);
      const docType = m.referenceType === 'pago' ? 'recibo_pago' as const : 'recibo_cobro' as const;

      setRecibo({
        docType,
        documentNumber: payment?.id || m.referenceId || m.id,
        date: payment?.date || m.date,
        businessName: settings.businessName || 'La Huevería',
        party: {
          sectionTitle: docType === 'recibo_pago' ? 'PROVEEDOR' : 'DESTINATARIO',
          name: titular.name,
          taxId: titular.cuit || null,
          contactName: titular.contactName || null,
          address: titular.address || null,
          phone: titular.phone || null,
        },
        payment: {
          paymentMethod: paymentMethodLabel(payment?.paymentMethod),
          concept: payment?.concept || m.concept,
          amount,
          balanceAfter: m.runningBalance,
          lines: valueRows.map((row) => ({
            label: paymentMethodLabel(row.method),
            detail: [row.accountName, row.checkNumber ? `Nº ${row.checkNumber}` : null, row.detail]
              .filter(Boolean)
              .join(' · ') || null,
            amount: row.amount,
          })),
        },
        voided: m.voided || !!payment?.voided,
      });
    } catch {
      toast.error('No se pudo armar el recibo. Intentá de nuevo.');
    }
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
        toast.error(getReceivedCheckErrorMessage(err));
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
                      {isStandalonePayment(m, movements) ? (
                        <button
                          type="button"
                          className={`text-left font-medium text-brand-teja hover:underline ${
                            m.voided ? 'line-through opacity-70' : ''
                          }`}
                          onClick={() => openValues(m)}
                        >
                          {m.concept}
                        </button>
                      ) : clickable ? (
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
                    <div className="inline-flex items-center justify-end gap-1">
                      {isStandalonePayment(m, movements) && (
                        <>
                          <button
                            type="button"
                            title="Ver valores"
                            aria-label="Ver valores"
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-brand-durazno/60 hover:text-brand-navy transition-colors"
                            onClick={() => openValues(m)}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            title="Imprimir recibo"
                            aria-label="Imprimir recibo"
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-brand-durazno/60 hover:text-brand-navy transition-colors"
                            onClick={() => openRecibo(m)}
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                        </>
                      )}
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
                    </div>
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
            Se anulará <strong>{voidTarget?.concept}</strong> en la cuenta corriente.
            También se revierten sus valores: la plata vuelve a la cuenta, un cheque recibido
            de este cobro queda anulado y un cheque endosado vuelve a la cartera. Si algún
            cheque ya se acreditó o se debitó, primero hay que resolverlo.
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

      {valueDetail && (
        <Modal isOpen onClose={() => setValueDetail(null)} title="Valores del movimiento" wide>
          <div className="space-y-3">
            <p className="text-sm text-brand-muted">{valueDetail.title}</p>
            {valueDetail.rows.length === 0 ? (
              <p className="text-sm text-brand-muted">Este movimiento no tiene valores cargados.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="text-[10px] uppercase text-white font-bold bg-brand-navy">
                  <tr>
                    <th className="px-3 py-2 text-left">Tipo</th>
                    <th className="px-3 py-2 text-left">Cuenta / Banco</th>
                    <th className="px-3 py-2 text-left">Nº cheque</th>
                    <th className="px-3 py-2 text-left">Vencimiento</th>
                    <th className="px-3 py-2 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {valueDetail.rows.map((row) => (
                    <tr key={row.id} className="border-t border-gray-100">
                      <td className="px-3 py-2">{paymentMethodLabel(row.method)}</td>
                      <td className="px-3 py-2">{row.accountName || row.detail || '—'}</td>
                      <td className="px-3 py-2">{row.checkNumber || '—'}</td>
                      <td className="px-3 py-2">{row.dueDate ? formatFecha(row.dueDate) : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="text-sm text-right font-bold text-brand-brown">
              Total {formatCurrency(valueDetail.total)}
            </p>
          </div>
        </Modal>
      )}

      {recibo && (
        <ReciboModal
          isOpen
          onClose={() => setRecibo(null)}
          {...recibo}
        />
      )}
    </div>
  );
}
