import React, { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Modal, SearchableSelect, useToast } from './ui';
import InputFecha from './InputFecha';
import type { AccountPartyType, PaymentValueInput, PaymentValueMethod, ReceivedCheck, ReceivedCheckKind } from '../types';
import { accountMovementsDB, paymentsDB, receivedChecksDB } from '../lib/db';
import TreasuryAccountSelect, { useArsTreasuryAccounts } from './TreasuryAccountSelect';
import { CHECK_KIND_OPTIONS, getReceivedCheckErrorMessage, rpcErrorText } from '../lib/checks';
import { generateId, parseLocalDate, todayISODate, formatCurrency, formatFecha } from '../lib/utils';
import { ajusteDebeHaber, roundMoney } from '../lib/accountMovements';
import { PAYMENT_METHOD_OPTIONS, paymentMethodLabel } from '../lib/paymentMethods';
import { useAuth } from '../contexts/AuthContext';

interface RegistrarMovimientoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  partyType: AccountPartyType;
  partyId: string;
  partyName: string;
  currentBalance: number;
}

type MovimientoTipo = 'cobro' | 'pago' | 'ajuste';
type Sentido = 'suma' | 'resta';

interface LoadedValue {
  key: string;
  method: PaymentValueMethod;
  amount: number;
  accountLabel: string;
  checkNumber: string;
  dueDate: string;
  input: PaymentValueInput;
}

const emptyDraft = () => ({
  method: 'efectivo' as PaymentValueMethod,
  amount: '',
  accountId: '',
  checkNumber: '',
  checkKind: 'papel' as ReceivedCheckKind,
  checkBank: '',
  drawerName: '',
  drawerTaxId: '',
  issueDate: '',
  dueDate: '',
  receivedCheckId: '',
});

function portfolioLabel(check: ReceivedCheck): string {
  const who = [check.bank, check.drawerName].filter(Boolean).join(' · ');
  return `Nº ${check.checkNumber}${who ? ` · ${who}` : ''} · ${formatCurrency(check.amount)} · vence ${formatFecha(check.dueDate)}`;
}

