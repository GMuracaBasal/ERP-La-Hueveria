import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Pencil, Ban } from 'lucide-react';
import {
  financeDB,
  receivedChecksDB,
  treasuryAccountsDB,
  treasuryTransfersDB,
} from '../lib/db';
import type { FinanceMovement, TreasuryAccount, TreasuryAccountType, TreasuryCurrency } from '../types';
import { Badge, Button, Modal, SearchableSelect, useConfirm, useToast } from '../components/ui';
import InputFecha from '../components/InputFecha';
import FiltroFechas, { defaultDateRange, isDateInRange } from '../components/FiltroFechas';
import { generateId, formatCurrency, formatFecha, formatFechaHora, isoDateToTimestamp, todayISODate } from '../lib/utils';
import { getReceivedCheckErrorMessage, sumReceivedChecks } from '../lib/checks';
import { roundMoney } from '../lib/accountMovements';
import { useAuth } from '../contexts/AuthContext';
import {
  DEFAULT_ACCOUNT_REQUIRED_MSG,
  TREASURY_CURRENCY_OPTIONS,
  TREASURY_TYPE_OPTIONS,
  computeAccountBalance,
  formatTreasuryMoney,
  getTreasuryRpcErrorMessage,
  impliedFxRate,
  treasuryTypeLabel,
  withAccountRunningBalance,
} from '../lib/treasury';

type AccountForm = {
  id: string;
  name: string;
  type: TreasuryAccountType;
  bank: string;
  accountNumber: string;
  currency: TreasuryCurrency;
  initialBalance: string;
  openingDate: string;
  isDefault: boolean;
  enabled: boolean;
  notes: string;
};

const emptyAccountForm = (): AccountForm => ({
  id: generateId(),
  name: '',
  type: 'efectivo',
  bank: '',
  accountNumber: '',
  currency: 'ARS',
  initialBalance: '0',
  openingDate: todayISODate(),
  isDefault: false,
  enabled: true,
  notes: '',
});

