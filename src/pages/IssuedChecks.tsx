import React, { useEffect, useMemo, useState } from 'react';
import { issuedChecksDB, suppliersDB, treasuryAccountsDB } from '../lib/db';
import type { IssuedCheck, Supplier, TreasuryAccount } from '../types';
import { Badge, Button, Modal, SearchableSelect, useConfirm, useToast } from '../components/ui';
import InputFecha from '../components/InputFecha';
import FiltroFechas, { type DateRange, isDateInRange } from '../components/FiltroFechas';
import { useAuth } from '../contexts/AuthContext';
import {
  ISSUED_CHECK_STATUS_OPTIONS,
  checkKindLabel,
  getReceivedCheckErrorMessage,
  issuedCheckStatusLabel,
  issuedCheckStatusVariant,
  issuedDueAttention,
  issuedDueMark,
  rpcErrorText,
  sumIssuedChecks,
  sumVigenteIssued,
} from '../lib/checks';
import { roundMoney } from '../lib/accountMovements';
import { formatCurrency, formatFecha, isoDateToTimestamp, parseLocalDate, todayISODate } from '../lib/utils';

type Mode = 'view' | 'debit' | 'reject';

function shiftISO(iso: string, days: number): string {
  const d = parseLocalDate(iso);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function initialRange(): DateRange {
  const today = todayISODate();
  return { from: shiftISO(today, -180), to: shiftISO(today, 365) };
}

export default function IssuedChecks() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const [checks, setChecks] = useState<IssuedCheck[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [range, setRange] = useState(initialRange);
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [loadError, setLoadError] = useState('');

  const [mode, setMode] = useState<Mode | null>(null);
  const [active, setActive] = useState<IssuedCheck | null>(null);
  const [actionDate, setActionDate] = useState(todayISODate());
  const [reason, setReason] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const supplierName = (id: string | null) => suppliers.find((s) => s.id === id)?.name ?? '—';
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? '—';

  const load = async () => {
    try {
      const [rows, provs, accs] = await Promise.all([
        issuedChecksDB.listAll(),
        suppliersDB.getAll(),
        treasuryAccountsDB.getAll(),
      ]);
      setChecks(rows);
      setSuppliers(provs);
      setAccounts(accs);
      setLoadError('');
    } catch (err) {
      setChecks([]);
      setLoadError(getReceivedCheckErrorMessage(err));
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    return checks.filter((c) => {
      const due = c.dueDate.slice(0, 10);
      if (due < range.from || due > range.to) return false;
      if (statusFilter !== 'todos' && c.status !== statusFilter) return false;
      return true;
    });
  }, [checks, range, statusFilter]);

  const vigentes = sumVigenteIssued(checks);
  const pendientes = sumIssuedChecks(checks, 'pendiente');
  const debitadosPeriodo = checks
    .filter((c) => !c.voided && c.status === 'debitado' && !!c.debitedAt && isDateInRange(c.debitedAt, range.from, range.to))
    .reduce((acc, c) => roundMoney(acc + c.amount), 0);

  const resetModal = () => {
    setMode(null);
    setActive(null);
    setFieldErrors({});
  };

  const close = () => {
    if (saving) return;
    resetModal();
  };

  const openAction = (next: Mode, check: IssuedCheck) => {
    setActive(check);
    setActionDate(todayISODate());
    setReason('');
    setFieldErrors({});
    setMode(next);
  };

  const handleDebit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !active) return;
    if (!actionDate) {
      setFieldErrors({ date: 'La fecha es obligatoria.' });
      return;
    }
    setSaving(true);
    try {
      await issuedChecksDB.debit(active.id, isoDateToTimestamp(actionDate), user.id);
      toast.success(`Cheque debitado. ${accountName(active.accountId)} bajó ${formatCurrency(active.amount)}.`);
      setSaving(false);
      resetModal();
      await load();
    } catch (err) {
      toast.error(getReceivedCheckErrorMessage(err));
      setSaving(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !active) return;
    if (!actionDate) {
      setFieldErrors({ date: 'La fecha es obligatoria.' });
      return;
    }
    if (!reason.trim()) {
      setFieldErrors({ reason: 'El motivo es obligatorio.' });
      return;
    }
    const ok = await confirm({
      title: 'Rechazar cheque propio',
      description: `Se anula el pago completo. El proveedor vuelve a tener la deuda de ${formatCurrency(active.amount)} y, si el pago tenía otros valores, también se revierten. Ninguna cuenta se mueve: el cheque todavía no estaba debitado.`,
      confirmLabel: 'Sí, rechazar',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await issuedChecksDB.reject(active.id, isoDateToTimestamp(actionDate), reason.trim(), user.id);
      toast.success('Cheque rechazado. Volvió la deuda del proveedor y se revirtió el pago.');
      setSaving(false);
      resetModal();
      await load();
    } catch (err) {
      const raw = rpcErrorText(err);
      if (raw.includes('REASON_REQUIRED')) setFieldErrors({ reason: 'El motivo es obligatorio.' });
      else toast.error(getReceivedCheckErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-end gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-muted mb-1">Vencimiento</p>
          <FiltroFechas from={range.from} to={range.to} onChange={setRange} />
        </div>
        <div className="min-w-[200px]">
          <p className="text-xs font-bold uppercase tracking-wider text-brand-muted mb-1">Estado</p>
          <SearchableSelect
            options={ISSUED_CHECK_STATUS_OPTIONS}
            value={ISSUED_CHECK_STATUS_OPTIONS.find((o) => o.value === statusFilter) ?? ISSUED_CHECK_STATUS_OPTIONS[0]}
            onChange={(selected: { value: string } | null) => setStatusFilter(selected?.value || 'todos')}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-red-50 rounded-2xl border border-red-300 px-5 py-4">
          <div className="text-xs font-bold uppercase tracking-wider text-brand-muted">Vigentes</div>
          <div className="text-2xl font-bold text-red-800 mt-1">{loadError ? '—' : formatCurrency(vigentes)}</div>
          <p className="text-xs text-brand-muted mt-1">Para pagar. Desde la fecha de cobro y por 30 días.</p>
        </div>
        <div className="bg-white rounded-2xl border border-brand-border px-5 py-4">
          <div className="text-xs font-bold uppercase tracking-wider text-brand-muted">Pendientes de débito</div>
          <div className="text-2xl font-bold text-brand-brown mt-1">{loadError ? '—' : formatCurrency(pendientes)}</div>
          <p className="text-xs text-brand-muted mt-1">Ahora. Siguen figurando en el saldo de la cuenta hasta que se debiten.</p>
        </div>
        <div className="bg-white rounded-2xl border border-brand-border px-5 py-4">
          <div className="text-xs font-bold uppercase tracking-wider text-brand-muted">Debitados en el período</div>
          <div className="text-2xl font-bold text-brand-brown mt-1">{loadError ? '—' : formatCurrency(debitadosPeriodo)}</div>
          <p className="text-xs text-brand-muted mt-1">Según el filtro de fechas, por fecha de débito.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-brand-border flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-brand-border bg-brand-cream/30">
          <h2 className="font-bold text-brand-brown flex items-center gap-2">
            <span className="w-2 h-4 bg-brand-orange rounded-full" />
            Cheques emitidos
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[10px] uppercase text-white font-bold bg-brand-navy">
              <tr>
                <th className="px-4 py-3 text-left">Nº</th>
                <th className="px-4 py-3 text-left">Cuenta</th>
                <th className="px-4 py-3 text-left">Proveedor</th>
                <th className="px-4 py-3 text-right">Importe</th>
                <th className="px-4 py-3 text-left">Vencimiento</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loadError && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-sm text-brand-danger">{loadError}</td>
                </tr>
              )}
              {!loadError && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-brand-muted italic">
                    No hay cheques emitidos en este vencimiento y estado.
                  </td>
                </tr>
              )}
              {filtered.map((c) => {
                const dueMark = issuedDueMark(issuedDueAttention(c));
                return (
                  <tr
                    key={c.id}
                    className={`border-b border-gray-50 ${dueMark?.rowClass ?? 'hover:bg-gray-50'}`}
                  >
                    <td className="px-4 py-3 font-medium text-gray-800">{c.checkNumber}</td>
                    <td className="px-4 py-3">{accountName(c.accountId)}</td>
                    <td className="px-4 py-3">{supplierName(c.supplierId)}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatCurrency(c.amount)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex flex-wrap items-center gap-2">
                        {formatFecha(c.dueDate)}
                        {dueMark && <Badge variant={dueMark.variant}>{dueMark.label}</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={issuedCheckStatusVariant(c.status)}>{issuedCheckStatusLabel(c.status)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex flex-wrap justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openAction('view', c)}>Ver</Button>
                        {c.status === 'pendiente' && !c.voided && (
                          <>
                            <Button size="sm" onClick={() => openAction('debit', c)}>Debitar</Button>
                            <Button size="sm" variant="danger" onClick={() => openAction('reject', c)}>Rechazar</Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={mode !== null}
        onClose={close}
        title={
          mode === 'debit' ? 'Debitar cheque propio'
            : mode === 'reject' ? 'Rechazar cheque propio'
              : `Cheque propio Nº ${active?.checkNumber ?? ''}`
        }
      >
        {mode === 'view' && active && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Número" value={active.checkNumber} />
            <Field label="Tipo" value={checkKindLabel(active.kind)} />
            <Field label="Cuenta" value={accountName(active.accountId)} />
            <Field label="Proveedor" value={supplierName(active.supplierId)} />
            <Field label="Importe" value={formatCurrency(active.amount)} />
            <Field label="Emisión" value={formatFecha(active.issueDate)} />
            <Field label="Vencimiento" value={<IssuedDueDate check={active} />} />
            <Field label="Estado" value={issuedCheckStatusLabel(active.status)} />
            <Field label="Debitado" value={formatFecha(active.debitedAt)} />
            {active.rejectionReason ? <Field label="Motivo de rechazo" value={active.rejectionReason} /> : null}
          </div>
        )}

        {mode === 'debit' && active && (
          <form onSubmit={handleDebit} className="space-y-4">
            <p className="text-sm text-brand-muted">
              Cheque Nº {active.checkNumber} por {formatCurrency(active.amount)}. Al debitarlo, {accountName(active.accountId)} baja ese importe. Hasta ahora no había salido plata.
            </p>
            <div>
              <label className="block text-sm mb-1">Fecha</label>
              <InputFecha
                value={actionDate}
                onChange={(v) => {
                  setActionDate(v);
                  setFieldErrors({});
                }}
                className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm bg-white"
              />
              {fieldErrors.date && <p className="text-xs text-brand-danger mt-1">{fieldErrors.date}</p>}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={close}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Debitar'}</Button>
            </div>
          </form>
        )}

        {mode === 'reject' && active && (
          <form onSubmit={handleReject} className="space-y-4">
            <p className="text-sm text-brand-muted">
              El cheque queda rechazado y se anula el pago al que pertenece. La deuda vuelve al proveedor.
            </p>
            <div>
              <label className="block text-sm mb-1">Fecha</label>
              <InputFecha
                value={actionDate}
                onChange={(v) => {
                  setActionDate(v);
                  setFieldErrors((e) => ({ ...e, date: '' }));
                }}
                className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm bg-white"
              />
              {fieldErrors.date && <p className="text-xs text-brand-danger mt-1">{fieldErrors.date}</p>}
            </div>
            <div>
              <label className="block text-sm mb-1">Motivo <span className="text-brand-danger">*</span></label>
              <textarea
                className={`w-full border border-brand-border rounded-lg p-2 text-sm ${fieldErrors.reason ? 'border-red-400' : ''}`}
                rows={3}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setFieldErrors((err) => ({ ...err, reason: '' }));
                }}
              />
              {fieldErrors.reason && <p className="text-xs text-brand-danger mt-1">{fieldErrors.reason}</p>}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={close}>Cancelar</Button>
              <Button type="submit" variant="danger" disabled={saving}>{saving ? 'Guardando…' : 'Rechazar'}</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function IssuedDueDate({ check }: { check: IssuedCheck }) {
  const dueMark = issuedDueMark(issuedDueAttention(check));
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {formatFecha(check.dueDate)}
      {dueMark && <Badge variant={dueMark.variant}>{dueMark.label}</Badge>}
    </span>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-brand-muted uppercase font-bold">{label}</div>
      <div className="text-sm text-gray-800 mt-0.5">{value}</div>
    </div>
  );
}