export default function RegistrarMovimientoModal({
  isOpen,
  onClose,
  onSaved,
  partyType,
  partyId,
  partyName,
  currentBalance,
}: RegistrarMovimientoModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const defaultTipo: MovimientoTipo = partyType === 'customer' ? 'cobro' : 'pago';
  const [tipo, setTipo] = useState<MovimientoTipo>(defaultTipo);
  const [date, setDate] = useState(todayISODate);
  const [importe, setImporte] = useState('');
  const [sentido, setSentido] = useState<Sentido>('suma');
  const [concept, setConcept] = useState('');
  const [values, setValues] = useState<LoadedValue[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [portfolio, setPortfolio] = useState<ReceivedCheck[]>([]);
  const [portfolioNote, setPortfolioNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { accounts: arsAccounts, defaultId: defaultAccountId } = useArsTreasuryAccounts();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const bankAccounts = useMemo(
    () => arsAccounts.filter((a) => a.type === 'banco'),
    [arsAccounts],
  );

  useEffect(() => {
    if (!isOpen) return;
    setTipo(partyType === 'customer' ? 'cobro' : 'pago');
    setDate(todayISODate());
    setImporte('');
    setSentido('suma');
    setConcept('');
    setValues([]);
    setDraft(emptyDraft());
    setSubmitting(false);
    setFieldErrors({});
    setPortfolioNote('');
    let cancelled = false;
    receivedChecksDB.listInPortfolio()
      .then((rows) => {
        if (!cancelled) setPortfolio(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setPortfolio([]);
          setPortfolioNote(getReceivedCheckErrorMessage(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, partyType]);

  useEffect(() => {
    if (isOpen && !draft.accountId && defaultAccountId) {
      setDraft((d) => ({ ...d, accountId: defaultAccountId }));
    }
  }, [isOpen, draft.accountId, defaultAccountId]);

  const isAjuste = tipo === 'ajuste';
  const isCobro = tipo === 'cobro';
  const total = values.reduce((acc, v) => roundMoney(acc + v.amount), 0);
  const usedCheckIds = new Set(
    values
      .map((v) => ('receivedCheckId' in v.input ? v.input.receivedCheckId : null))
      .filter((id): id is string => !!id),
  );
  const availableChecks = portfolio.filter((c) => !usedCheckIds.has(c.id));
  const noPortfolio = availableChecks.length === 0;

  const methodOptions: { value: string; label: string; isDisabled?: boolean }[] = isCobro
    ? [...PAYMENT_METHOD_OPTIONS, { value: 'cheque_tercero', label: 'Cheque' }]
    : [
        ...PAYMENT_METHOD_OPTIONS,
        {
          value: 'cheque_tercero',
          label: noPortfolio ? 'Cheque de tercero — No hay cheques en cartera' : 'Cheque de tercero',
          isDisabled: noPortfolio,
        },
        { value: 'cheque_propio', label: 'Cheque propio' },
      ];

  const tipoOptions =
    partyType === 'customer'
      ? [
          { value: 'cobro', label: 'Cobro' },
          { value: 'ajuste', label: 'Ajuste' },
        ]
      : [
          { value: 'pago', label: 'Pago' },
          { value: 'ajuste', label: 'Ajuste' },
        ];

  const sumaLabel =
    partyType === 'customer' ? 'Suma saldo (nos debe más)' : 'Suma saldo (le debemos más)';
  const restaLabel =
    partyType === 'customer' ? 'Resta saldo (reduce lo que nos debe)' : 'Resta saldo (reduce lo que le debemos)';

  const balanceHint =
    partyType === 'customer'
      ? currentBalance > 0
        ? 'Nos debe'
        : currentBalance < 0
          ? 'A favor del cliente'
          : 'Al día'
      : currentBalance > 0
        ? 'Le debemos'
        : currentBalance < 0
          ? 'A nuestro favor'
          : 'Al día';

  const selectedPortfolio = availableChecks.find((c) => c.id === draft.receivedCheckId) ?? null;
  const amountLocked = !isCobro && draft.method === 'cheque_tercero';

  const patchDraft = (patch: Partial<ReturnType<typeof emptyDraft>>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setFieldErrors((e) => ({ ...e, draft: '' }));
  };

  const addValue = () => {
    const next: Record<string, string> = {};
    const amount = amountLocked && selectedPortfolio
      ? roundMoney(selectedPortfolio.amount)
      : roundMoney(Number(draft.amount));
    if (!Number.isFinite(amount) || amount <= 0) next.draft = 'El importe debe ser mayor a 0.';

    let input: PaymentValueInput | null = null;
    let accountLabel = '—';
    let checkNumber = '—';
    let dueDate = '';

    if (draft.method === 'efectivo' || draft.method === 'transferencia' || draft.method === 'tarjeta' || draft.method === 'qr') {
      if (!draft.accountId) next.draft = 'Seleccioná la cuenta.';
      const account = arsAccounts.find((a) => a.id === draft.accountId);
      accountLabel = account?.name ?? '—';
      input = { method: draft.method, amount, accountId: draft.accountId };
    } else if (draft.method === 'cheque_tercero' && isCobro) {
      if (!draft.checkNumber.trim()) next.draft = 'El número de cheque es obligatorio.';
      else if (!draft.dueDate) next.draft = 'El vencimiento es obligatorio.';
      accountLabel = draft.checkBank.trim() || '—';
      checkNumber = draft.checkNumber.trim();
      dueDate = draft.dueDate;
      input = {
        method: 'cheque_tercero',
        amount,
        check: {
          checkNumber: draft.checkNumber,
          kind: draft.checkKind,
          bank: draft.checkBank,
          drawerName: draft.drawerName,
          drawerTaxId: draft.drawerTaxId,
          amount,
          issueDate: draft.issueDate || null,
          dueDate: draft.dueDate,
        },
      };
    } else if (draft.method === 'cheque_tercero') {
      if (noPortfolio) next.draft = 'No hay cheques en cartera.';
      else if (!selectedPortfolio) next.draft = 'Elegí un cheque de la cartera.';
      else if (roundMoney(selectedPortfolio.amount) !== amount) next.draft = 'El importe del endoso es el del cheque.';
      if (selectedPortfolio) {
        accountLabel = selectedPortfolio.bank || '—';
        checkNumber = selectedPortfolio.checkNumber;
        dueDate = selectedPortfolio.dueDate;
        input = { method: 'cheque_tercero', amount: roundMoney(selectedPortfolio.amount), receivedCheckId: selectedPortfolio.id };
      }
    } else if (draft.method === 'cheque_propio') {
      if (!draft.checkNumber.trim()) next.draft = 'El número de cheque es obligatorio.';
      else if (!draft.dueDate) next.draft = 'El vencimiento es obligatorio.';
      else if (!draft.accountId) next.draft = 'Elegí la cuenta bancaria.';
      else if (!bankAccounts.some((a) => a.id === draft.accountId)) next.draft = 'El cheque propio se gira contra una cuenta bancaria en pesos.';
      const account = bankAccounts.find((a) => a.id === draft.accountId);
      accountLabel = account?.name ?? '—';
      checkNumber = draft.checkNumber.trim();
      dueDate = draft.dueDate;
      input = {
        method: 'cheque_propio',
        amount,
        checkNumber: draft.checkNumber,
        kind: draft.checkKind,
        accountId: draft.accountId,
        dueDate: draft.dueDate,
        issueDate: draft.issueDate || null,
      };
    }

    if (Object.keys(next).length > 0 || !input) {
      setFieldErrors(next);
      return;
    }

    setValues((rows) => [
      ...rows,
      { key: generateId(), method: draft.method, amount: input.amount, accountLabel, checkNumber, dueDate, input },
    ]);
    setDraft((d) => ({
      ...emptyDraft(),
      method: d.method,
      accountId: d.accountId || defaultAccountId,
    }));
    setFieldErrors({});
  };

  const validateAjuste = (): boolean => {
    const next: Record<string, string> = {};
    if (!date) next.date = 'La fecha es obligatoria.';
    const amount = roundMoney(Number(importe));
    if (!Number.isFinite(amount) || amount <= 0) next.importe = 'El importe debe ser mayor a 0.';
    if (!concept.trim()) next.concept = 'El concepto / motivo es obligatorio.';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const now = new Date();
    const local = parseLocalDate(date);
    local.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
    const dateIso = local.toISOString();

    if (isAjuste) {
      if (!validateAjuste()) return;
      const amount = roundMoney(Number(importe));
      setSubmitting(true);
      try {
        const { debe, haber } = ajusteDebeHaber(partyType, sentido, amount);
        await accountMovementsDB.save({
          id: generateId(),
          date: dateIso,
          customerId: partyType === 'customer' ? partyId : null,
          supplierId: partyType === 'supplier' ? partyId : null,
          concept: concept.trim(),
          debe,
          haber,
          referenceType: 'ajuste',
          referenceId: null,
          createdBy: user.id,
          createdAt: now.toISOString(),
          voided: false,
          voidedAt: null,
          voidedBy: null,
        });
        toast.success('Ajuste registrado correctamente.');
        onSaved();
        onClose();
      } catch (err) {
        toast.error(rpcErrorText(err) || 'Supabase no devolvió el motivo del error.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!date) {
      setFieldErrors({ date: 'La fecha es obligatoria.' });
      return;
    }
    if (values.length === 0) {
      setFieldErrors({ values: 'Agregá al menos un valor. El total del movimiento es la suma de esas líneas.' });
      return;
    }
    const summed = values.reduce((acc, v) => roundMoney(acc + v.amount), 0);
    if (summed !== total) {
      setFieldErrors({ values: 'La suma de los valores tiene que ser igual al total del movimiento.' });
      return;
    }

    setSubmitting(true);
    try {
      await paymentsDB.register({
        type: tipo as 'cobro' | 'pago',
        customerId: partyType === 'customer' ? partyId : null,
        supplierId: partyType === 'supplier' ? partyId : null,
        date: dateIso,
        concept: concept.trim() || null,
        createdBy: user.id,
        values: values.map((v) => v.input),
      });
      const hasCheck = values.some((v) => v.method === 'cheque_tercero' || v.method === 'cheque_propio');
      const hasCash = values.some((v) => v.method !== 'cheque_tercero' && v.method !== 'cheque_propio');
      toast.success(
        tipo === 'cobro'
          ? hasCheck
            ? `Cobro de ${formatCurrency(total)} registrado. La cuenta corriente bajó el total. La plata del cheque entra cuando se acredite.`
            : 'Cobro registrado (cuenta corriente + caja).'
          : hasCheck && hasCash
            ? `Pago de ${formatCurrency(total)} registrado. La caja se movió solo por la plata; los cheques no.`
            : values.some((v) => v.method === 'cheque_propio')
              ? 'Pago registrado. El cheque propio quedó pendiente: la cuenta baja cuando se debite.'
              : values.some((v) => v.method === 'cheque_tercero')
                ? 'Pago registrado. El cheque quedó endosado y ninguna cuenta se movió por él.'
                : 'Pago registrado (cuenta corriente + caja).',
      );
      onSaved();
      onClose();
    } catch (err) {
      const msg = rpcErrorText(err);
      if (msg.includes('INVALID_AMOUNT') || msg.includes('VALUES_TOTAL_MISMATCH') || msg.includes('VALUES_REQUIRED')) {
        setFieldErrors({ values: getReceivedCheckErrorMessage(err) });
      } else if (
        msg.includes('ACCOUNT_REQUIRED') ||
        msg.includes('ACCOUNT_NOT_FOUND') ||
        msg.includes('ACCOUNT_DISABLED') ||
        msg.includes('ACCOUNT_NOT_ARS') ||
        msg.includes('ACCOUNT_NOT_BANK') ||
        msg.includes('CHECK_')
      ) {
        setFieldErrors({ draft: getReceivedCheckErrorMessage(err) });
      } else {
        toast.error(getReceivedCheckErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const title =
    partyType === 'customer' ? 'Registrar movimiento (cliente)' : 'Registrar movimiento (proveedor)';

  const hint = isAjuste
    ? 'El ajuste no afecta caja ni finanzas.'
    : 'Podés combinar efectivo, transferencia y cheques. El movimiento puede ser parcial, a cuenta. Los cheques no mueven ninguna cuenta.';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl border border-brand-border bg-brand-cream/40 px-4 py-3">
          <p className="text-sm text-brand-muted">
            Titular: <strong className="text-brand-brown">{partyName}</strong>
          </p>
          <p className="text-sm mt-1">
            Saldo actual:{' '}
            <strong className="text-brand-brown">{formatCurrency(currentBalance)}</strong>
            <span className="text-xs text-brand-muted ml-2">({balanceHint})</span>
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1">Tipo</label>
            <SearchableSelect
              options={tipoOptions}
              value={tipoOptions.find((o) => o.value === tipo) ?? tipoOptions[0]}
              onChange={(selected: { value: string } | null) => {
                const v = (selected?.value || defaultTipo) as MovimientoTipo;
                setTipo(v);
                setValues([]);
                setDraft((d) => ({ ...emptyDraft(), accountId: d.accountId || defaultAccountId }));
                setFieldErrors({});
              }}
            />
            <p className="text-xs text-brand-muted mt-1">{hint}</p>
          </div>
          <div>
            <label className="block text-sm mb-1">Fecha</label>
            <InputFecha
              value={date}
              required
              onChange={(v) => {
                setDate(v);
                setFieldErrors((e) => ({ ...e, date: '' }));
              }}
              className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm bg-white"
            />
            {fieldErrors.date && <p className="text-xs text-brand-danger mt-1">{fieldErrors.date}</p>}
          </div>
        </div>

        {isAjuste && (
          <>
            <div>
              <label className="block text-sm mb-1">Importe</label>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                className={`w-full border p-2 rounded ${fieldErrors.importe ? 'border-red-400' : ''}`}
                value={importe}
                onChange={(e) => {
                  setImporte(e.target.value);
                  setFieldErrors((err) => ({ ...err, importe: '' }));
                }}
                placeholder="0.00"
              />
              {fieldErrors.importe && <p className="text-xs text-brand-danger mt-1">{fieldErrors.importe}</p>}
            </div>
            <div>
              <label className="block text-sm mb-1">Sentido</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="sentido" checked={sentido === 'suma'} onChange={() => setSentido('suma')} />
                  {sumaLabel}
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="sentido" checked={sentido === 'resta'} onChange={() => setSentido('resta')} />
                  {restaLabel}
                </label>
              </div>
            </div>
          </>
        )}

        {!isAjuste && (
          <>
            <div className="rounded-xl border border-brand-border overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="text-[10px] uppercase text-white font-bold bg-brand-navy">
                  <tr>
                    <th className="px-3 py-2 text-left">Tipo</th>
                    <th className="px-3 py-2 text-left">Cuenta / Banco</th>
                    <th className="px-3 py-2 text-left">Nº cheque</th>
                    <th className="px-3 py-2 text-left">Vencimiento</th>
                    <th className="px-3 py-2 text-right">Importe</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {values.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-4 text-center text-brand-muted italic">
                        Todavía no hay valores. Agregá al menos uno.
                      </td>
                    </tr>
                  )}
                  {values.map((v) => (
                    <tr key={v.key} className="border-t border-gray-100">
                      <td className="px-3 py-2">{paymentMethodLabel(v.method)}</td>
                      <td className="px-3 py-2">{v.accountLabel}</td>
                      <td className="px-3 py-2">{v.checkNumber}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{v.dueDate ? formatFecha(v.dueDate) : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(v.amount)}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          className="p-1 text-gray-400 hover:text-brand-danger"
                          title="Quitar valor"
                          aria-label="Quitar valor"
                          onClick={() => setValues((rows) => rows.filter((row) => row.key !== v.key))}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-brand-border bg-brand-cream/40">
                    <td colSpan={4} className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-brand-muted">
                      Total valores
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-brand-brown">{formatCurrency(total)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            {fieldErrors.values && <p className="text-xs text-brand-danger">{fieldErrors.values}</p>}

            <div
              className="space-y-4 rounded-xl border border-dashed border-brand-border p-4"
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const target = e.target as HTMLElement;
                if (target.tagName === 'TEXTAREA' || target.getAttribute('role') === 'combobox') return;
                e.preventDefault();
                addValue();
              }}
            >
              <p className="text-sm font-semibold text-brand-brown">Agregar un valor</p>
              <div>
                <label className="block text-sm mb-1">Tipo</label>
                <SearchableSelect
                  options={methodOptions}
                  value={methodOptions.find((o) => o.value === draft.method) ?? methodOptions[0]}
                  onChange={(selected: { value: string } | null) => {
                    const method = (selected?.value as PaymentValueMethod) || 'efectivo';
                    patchDraft({
                      method,
                      amount: '',
                      receivedCheckId: '',
                      checkNumber: '',
                      dueDate: '',
                    });
                  }}
                />
                {!isCobro && noPortfolio && (
                  <p className="text-xs text-brand-muted mt-1">No hay cheques en cartera para endosar.</p>
                )}
                {portfolioNote && <p className="text-xs text-brand-danger mt-1">{portfolioNote}</p>}
              </div>

              {(draft.method === 'efectivo' || draft.method === 'transferencia' || draft.method === 'tarjeta' || draft.method === 'qr') && (
                <TreasuryAccountSelect
                  accounts={arsAccounts}
                  value={draft.accountId}
                  onChange={(id) => patchDraft({ accountId: id })}
                  label={isCobro ? '¿En qué cuenta entra la plata?' : '¿De qué cuenta sale la plata?'}
                />
              )}

              {draft.method === 'cheque_tercero' && isCobro && (
                <CheckDraftFields draft={draft} onChange={patchDraft} />
              )}

              {draft.method === 'cheque_tercero' && !isCobro && (
                <div>
                  <label className="block text-sm mb-1">Cheque en cartera</label>
                  <SearchableSelect
                    options={availableChecks.map((c) => ({ value: c.id, label: portfolioLabel(c) }))}
                    value={
                      selectedPortfolio
                        ? { value: selectedPortfolio.id, label: portfolioLabel(selectedPortfolio) }
                        : null
                    }
                    onChange={(selected: { value: string } | null) => {
                      const check = availableChecks.find((c) => c.id === selected?.value);
                      patchDraft({
                        receivedCheckId: check?.id || '',
                        amount: check ? String(check.amount) : '',
                      });
                    }}
                    placeholder={noPortfolio ? 'No hay cheques en cartera' : 'Elegir cheque...'}
                    isDisabled={noPortfolio}
                  />
                  <p className="text-xs text-brand-muted mt-1">
                    Endosar no mueve ninguna cuenta. El importe es el del cheque.
                  </p>
                </div>
              )}

              {draft.method === 'cheque_propio' && (
                <>
                  <TreasuryAccountSelect
                    accounts={bankAccounts}
                    value={draft.accountId}
                    onChange={(id) => patchDraft({ accountId: id })}
                    label="Cuenta bancaria contra la que se gira"
                  />
                  {bankAccounts.length === 0 && (
                    <p className="text-xs text-brand-danger -mt-2">No hay cuentas bancarias en pesos habilitadas.</p>
                  )}
                  <CheckDraftFields draft={draft} onChange={patchDraft} hideDrawer />
                </>
              )}

              <div>
                <label className="block text-sm mb-1">Importe</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  readOnly={amountLocked}
                  className={`w-full border p-2 rounded ${amountLocked ? 'bg-gray-50' : ''}`}
                  value={amountLocked && selectedPortfolio ? String(selectedPortfolio.amount) : draft.amount}
                  onChange={(e) => patchDraft({ amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              {fieldErrors.draft && <p className="text-xs text-brand-danger">{fieldErrors.draft}</p>}
              <Button type="button" variant="secondary" onClick={addValue}>
                + Agregar valor
              </Button>
            </div>

            <div className="rounded-xl bg-brand-navy text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/70">Total del movimiento</div>
                <p className="text-xs text-white/80 mt-0.5">Suma de los valores. Puede ser menor al saldo: queda a cuenta.</p>
              </div>
              <div className="text-2xl font-bold">{formatCurrency(total)}</div>
            </div>
          </>
        )}

        <div>
          <label className="block text-sm font-semibold mb-1">
            Concepto {isAjuste ? <span className="text-brand-danger">*</span> : (
              <span className="font-normal text-brand-muted">(opcional)</span>
            )}
          </label>
          <textarea
            required={isAjuste}
            className={`w-full border border-brand-border rounded-lg p-2 text-sm ${fieldErrors.concept ? 'border-red-400' : ''}`}
            rows={2}
            value={concept}
            onChange={(e) => {
              setConcept(e.target.value);
              setFieldErrors((err) => ({ ...err, concept: '' }));
            }}
            placeholder={isAjuste ? 'Ej: saldo de apertura, corrección de diferencia...' : 'Ej: cobro parcial...'}
          />
          {fieldErrors.concept && <p className="text-xs text-brand-danger mt-1">{fieldErrors.concept}</p>}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={submitting || (!isAjuste && values.length === 0)}>
            {submitting ? 'Guardando…' : isAjuste ? 'Guardar ajuste' : tipo === 'cobro' ? 'Registrar cobro' : 'Registrar pago'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CheckDraftFields({
  draft,
  onChange,
  hideDrawer = false,
}: {
  draft: ReturnType<typeof emptyDraft>;
  onChange: (patch: Partial<ReturnType<typeof emptyDraft>>) => void;
  hideDrawer?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm mb-1">Número <span className="text-brand-danger">*</span></label>
          <input className="w-full border p-2 rounded bg-white" value={draft.checkNumber} onChange={(e) => onChange({ checkNumber: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm mb-1">Tipo</label>
          <SearchableSelect
            options={CHECK_KIND_OPTIONS}
            value={CHECK_KIND_OPTIONS.find((o) => o.value === draft.checkKind) ?? CHECK_KIND_OPTIONS[0]}
            onChange={(selected: { value: string } | null) =>
              onChange({ checkKind: (selected?.value as ReceivedCheckKind) || 'papel' })
            }
          />
        </div>
      </div>
      {!hideDrawer && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1">Banco</label>
              <input className="w-full border p-2 rounded bg-white" value={draft.checkBank} onChange={(e) => onChange({ checkBank: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm mb-1">Librador</label>
              <input className="w-full border p-2 rounded bg-white" value={draft.drawerName} onChange={(e) => onChange({ drawerName: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm mb-1">CUIT del librador</label>
            <input className="w-full border p-2 rounded bg-white" value={draft.drawerTaxId} onChange={(e) => onChange({ drawerTaxId: e.target.value })} />
          </div>
        </>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm mb-1">Fecha de emisión</label>
          <InputFecha
            value={draft.issueDate}
            onChange={(v) => onChange({ issueDate: v })}
            className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm bg-white"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Vencimiento <span className="text-brand-danger">*</span></label>
          <InputFecha
            value={draft.dueDate}
            onChange={(v) => onChange({ dueDate: v })}
            className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm bg-white"
          />
        </div>
      </div>
    </div>
  );
}
