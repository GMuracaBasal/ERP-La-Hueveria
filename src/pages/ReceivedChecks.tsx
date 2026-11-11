import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  customersDB,
  receivedChecksDB,
  suppliersDB,
  treasuryAccountsDB,
} from '../lib/db';
import type { Customer, ReceivedCheck, ReceivedCheckKind, Supplier, TreasuryAccount } from '../types';
import { Badge, Button, Modal, SearchableSelect, useConfirm, useToast } from '../components/ui';
import InputFecha from '../components/InputFecha';
import FiltroFechas, { type DateRange, isDateInRange } from '../components/FiltroFechas';
import TreasuryAccountSelect from '../components/TreasuryAccountSelect';
import { useAuth } from '../contexts/AuthContext';
import {
  CHECK_KIND_OPTIONS,
  CHECK_STATUS_OPTIONS,
  canDepositReceivedCheck,
  checkDueAttention,
  checkKindLabel,
  depositBlockedReason,
  receivedDueMark,
  checkStatusLabel,
  checkStatusVariant,
  getReceivedCheckErrorMessage,
  rpcErrorText,
  sumReceivedChecks,
  sumVigenteReceived,
} from '../lib/checks';
import { roundMoney } from '../lib/accountMovements';
import { defaultArsAccountId } from '../lib/treasury';
import { formatCurrency, formatFecha, isoDateToTimestamp, parseLocalDate, todayISODate } from '../lib/utils';
import IssuedChecks from './IssuedChecks';

type Mode = 'create' | 'view' | 'deposit' | 'credit' | 'reject' | 'void';

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

const emptyCheckForm = () => ({
  customerId: '',
  checkNumber: '',
  kind: 'papel' as ReceivedCheckKind,
  bank: '',
  drawerName: '',
  drawerTaxId: '',
  amount: '',
  issueDate: '',
  dueDate: '',
  notes: '',
});