export default function TreasuryAccounts() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [movements, setMovements] = useState<FinanceMovement[]>([]);
  const [portfolio, setPortfolio] = useState<number | null>(null);
  const [portfolioError, setPortfolioError] = useState('');
  const [selected, setSelected] = useState<TreasuryAccount | null>(null);
  const [ledger, setLedger] = useState<FinanceMovement[]>([]);
  const [dateRange, setDateRange] = useState(defaultDateRange);

  const [accountModal, setAccountModal] = useState(false);
  const [editing, setEditing] = useState<TreasuryAccount | null>(null);
  const [form, setForm] = useState<AccountForm>(emptyAccountForm);
  const [nameError, setNameError] = useState('');
  const [saving, setSaving] = useState(false);

  const [transferOpen, setTransferOpen] = useState(false);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [transferDate, setTransferDate] = useState(todayISODate);
  const [amountFrom, setAmountFrom] = useState('');
  const [amountTo, setAmountTo] = useState('');
  const [transferConcept, setTransferConcept] = useState('');
  const [amountError, setAmountError] = useState('');
  const [transferSaving, setTransferSaving] = useState(false);

  const [voidTarget, setVoidTarget] = useState<FinanceMovement | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidError, setVoidError] = useState('');
  const [voiding, setVoiding] = useState(false);

  const balances = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of accounts) {
      map.set(a.id, computeAccountBalance(a, movements));
    }
    return map;
  }, [accounts, movements]);

  const loadList = async () => {
    const [accs, movs] = await Promise.all([
      treasuryAccountsDB.getAll(),
      financeDB.getAll(),
    ]);
    setAccounts(accs);
    setMovements(movs);
    try {
      const checks = await receivedChecksDB.listActive();
      setPortfolio(sumReceivedChecks(checks, 'en_cartera'));
      setPortfolioError('');
    } catch (err) {
      setPortfolio(null);
      setPortfolioError(getReceivedCheckErrorMessage(err));
    }
    return accs;
  };

  const loadLedger = async (accountId: string) => {
    setLedger(await financeDB.getByAccount(accountId));
  };

  useEffect(() => {
    (async () => {
      try {
        await loadList();
      } catch (err) {
        toast.error(getTreasuryRpcErrorMessage(err));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDetail = async (account: TreasuryAccount) => {
    setSelected(account);
    const movs = await financeDB.getByAccount(account.id);
    setLedger(movs);
    const days = movs.map((m) => m.date.slice(0, 10)).filter(Boolean);
    const from = [account.openingDate, ...days].filter(Boolean).sort()[0] || todayISODate();
    setDateRange({ from, to: todayISODate() });
  };

  const refreshDetail = async () => {
    const accs = await loadList();
    if (!selected) return;
    const fresh = accs.find((a) => a.id === selected.id) ?? await treasuryAccountsDB.getById(selected.id);
    if (fresh) {
      setSelected(fresh);
      await loadLedger(fresh.id);
    }
  };

  const grouped = useMemo(() => {
    const ars = accounts.filter((a) => a.currency === 'ARS');
    const usd = accounts.filter((a) => a.currency === 'USD');
    return [
      { currency: 'ARS' as const, label: 'Pesos', accounts: ars },
      { currency: 'USD' as const, label: 'Dólares', accounts: usd },
    ].filter((g) => g.accounts.length > 0);
  }, [accounts]);

  const subtotal = (currency: TreasuryCurrency) =>
    accounts
      .filter((a) => a.currency === currency && a.enabled)
      .reduce((acc, a) => roundMoney(acc + (balances.get(a.id) ?? 0)), 0);

  const openNewAccount = () => {
    setEditing(null);
    setForm(emptyAccountForm());
    setNameError('');
    setAccountModal(true);
  };

  const openEditAccount = (account: TreasuryAccount) => {
    setEditing(account);
    setForm({
      id: account.id,
      name: account.name,
      type: account.type,
      bank: account.bank || '',
      accountNumber: account.accountNumber || '',
      currency: account.currency,
      initialBalance: String(account.initialBalance),
      openingDate: account.openingDate,
      isDefault: account.isDefault,
      enabled: account.enabled,
      notes: account.notes || '',
    });
    setNameError('');
    setAccountModal(true);
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || !user) return;
    const name = form.name.trim();
    if (!name) {
      setNameError('El nombre es obligatorio.');
      return;
    }
    const duplicate = accounts.some(
      (a) => a.id !== form.id && a.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) {
      setNameError('Ya existe una cuenta con ese nombre.');
      return;
    }
    const initial = roundMoney(Number(form.initialBalance));
    if (!Number.isFinite(initial)) {
      toast.error('El saldo inicial no es válido.');
      return;
    }
    if (editing?.isDefault && (!form.enabled || !form.isDefault)) {
      toast.error(DEFAULT_ACCOUNT_REQUIRED_MSG);
      return;
    }

    setSaving(true);
    try {
      await treasuryAccountsDB.save({
        id: form.id,
        name,
        type: form.type,
        bank: form.type === 'banco' ? form.bank.trim() || null : null,
        accountNumber: form.type === 'banco' ? form.accountNumber.trim() || null : null,
        currency: editing ? editing.currency : form.currency,
        initialBalance: initial,
        openingDate: form.openingDate,
        isDefault: form.isDefault,
        enabled: form.enabled,
        notes: form.notes.trim() || null,
        createdAt: editing?.createdAt || new Date().toISOString(),
        createdBy: editing?.createdBy || user.id,
      });
      toast.success(editing ? 'Cuenta actualizada correctamente.' : 'Cuenta creada correctamente.');
      setAccountModal(false);
      await refreshDetail();
      if (!selected) await loadList();
    } catch (err) {
      toast.error(getTreasuryRpcErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDisable = async (account: TreasuryAccount) => {
    if (account.isDefault) {
      toast.error(DEFAULT_ACCOUNT_REQUIRED_MSG);
      return;
    }
    const ok = await confirm({
      title: 'Deshabilitar cuenta',
      description: `“${account.name}” dejará de usarse en transferencias. El historial se conserva.`,
      confirmLabel: 'Sí, deshabilitar',
    });
    if (!ok) return;
    try {
      await treasuryAccountsDB.save({ ...account, enabled: false, isDefault: false });
      toast.success('Cuenta deshabilitada.');
      await refreshDetail();
      if (!selected) await loadList();
    } catch (err) {
      toast.error(getTreasuryRpcErrorMessage(err));
    }
  };

  const enabledAccounts = accounts.filter((a) => a.enabled);
  const fromAccount = enabledAccounts.find((a) => a.id === fromId);
  const toAccount = enabledAccounts.find((a) => a.id === toId);
  const sameCurrency = !!(fromAccount && toAccount && fromAccount.currency === toAccount.currency);
  const crossCurrency = !!(fromAccount && toAccount && fromAccount.currency !== toAccount.currency);

  const openTransfer = (presetFromId?: string) => {
    setFromId(presetFromId || accounts.find((a) => a.isDefault && a.enabled)?.id || enabledAccounts[0]?.id || '');
    setToId('');
    setTransferDate(todayISODate());
    setAmountFrom('');
    setAmountTo('');
    setTransferConcept('');
    setAmountError('');
    setTransferOpen(true);
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (transferSaving || !user) return;
    if (!fromId || !toId) {
      setAmountError('Seleccioná cuenta origen y destino.');
      return;
    }
    if (fromId === toId) {
      setAmountError('La cuenta origen y destino tienen que ser distintas.');
      return;
    }
    const fromAmt = roundMoney(Number(amountFrom));
    const toAmt = sameCurrency ? fromAmt : roundMoney(Number(amountTo));
    if (!(fromAmt > 0) || !(toAmt > 0)) {
      setAmountError('El importe tiene que ser mayor a 0.');
      return;
    }

    setTransferSaving(true);
    try {
      await treasuryTransfersDB.register({
        date: isoDateToTimestamp(transferDate),
        fromAccountId: fromId,
        toAccountId: toId,
        amountFrom: fromAmt,
        amountTo: toAmt,
        concept: transferConcept.trim() || null,
        createdBy: user.id,
      });
      toast.success('Transferencia registrada.');
      setTransferOpen(false);
      await refreshDetail();
      if (!selected) await loadList();
    } catch (err) {
      toast.error(getTreasuryRpcErrorMessage(err));
    } finally {
      setTransferSaving(false);
    }
  };

  const handleVoidTransfer = async () => {
    if (!user || !voidTarget?.transferId) return;
    const reason = voidReason.trim();
    if (!reason) {
      setVoidError('El motivo es obligatorio.');
      return;
    }
    setVoiding(true);
    try {
      await treasuryTransfersDB.void(voidTarget.transferId, user.id, reason);
      toast.success('Transferencia anulada (ambas patas).');
      setVoidTarget(null);
      await refreshDetail();
    } catch (err) {
      toast.error(getTreasuryRpcErrorMessage(err));
    } finally {
      setVoiding(false);
    }
  };

  const implied = useMemo(() => {
    if (!crossCurrency || !fromAccount || !toAccount) return null;
    const fromAmt = Number(amountFrom);
    const toAmt = Number(amountTo);
    return impliedFxRate(fromAmt, toAmt, fromAccount.currency, toAccount.currency);
  }, [crossCurrency, fromAccount, toAccount, amountFrom, amountTo]);

  const ledgerRows = useMemo(() => {
    if (!selected) return [];
    const rows = withAccountRunningBalance(selected, ledger);
    return rows.filter((r) => isDateInRange(r.date, dateRange.from, dateRange.to));
  }, [selected, ledger, dateRange]);

  const accountForm = (
    <form onSubmit={handleSaveAccount} className="space-y-4">
      <div>
        <label className="block text-sm">Nombre</label>
        <input
          required
          className={`w-full border p-2 rounded ${nameError ? 'border-red-400' : ''}`}
          value={form.name}
          onChange={(e) => {
            setNameError('');
            setForm({ ...form, name: e.target.value });
          }}
        />
        {nameError && <p className="text-xs text-brand-danger mt-1">{nameError}</p>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm mb-1">Tipo</label>
          <SearchableSelect
            options={TREASURY_TYPE_OPTIONS}
            value={TREASURY_TYPE_OPTIONS.find((o) => o.value === form.type) ?? TREASURY_TYPE_OPTIONS[0]}
            onChange={(sel: { value: string } | null) =>
              setForm({ ...form, type: (sel?.value as TreasuryAccountType) || 'efectivo' })
            }
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Moneda</label>
          <SearchableSelect
            options={TREASURY_CURRENCY_OPTIONS}
            value={TREASURY_CURRENCY_OPTIONS.find((o) => o.value === form.currency)}
            isDisabled={!!editing}
            onChange={(sel: { value: string } | null) =>
              setForm({ ...form, currency: sel?.value === 'USD' ? 'USD' : 'ARS' })
            }
          />
        </div>
      </div>
      {form.type === 'banco' && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm">Banco</label>
            <input
              className="w-full border p-2 rounded"
              value={form.bank}
              onChange={(e) => setForm({ ...form, bank: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm">Nº de cuenta</label>
            <input
              className="w-full border p-2 rounded"
              value={form.accountNumber}
              onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
            />
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm">Saldo inicial</label>
          <input
            type="number"
            step="0.01"
            className="w-full border p-2 rounded"
            value={form.initialBalance}
            onChange={(e) => setForm({ ...form, initialBalance: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Fecha de apertura</label>
          <InputFecha
            value={form.openingDate}
            onChange={(v) => v && setForm({ ...form, openingDate: v })}
            required
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="rounded text-brand-orange focus:ring-brand-orange"
          checked={form.isDefault}
          onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
        />
        Usar como cuenta por defecto
      </label>
      {editing && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="rounded text-brand-orange focus:ring-brand-orange"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          Cuenta habilitada
        </label>
      )}
      <div>
        <label className="block text-sm">Notas</label>
        <textarea
          className="w-full border p-2 rounded"
          rows={2}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" type="button" disabled={saving} onClick={() => setAccountModal(false)}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
      </div>
    </form>
  );

  const transferForm = (
    <form onSubmit={handleTransfer} className="space-y-4">
      <div>
        <label className="block text-sm mb-1">Fecha</label>
        <InputFecha value={transferDate} onChange={(v) => v && setTransferDate(v)} required />
      </div>
      <div>
        <label className="block text-sm mb-1">Desde</label>
        <SearchableSelect
          options={enabledAccounts.map((a) => ({
            value: a.id,
            label: `${a.name} (${formatTreasuryMoney(balances.get(a.id) ?? 0, a.currency)})`,
          }))}
          value={
            fromId
              ? {
                  value: fromId,
                  label: enabledAccounts.find((a) => a.id === fromId)?.name,
                }
              : null
          }
          onChange={(sel: { value: string } | null) => {
            setFromId(sel?.value || '');
            setAmountError('');
          }}
          placeholder="Cuenta origen..."
        />
      </div>
      <div>
        <label className="block text-sm mb-1">Hacia</label>
        <SearchableSelect
          options={enabledAccounts
            .filter((a) => a.id !== fromId)
            .map((a) => ({
              value: a.id,
              label: `${a.name} (${a.currency})`,
            }))}
          value={
            toId
              ? { value: toId, label: enabledAccounts.find((a) => a.id === toId)?.name }
              : null
          }
          onChange={(sel: { value: string } | null) => {
            setToId(sel?.value || '');
            setAmountError('');
          }}
          placeholder="Cuenta destino..."
        />
      </div>
      {sameCurrency || !toAccount ? (
        <div>
          <label className="block text-sm">
            Importe {fromAccount ? `(${fromAccount.currency})` : ''}
          </label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            className={`w-full border p-2 rounded ${amountError ? 'border-red-400' : ''}`}
            value={amountFrom}
            onChange={(e) => {
              setAmountFrom(e.target.value);
              setAmountError('');
            }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm">Sale ({fromAccount?.currency})</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              className={`w-full border p-2 rounded ${amountError ? 'border-red-400' : ''}`}
              value={amountFrom}
              onChange={(e) => {
                setAmountFrom(e.target.value);
                setAmountError('');
              }}
            />
          </div>
          <div>
            <label className="block text-sm">Entra ({toAccount?.currency})</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              className={`w-full border p-2 rounded ${amountError ? 'border-red-400' : ''}`}
              value={amountTo}
              onChange={(e) => {
                setAmountTo(e.target.value);
                setAmountError('');
              }}
            />
          </div>
        </div>
      )}
      {implied && (
        <p className="text-xs text-brand-muted bg-brand-cream/50 border border-brand-border rounded-lg p-2">
          Cotización implícita (informativa): <strong>{implied}</strong>
        </p>
      )}
      {amountError && <p className="text-xs text-brand-danger">{amountError}</p>}
      <div>
        <label className="block text-sm">Concepto <span className="text-gray-400">(opcional)</span></label>
        <input
          className="w-full border p-2 rounded"
          value={transferConcept}
          onChange={(e) => setTransferConcept(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" type="button" disabled={transferSaving} onClick={() => setTransferOpen(false)}>
          Cancelar
        </Button>
        <Button type="submit" disabled={transferSaving}>
          {transferSaving ? 'Guardando…' : 'Transferir'}
        </Button>
      </div>
    </form>
  );

  if (selected) {
    const saldo = balances.get(selected.id) ?? computeAccountBalance(selected, ledger);
    return (
      <div className="space-y-6">
        <div>
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setLedger([]);
              loadList();
            }}
            className="text-sm text-brand-muted hover:text-brand-brown mb-1"
          >
            ← Volver a cuentas
          </button>
          <div className="flex flex-wrap justify-between items-start gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{selected.name}</h1>
              <p className="text-sm text-brand-muted mt-1">
                {treasuryTypeLabel(selected.type)}
                {selected.bank ? ` · ${selected.bank}` : ''}
                {selected.accountNumber ? ` · ${selected.accountNumber}` : ''}
                {' · '}
                {selected.currency}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => openTransfer(selected.id)} disabled={!selected.enabled}>
                Nueva Transferencia
              </Button>
              <Button variant="secondary" onClick={() => openEditAccount(selected)}>Editar</Button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-brand-border overflow-hidden">
          <div className="px-6 py-4 border-b border-brand-border bg-brand-cream/30 flex flex-wrap justify-between gap-3">
            <div>
              <h2 className="font-bold text-brand-brown flex items-center gap-2">
                <span className="w-2 h-4 bg-brand-orange rounded-full" />
                Libro de la cuenta
              </h2>
              <p className="text-sm text-brand-muted mt-1">
                Saldo:{' '}
                <span className="font-bold text-brand-brown">
                  {formatTreasuryMoney(saldo, selected.currency)}
                </span>
                {selected.isDefault && <Badge variant="success" className="ml-2">Por defecto</Badge>}
                {!selected.enabled && <Badge variant="danger" className="ml-2">Deshabilitada</Badge>}
              </p>
            </div>
            <FiltroFechas from={dateRange.from} to={dateRange.to} onChange={setDateRange} />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-[10px] uppercase text-white font-bold bg-brand-navy">
                <tr>
                  <th className="px-4 py-3 text-left">Fecha</th>
                  <th className="px-4 py-3 text-left">Concepto</th>
                  <th className="px-4 py-3 text-right">Ingreso</th>
                  <th className="px-4 py-3 text-right">Egreso</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="text-sm text-gray-600">
                {ledgerRows.length === 0 &&
                  !isDateInRange(selected.openingDate, dateRange.from, dateRange.to) && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-brand-muted italic">
                      Sin movimientos en el período. Saldo inicial:{' '}
                      {formatTreasuryMoney(selected.initialBalance, selected.currency)}
                    </td>
                  </tr>
                )}
                {isDateInRange(selected.openingDate, dateRange.from, dateRange.to) && (
                  <tr className="border-b border-gray-50 bg-brand-cream/20">
                    <td className="px-4 py-3 whitespace-nowrap">{formatFecha(selected.openingDate)}</td>
                    <td className="px-4 py-3 text-brand-muted">Saldo inicial</td>
                    <td className="px-4 py-3 text-right">—</td>
                    <td className="px-4 py-3 text-right">—</td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-gray-800">
                      {formatTreasuryMoney(selected.initialBalance, selected.currency)}
                    </td>
                    <td className="px-4 py-3" />
                  </tr>
                )}
                {ledgerRows.map((m) => (
                  <tr
                    key={m.id}
                    className={`border-b border-gray-50 ${m.voided ? 'bg-gray-50 text-gray-400' : 'hover:bg-gray-50'}`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">{formatFechaHora(m.date)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={m.voided ? 'line-through' : ''}>{m.concept}</span>
                        {m.voided && <Badge variant="danger">ANULADO</Badge>}
                        {m.transferId && !m.voided && <Badge variant="default">Transferencia</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {m.type === 'ingreso' ? formatTreasuryMoney(m.amount, selected.currency) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {m.type === 'egreso' ? formatTreasuryMoney(m.amount, selected.currency) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-gray-800">
                      {formatTreasuryMoney(m.runningBalance, selected.currency)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {m.transferId && !m.voided && (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            setVoidTarget(m);
                            setVoidReason('');
                            setVoidError('');
                          }}
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

        <Modal isOpen={accountModal} onClose={() => !saving && setAccountModal(false)} title="Editar cuenta">
          {accountForm}
        </Modal>
        <Modal isOpen={transferOpen} onClose={() => !transferSaving && setTransferOpen(false)} title="Nueva Transferencia">
          {transferForm}
        </Modal>
        <Modal
          isOpen={!!voidTarget}
          onClose={() => setVoidTarget(null)}
          title="Anular transferencia"
        >
          <div className="space-y-4">
            <p className="text-sm text-brand-muted">
              Se anularán las dos patas (origen y destino). Los saldos vuelven atrás. No se puede deshacer.
            </p>
            <div>
              <label className="block text-sm font-semibold mb-1">
                Motivo <span className="text-brand-danger">*</span>
              </label>
              <textarea
                className={`w-full border rounded-lg p-2 text-sm ${voidError ? 'border-red-400' : 'border-brand-border'}`}
                rows={3}
                value={voidReason}
                onChange={(e) => {
                  setVoidReason(e.target.value);
                  setVoidError('');
                }}
                placeholder="Ej: carga duplicada, cuenta incorrecta..."
              />
              {voidError && <p className="text-xs text-brand-danger mt-1">{voidError}</p>}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setVoidTarget(null)}>Cancelar</Button>
              <Button variant="danger" disabled={voiding} onClick={handleVoidTransfer}>
                {voiding ? 'Anulando…' : 'Sí, anular'}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cuentas</h1>
          <p className="text-sm text-gray-500 mt-1">
            {grouped.map((g) => (
              <span key={g.currency} className="mr-4">
                {g.label}:{' '}
                <strong>{formatTreasuryMoney(subtotal(g.currency), g.currency)}</strong>
              </span>
            ))}
          </p>
          <p className="text-xs text-brand-muted mt-1">
            Estos saldos son solo de las cuentas. Los cheques en cartera no están incluidos.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => openTransfer()} disabled={enabledAccounts.length < 2}>
            Nueva Transferencia
          </Button>
          <Button onClick={openNewAccount}>Nueva Cuenta</Button>
        </div>
      </div>

      <div className="rounded-2xl border-2 border-dashed border-amber-500/80 bg-amber-50 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-amber-900">Cheques en cartera</div>
          <p className="text-sm text-amber-950/80 mt-1 max-w-xl">
            No integra el disponible. La plata entra al banco recién cuando el cheque se acredita.
          </p>
          {portfolioError && <p className="text-xs text-brand-danger mt-2">{portfolioError}</p>}
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-amber-950">
            {portfolio == null ? '—' : formatCurrency(portfolio)}
          </div>
          <Link to="/finanzas/cheques" className="text-sm font-semibold text-brand-teja hover:underline">
            Ver cheques
          </Link>
        </div>
      </div>

      {grouped.map((g) => (
        <div key={g.currency} className="bg-white rounded-2xl shadow-sm border border-brand-border flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b border-brand-border flex justify-between items-center bg-brand-cream/30">
            <h2 className="font-bold text-brand-brown flex items-center gap-2">
              <span className="w-2 h-4 bg-brand-orange rounded-full" />
              {g.label} ({g.currency})
            </h2>
            <span className="text-sm font-bold text-brand-brown">
              {formatTreasuryMoney(subtotal(g.currency), g.currency)}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-[10px] uppercase text-white font-bold bg-brand-navy">
                <tr>
                  <th className="px-6 py-3 text-left">Cuenta</th>
                  <th className="px-6 py-3 text-left">Tipo</th>
                  <th className="px-6 py-3 text-left">Banco / Nº</th>
                  <th className="px-6 py-3 text-right">Saldo</th>
                  <th className="px-6 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="text-sm text-gray-600">
                {g.accounts.map((a) => (
                  <tr
                    key={a.id}
                    className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                      a.enabled ? '' : 'opacity-60'
                    }`}
                  >
                    <td className="px-6 py-3 font-medium text-gray-800">
                      {a.name}
                      {a.isDefault && <Badge variant="success" className="ml-2">Por defecto</Badge>}
                      {!a.enabled && <Badge variant="danger" className="ml-2">Off</Badge>}
                    </td>
                    <td className="px-6 py-3">{treasuryTypeLabel(a.type)}</td>
                    <td className="px-6 py-3 text-gray-500">
                      {[a.bank, a.accountNumber].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="px-6 py-3 text-right font-mono font-medium text-gray-800">
                      {formatTreasuryMoney(balances.get(a.id) ?? 0, a.currency)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="inline-flex items-center justify-end gap-0.5">
                        <button
                          type="button"
                          title="Ver"
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-brand-durazno/60 hover:text-brand-navy"
                          onClick={() => openDetail(a)}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title="Editar"
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-brand-durazno/60 hover:text-blue-600"
                          onClick={() => openEditAccount(a)}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {a.enabled && (
                          <button
                            type="button"
                            title="Deshabilitar"
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-brand-durazno/60 hover:text-brand-danger"
                            onClick={() => handleDisable(a)}
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {accounts.length === 0 && (
        <p className="text-sm text-brand-muted italic">
          No hay cuentas. Aplicá la migración de tesorería o creá la primera.
        </p>
      )}

      <Modal
        isOpen={accountModal}
        onClose={() => !saving && setAccountModal(false)}
        title={editing ? 'Editar cuenta' : 'Nueva cuenta'}
      >
        {accountForm}
      </Modal>
      <Modal isOpen={transferOpen} onClose={() => !transferSaving && setTransferOpen(false)} title="Nueva Transferencia">
        {transferForm}
      </Modal>
    </div>
  );
}