export default function ReceivedChecks() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'emitidos' ? 'emitidos' : 'recibidos';
  const setTab = (next: 'recibidos' | 'emitidos') => {
    setSearchParams(next === 'emitidos' ? { tab: 'emitidos' } : {}, { replace: true });
  };

  const [checks, setChecks] = useState<ReceivedCheck[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [range, setRange] = useState(initialRange);
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [loadError, setLoadError] = useState('');

  const [mode, setMode] = useState<Mode | null>(null);
  const [active, setActive] = useState<ReceivedCheck | null>(null);
  const [form, setForm] = useState(emptyCheckForm);
  const [accountId, setAccountId] = useState('');
  const [actionDate, setActionDate] = useState(todayISODate());
  const [reason, setReason] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const arsAccounts = useMemo(
    () => accounts.filter((a) => a.enabled && a.currency === 'ARS'),
    [accounts],
  );

  const customerName = (id: string | null) =>
    customers.find((c) => c.id === id)?.name ?? '—';
  const supplierName = (id: string | null) =>
    suppliers.find((s) => s.id === id)?.name ?? '—';

  const accountName = (id: string | null) =>
    accounts.find((a) => a.id === id)?.name ?? '—';

  const load = async () => {
    try {
      const [rows, custs, provs, accs] = await Promise.all([
        receivedChecksDB.listActive(),
        customersDB.getAll(),
        suppliersDB.getAll(),
        treasuryAccountsDB.getAll(),
      ]);
      setChecks(rows);
      setCustomers(custs);
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

  const enCartera = sumReceivedChecks(checks, 'en_cartera');
  const vigentes = sumVigenteReceived(checks);
  const depositados = sumReceivedChecks(checks, 'depositado');
  const acreditadosPeriodo = checks
    .filter((c) => c.status === 'acreditado' && !!c.creditedAt && isDateInRange(c.creditedAt, range.from, range.to))
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

  const openCreate = () => {
    setActive(null);
    setForm(emptyCheckForm());
    setFieldErrors({});
    setMode('create');
  };

  const openAction = (next: Mode, check: ReceivedCheck) => {
    setActive(check);
    setActionDate(todayISODate());
    setReason('');
    setAccountId(defaultArsAccountId(accounts));
    setFieldErrors({});
    setMode(next);
  };

  const validateCreate = (): boolean => {
    const next: Record<string, string> = {};
    if (!form.customerId) next.customerId = 'Elegí el cliente que entregó el cheque.';
    if (!form.checkNumber.trim()) next.checkNumber = 'El número de cheque es obligatorio.';
    if (!form.dueDate) next.dueDate = 'El vencimiento es obligatorio.';
    const amount = roundMoney(Number(form.amount));
    if (!Number.isFinite(amount) || amount <= 0) next.amount = 'El importe debe ser mayor a 0.';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !validateCreate()) return;
    setSaving(true);
    try {
      await receivedChecksDB.createPortfolio({
        customerId: form.customerId,
        checkNumber: form.checkNumber,
        kind: form.kind,
        bank: form.bank,
        drawerName: form.drawerName,
        drawerTaxId: form.drawerTaxId,
        amount: roundMoney(Number(form.amount)),
        issueDate: form.issueDate || null,
        dueDate: form.dueDate,
        notes: form.notes,
        createdBy: user.id,
      });
      toast.success('Cheque cargado en cartera. No movió ninguna cuenta.');
      setSaving(false);
      resetModal();
      await load();
    } catch (err) {
      toast.error(getReceivedCheckErrorMessage(err));
      setSaving(false);
    }
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !active) return;
    const next: Record<string, string> = {};
    if (!canDepositReceivedCheck(active)) {
      toast.error(depositBlockedReason(active) ?? 'Ese cheque no se puede depositar.');
      return;
    }
    if (!actionDate) next.date = 'La fecha es obligatoria.';
    if (!accountId) next.accountId = 'Seleccioná la cuenta.';
    setFieldErrors(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    try {
      await receivedChecksDB.deposit(active.id, accountId, isoDateToTimestamp(actionDate), user.id);
      toast.success('Cheque depositado. La cuenta todavía no se movió.');
      setSaving(false);
      resetModal();
      await load();
    } catch (err) {
      const raw = rpcErrorText(err);
      if (raw.includes('ACCOUNT_REQUIRED') || raw.includes('ACCOUNT_NOT_FOUND') || raw.includes('ACCOUNT_DISABLED') || raw.includes('ACCOUNT_NOT_ARS')) {
        setFieldErrors({ accountId: getReceivedCheckErrorMessage(err) });
      } else {
        toast.error(getReceivedCheckErrorMessage(err));
      }
      setSaving(false);
    }
  };

  const handleCredit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !active) return;
    if (!actionDate) {
      setFieldErrors({ date: 'La fecha es obligatoria.' });
      return;
    }
    setSaving(true);
    try {
      await receivedChecksDB.credit(active.id, isoDateToTimestamp(actionDate), user.id);
      toast.success(`Cheque acreditado. ${accountName(active.depositAccountId)} sumó ${formatCurrency(active.amount)}.`);
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
    const next: Record<string, string> = {};
    if (!actionDate) next.date = 'La fecha es obligatoria.';
    if (!reason.trim()) next.reason = 'El motivo es obligatorio.';
    setFieldErrors(next);
    if (Object.keys(next).length > 0) return;

    const moneyBack = active.status === 'acreditado';
    const hasPayment = !!active.paymentId;
    const description = !hasPayment
      ? moneyBack
        ? `La cuenta ${accountName(active.depositAccountId)} baja ${formatCurrency(active.amount)}. Este cheque no tiene cobro, así que la cuenta corriente no cambia.`
        : 'El cheque pasa a Rechazado. No tiene cobro asociado: la cuenta corriente no cambia y ninguna cuenta se mueve.'
      : moneyBack
        ? `El cliente vuelve a deber ${formatCurrency(active.amount)} y ${accountName(active.depositAccountId)} baja ese importe.`
        : `El cliente vuelve a deber ${formatCurrency(active.amount)}. Ninguna cuenta de tesorería se mueve.`;

    const ok = await confirm({
      title: 'Rechazar cheque',
      description,
      confirmLabel: 'Sí, rechazar',
    });
    if (!ok) return;

    setSaving(true);
    try {
      await receivedChecksDB.reject(active.id, isoDateToTimestamp(actionDate), reason.trim(), user.id);
      toast.success(
        !hasPayment
          ? moneyBack
            ? 'Cheque rechazado. Salió la plata de la cuenta. No había cobro: la cuenta corriente no cambió.'
            : 'Cheque rechazado. No había cobro y ninguna cuenta se movió.'
          : moneyBack
            ? 'Cheque rechazado. Volvió la deuda y salió la plata.'
            : 'Cheque rechazado. Volvió la deuda y ninguna cuenta se movió.',
      );
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

  const handleVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !active) return;
    if (!reason.trim()) {
      setFieldErrors({ reason: 'El motivo es obligatorio.' });
      return;
    }
    const ok = await confirm({
      title: 'Anular cheque',
      description: active.paymentId
        ? 'El cheque sale de la cartera. Si vino de un cobro, la deuda del cliente no vuelve: para eso usá Rechazar.'
        : 'El cheque sale de la cartera. No mueve cuentas ni la cuenta corriente.',
      confirmLabel: 'Sí, anular',
    });
    if (!ok) return;

    setSaving(true);
    try {
      await receivedChecksDB.void(active.id, reason.trim(), user.id);
      toast.success('Cheque anulado.');
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

  const customerOptions = customers.map((c) => ({ value: c.id, label: c.name }));
  const modalTitle =
    mode === 'create' ? 'Cargar cheque en cartera'
      : mode === 'view' ? `Cheque Nº ${active?.checkNumber ?? ''}`
        : mode === 'deposit' ? 'Depositar cheque'
          : mode === 'credit' ? 'Acreditar cheque'
            : mode === 'reject' ? 'Rechazar cheque'
              : mode === 'void' ? 'Anular cheque'
                : '';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-end gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cheques</h1>
          <p className="text-sm text-brand-muted mt-1">
            {tab === 'emitidos'
              ? 'Emitidos por nosotros. Pendiente no es una salida: la plata sale al debitarse.'
              : 'Recibidos de clientes. La cartera no es plata disponible. Se deposita solo mientras está vigente: desde la fecha de cobro y por 30 días.'}
          </p>
          <div className="flex gap-1 mt-3">
            <button
              type="button"
              onClick={() => setTab('recibidos')}
              className={`px-4 py-2 text-sm font-semibold border-b-2 ${
                tab === 'recibidos' ? 'border-brand-orange text-brand-brown' : 'border-transparent text-brand-muted'
              }`}
            >
              Recibidos
            </button>
            <button
              type="button"
              onClick={() => setTab('emitidos')}
              className={`px-4 py-2 text-sm font-semibold border-b-2 ${
                tab === 'emitidos' ? 'border-brand-orange text-brand-brown' : 'border-transparent text-brand-muted'
              }`}
            >
              Emitidos
            </button>
          </div>
        </div>
        {tab === 'recibidos' && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-brand-muted mb-1">Vencimiento</p>
            <FiltroFechas from={range.from} to={range.to} onChange={setRange} />
          </div>
          <div className="min-w-[200px]">
            <p className="text-xs font-bold uppercase tracking-wider text-brand-muted mb-1">Estado</p>
            <SearchableSelect
              options={CHECK_STATUS_OPTIONS}
              value={CHECK_STATUS_OPTIONS.find((o) => o.value === statusFilter) ?? CHECK_STATUS_OPTIONS[0]}
              onChange={(selected: { value: string } | null) => setStatusFilter(selected?.value || 'todos')}
            />
          </div>
          <Button onClick={openCreate}>Cargar cheque en cartera</Button>
        </div>
        )}
      </div>

      {tab === 'emitidos' ? (
        <IssuedChecks />
      ) : (
      <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <TotalCard
          label="Vigentes"
          amount={loadError ? null : vigentes}
          hint="Para cobrar. Desde la fecha de cobro y por 30 días. Los endosados no se suman."
          tone="green"
        />
        <TotalCard
          label="En cartera"
          amount={loadError ? null : enCartera}
          hint="Ahora. No está en ninguna cuenta."
        />
        <TotalCard
          label="Depositados"
          amount={loadError ? null : depositados}
          hint="Ahora. El banco todavía no acreditó."
        />
        <TotalCard
          label="Acreditados en el período"
          amount={loadError ? null : acreditadosPeriodo}
          hint="Según el filtro de fechas, por fecha de acreditación."
        />
      </div>
      <p className="text-sm text-amber-900 bg-amber-50 border border-dashed border-amber-400 rounded-xl px-4 py-3">
        En cartera y depositados no se suman al disponible de las cuentas. La plata entra recién cuando el cheque se acredita.
      </p>

      <div className="bg-white rounded-2xl shadow-sm border border-brand-border flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-brand-border bg-brand-cream/30">
          <h2 className="font-bold text-brand-brown flex items-center gap-2">
            <span className="w-2 h-4 bg-brand-orange rounded-full" />
            Cheques recibidos
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[10px] uppercase text-white font-bold bg-brand-navy">
              <tr>
                <th className="px-4 py-3 text-left">Nº</th>
                <th className="px-4 py-3 text-left">Banco</th>
                <th className="px-4 py-3 text-left">Librador</th>
                <th className="px-4 py-3 text-right">Importe</th>
                <th className="px-4 py-3 text-left">Vencimiento</th>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-sm text-gray-600">
              {loadError && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-brand-danger">
                    {loadError}
                  </td>
                </tr>
              )}
              {!loadError && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-brand-muted italic">
                    No hay cheques en este vencimiento y estado.
                  </td>
                </tr>
              )}
              {filtered.map((c) => {
                const attention = checkDueAttention(c);
                const dueMark = receivedDueMark(attention);
                const depositable = canDepositReceivedCheck(c);
                return (
                  <tr
                    key={c.id}
                    className={`border-b border-gray-50 ${dueMark?.rowClass ?? 'hover:bg-gray-50'}`}
                  >
                    <td className="px-4 py-3 font-medium text-gray-800">{c.checkNumber}</td>
                    <td className="px-4 py-3">{c.bank || '—'}</td>
                    <td className="px-4 py-3">{c.drawerName || '—'}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatCurrency(c.amount)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex flex-wrap items-center gap-2">
                        {formatFecha(c.dueDate)}
                        {dueMark && <Badge variant={dueMark.variant}>{dueMark.label}</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3">{customerName(c.customerId)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={checkStatusVariant(c.status)}>{checkStatusLabel(c.status)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex flex-wrap justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openAction('view', c)}>Ver</Button>
                        {c.status === 'en_cartera' && (
                          <>
                            <span title={depositBlockedReason(c) ?? undefined}>
                              <Button size="sm" disabled={!depositable} onClick={() => openAction('deposit', c)}>Depositar</Button>
                            </span>
                            <Button size="sm" variant="danger" onClick={() => openAction('reject', c)}>Rechazar</Button>
                            <Button size="sm" variant="secondary" onClick={() => openAction('void', c)}>Anular</Button>
                          </>
                        )}
                        {c.status === 'depositado' && (
                          <>
                            <Button size="sm" onClick={() => openAction('credit', c)}>Acreditar</Button>
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

      <Modal isOpen={mode !== null} onClose={close} title={modalTitle}>
        {mode === 'view' && active && (
          <CheckDetail
            check={active}
            customerName={customerName(active.customerId)}
            beneficiaryName={supplierName(active.endorsedToSupplierId)}
            accountName={accountName(active.depositAccountId)}
          />
        )}

        {mode === 'create' && (
          <form onSubmit={handleCreate} className="space-y-4">
            <p className="text-sm text-brand-muted">
              Carga de cartera inicial. No genera cobro, no toca la cuenta corriente y no mueve ninguna cuenta.
            </p>
            <div>
              <label className="block text-sm mb-1">Cliente <span className="text-brand-danger">*</span></label>
              <SearchableSelect
                options={customerOptions}
                value={customerOptions.find((o) => o.value === form.customerId) ?? null}
                onChange={(selected: { value: string } | null) => {
                  setForm({ ...form, customerId: selected?.value || '' });
                  setFieldErrors((e) => ({ ...e, customerId: '' }));
                }}
                placeholder="Buscar cliente..."
              />
              {fieldErrors.customerId && <p className="text-xs text-brand-danger mt-1">{fieldErrors.customerId}</p>}
            </div>
            <CheckFields
              form={form}
              errors={fieldErrors}
              onChange={(patch) => {
                setForm({ ...form, ...patch });
                setFieldErrors({});
              }}
            />
            <div>
              <label className="block text-sm mb-1">Notas <span className="text-brand-muted">(opcional)</span></label>
              <textarea
                className="w-full border border-brand-border rounded-lg p-2 text-sm"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <FormActions saving={saving} onCancel={close} label="Guardar en cartera" />
          </form>
        )}

        {mode === 'deposit' && active && (
          <form onSubmit={handleDeposit} className="space-y-4">
            <p className="text-sm text-brand-muted">
              Cheque Nº {active.checkNumber} por {formatCurrency(active.amount)}. Depositar no es cobrar: el saldo de la cuenta no cambia.
            </p>
            <div>
              <label className="block text-sm mb-1">Fecha</label>
              <InputFecha
                value={actionDate}
                required
                onChange={(v) => {
                  setActionDate(v);
                  setFieldErrors((e) => ({ ...e, date: '' }));
                }}
              />
              {fieldErrors.date && <p className="text-xs text-brand-danger mt-1">{fieldErrors.date}</p>}
            </div>
            <TreasuryAccountSelect
              accounts={arsAccounts}
              value={accountId}
              onChange={(id) => {
                setAccountId(id);
                setFieldErrors((e) => ({ ...e, accountId: '' }));
              }}
              label="¿En qué cuenta se deposita?"
              error={fieldErrors.accountId}
            />
            <FormActions saving={saving} onCancel={close} label="Depositar" />
          </form>
        )}

        {mode === 'credit' && active && (
          <form onSubmit={handleCredit} className="space-y-4">
            <p className="text-sm text-brand-muted">
              Al acreditar, {accountName(active.depositAccountId)} sube {formatCurrency(active.amount)}. Hasta ahora esa plata no estaba en la cuenta.
            </p>
            <div>
              <label className="block text-sm mb-1">Fecha de acreditación</label>
              <InputFecha
                value={actionDate}
                required
                onChange={(v) => {
                  setActionDate(v);
                  setFieldErrors((e) => ({ ...e, date: '' }));
                }}
              />
              {fieldErrors.date && <p className="text-xs text-brand-danger mt-1">{fieldErrors.date}</p>}
            </div>
            <FormActions saving={saving} onCancel={close} label="Acreditar" />
          </form>
        )}

        {mode === 'reject' && active && (
          <form onSubmit={handleReject} className="space-y-4">
            <p className="text-sm text-brand-muted">
              Cheque Nº {active.checkNumber} por {formatCurrency(active.amount)}, {checkStatusLabel(active.status).toLowerCase()}.
            </p>
            <div>
              <label className="block text-sm mb-1">Fecha</label>
              <InputFecha
                value={actionDate}
                required
                onChange={(v) => {
                  setActionDate(v);
                  setFieldErrors((e) => ({ ...e, date: '' }));
                }}
              />
              {fieldErrors.date && <p className="text-xs text-brand-danger mt-1">{fieldErrors.date}</p>}
            </div>
            <ReasonField reason={reason} error={fieldErrors.reason} onChange={setReason} />
            <FormActions saving={saving} onCancel={close} label="Rechazar" danger />
          </form>
        )}

        {mode === 'void' && active && (
          <form onSubmit={handleVoid} className="space-y-4">
            <p className="text-sm text-brand-muted">
              Anular el cheque Nº {active.checkNumber}. No borra el registro: queda marcado como anulado.
            </p>
            <ReasonField reason={reason} error={fieldErrors.reason} onChange={setReason} />
            <FormActions saving={saving} onCancel={close} label="Anular" danger />
          </form>
        )}
      </Modal>

      <p className="text-xs text-brand-muted">
        Los saldos de las cuentas están en <Link to="/finanzas/cuentas" className="text-brand-teja hover:underline">Cuentas</Link>.
        Esta cartera no se suma ahí.
      </p>
      </>
      )}
    </div>
  );
}

function TotalCard({
  label,
  amount,
  hint,
  tone = 'default',
}: {
  label: string;
  amount: number | null;
  hint: string;
  tone?: 'default' | 'green' | 'red';
}) {
  const toneClass = tone === 'green'
    ? 'border-green-300 bg-green-50'
    : tone === 'red'
      ? 'border-red-300 bg-red-50'
      : 'border-brand-border bg-white';
  const amountClass = tone === 'green'
    ? 'text-green-800'
    : tone === 'red'
      ? 'text-red-800'
      : 'text-brand-brown';
  return (
    <div className={`rounded-2xl border px-5 py-4 min-w-0 ${toneClass}`}>
      <div className="text-xs font-bold uppercase tracking-wider text-brand-muted">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${amountClass}`}>
        {amount == null ? '—' : formatCurrency(amount)}
      </div>
      <p className="text-xs text-brand-muted mt-1">{hint}</p>
    </div>
  );
}

function ReasonField({
  reason,
  error,
  onChange,
}: {
  reason: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold mb-1">
        Motivo <span className="text-brand-danger">*</span>
      </label>
      <textarea
        className={`w-full border rounded-lg p-2 text-sm ${error ? 'border-red-400' : 'border-brand-border'}`}
        rows={3}
        value={reason}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ej: sin fondos, adulterado, carga duplicada..."
      />
      {error && <p className="text-xs text-brand-danger mt-1">{error}</p>}
    </div>
  );
}

function FormActions({
  saving,
  onCancel,
  label,
  danger = false,
}: {
  saving: boolean;
  onCancel: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button type="button" variant="secondary" disabled={saving} onClick={onCancel}>Cancelar</Button>
      <Button type="submit" variant={danger ? 'danger' : 'primary'} disabled={saving}>
        {saving ? 'Guardando…' : label}
      </Button>
    </div>
  );
}

function CheckFields({
  form,
  errors,
  onChange,
}: {
  form: ReturnType<typeof emptyCheckForm>;
  errors: Record<string, string>;
  onChange: (patch: Partial<ReturnType<typeof emptyCheckForm>>) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm mb-1">Número <span className="text-brand-danger">*</span></label>
          <input
            className={`w-full border p-2 rounded ${errors.checkNumber ? 'border-red-400' : ''}`}
            value={form.checkNumber}
            onChange={(e) => onChange({ checkNumber: e.target.value })}
          />
          {errors.checkNumber && <p className="text-xs text-brand-danger mt-1">{errors.checkNumber}</p>}
        </div>
        <div>
          <label className="block text-sm mb-1">Tipo</label>
          <SearchableSelect
            options={CHECK_KIND_OPTIONS}
            value={CHECK_KIND_OPTIONS.find((o) => o.value === form.kind) ?? CHECK_KIND_OPTIONS[0]}
            onChange={(selected: { value: string } | null) =>
              onChange({ kind: (selected?.value as ReceivedCheckKind) || 'papel' })
            }
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm mb-1">Banco</label>
          <input
            className="w-full border p-2 rounded"
            value={form.bank}
            onChange={(e) => onChange({ bank: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Librador</label>
          <input
            className="w-full border p-2 rounded"
            value={form.drawerName}
            onChange={(e) => onChange({ drawerName: e.target.value })}
          />
        </div>
      </div>
      <div>
        <label className="block text-sm mb-1">CUIT del librador</label>
        <input
          className="w-full border p-2 rounded"
          value={form.drawerTaxId}
          onChange={(e) => onChange({ drawerTaxId: e.target.value })}
        />
      </div>
      <div>
        <label className="block text-sm mb-1">Importe <span className="text-brand-danger">*</span></label>
        <input
          type="number"
          min="0.01"
          step="0.01"
          className={`w-full border p-2 rounded ${errors.amount ? 'border-red-400' : ''}`}
          value={form.amount}
          onChange={(e) => onChange({ amount: e.target.value })}
        />
        {errors.amount && <p className="text-xs text-brand-danger mt-1">{errors.amount}</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm mb-1">Fecha de emisión</label>
          <InputFecha value={form.issueDate} onChange={(v) => onChange({ issueDate: v })} />
        </div>
        <div>
          <label className="block text-sm mb-1">Vencimiento <span className="text-brand-danger">*</span></label>
          <InputFecha value={form.dueDate} required onChange={(v) => onChange({ dueDate: v })} />
          {errors.dueDate && <p className="text-xs text-brand-danger mt-1">{errors.dueDate}</p>}
        </div>
      </div>
    </>
  );
}

function CheckDetail({
  check,
  customerName,
  beneficiaryName,
  accountName,
}: {
  check: ReceivedCheck;
  customerName: string;
  beneficiaryName: string;
  accountName: string;
}) {
  const dueMark = receivedDueMark(checkDueAttention(check));
  const row = (label: string, value: React.ReactNode) => (
    <div>
      <div className="text-xs text-brand-muted uppercase font-bold">{label}</div>
      <div className="text-sm text-gray-800 mt-0.5">{value}</div>
    </div>
  );
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {row('Número', check.checkNumber)}
      {row('Tipo', checkKindLabel(check.kind))}
      {row('Banco', check.bank || '—')}
      {row('Librador', check.drawerName || '—')}
      {row('CUIT del librador', check.drawerTaxId || '—')}
      {row('Importe', formatCurrency(check.amount))}
      {row('Emisión', formatFecha(check.issueDate))}
      {row('Vencimiento', (
        <span className="inline-flex flex-wrap items-center gap-2">
          {formatFecha(check.dueDate)}
          {dueMark && <Badge variant={dueMark.variant}>{dueMark.label}</Badge>}
        </span>
      ))}
      {row('Cliente', customerName)}
      {row('Estado', <Badge variant={checkStatusVariant(check.status)}>{checkStatusLabel(check.status)}</Badge>)}
      {(check.status === 'endosado' || check.endorsedToSupplierId) && row('Beneficiario', beneficiaryName)}
      {row('Cuenta de depósito', check.depositAccountId ? accountName : '—')}
      {row('Depositado', formatFecha(check.depositedAt))}
      {row('Acreditado', formatFecha(check.creditedAt))}
      {check.rejectionReason ? row('Motivo de rechazo', check.rejectionReason) : null}
      {check.notes ? <div className="sm:col-span-2">{row('Notas', check.notes)}</div> : null}
    </div>
  );
}
