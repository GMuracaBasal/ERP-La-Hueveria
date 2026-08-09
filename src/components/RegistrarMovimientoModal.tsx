import React, { useEffect, useState } from 'react';
import { Button, Modal, SearchableSelect, useToast } from './ui';
import InputFecha from './InputFecha';
import type { AccountPartyType } from '../types';
import { accountMovementsDB, paymentsDB } from '../lib/db';
import { generateId, parseLocalDate, todayISODate, formatCurrency } from '../lib/utils';
import { ajusteDebeHaber, roundMoney } from '../lib/accountMovements';
import {
  PAYMENT_METHOD_OPTIONS,
  type PaymentMethodCode,
} from '../lib/paymentMethods';
import { useAuth } from '../contexts/AuthContext';

interface RegistrarMovimientoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  partyType: AccountPartyType;
  partyId: string;
  partyName: string;
  /** Saldo actual del titular (referencia en el modal). */
  currentBalance: number;
}

type MovimientoTipo = 'cobro' | 'pago' | 'ajuste';
type Sentido = 'suma' | 'resta';

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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodCode>('efectivo');
  const [concept, setConcept] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    importe?: string;
    concept?: string;
    paymentMethod?: string;
    date?: string;
  }>({});

  useEffect(() => {
    if (!isOpen) return;
    setTipo(partyType === 'customer' ? 'cobro' : 'pago');
    setDate(todayISODate());
    setImporte('');
    setSentido('suma');
    setPaymentMethod('efectivo');
    setConcept('');
    setSubmitting(false);
    setFieldErrors({});
  }, [isOpen, partyType]);

  const isAjuste = tipo === 'ajuste';
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

  const validate = (): boolean => {
    const next: typeof fieldErrors = {};
    if (!date) next.date = 'La fecha es obligatoria.';

    const amount = roundMoney(Number(importe));
    if (!Number.isFinite(amount) || amount <= 0) {
      next.importe = 'El importe debe ser mayor a 0.';
    }

    if (isAjuste && !concept.trim()) {
      next.concept = 'El concepto / motivo es obligatorio.';
    }

    if (!isAjuste && !paymentMethod) {
      next.paymentMethod = 'Seleccioná el medio de pago.';
    }

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!validate()) return;

    const amount = roundMoney(Number(importe));
    const now = new Date();
    const local = parseLocalDate(date);
    local.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
    const dateIso = local.toISOString();

    setSubmitting(true);
    try {
      if (isAjuste) {
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
      } else {
        await paymentsDB.register({
          type: tipo as 'cobro' | 'pago',
          customerId: partyType === 'customer' ? partyId : null,
          supplierId: partyType === 'supplier' ? partyId : null,
          date: dateIso,
          amount,
          paymentMethod,
          concept: concept.trim() || null,
          createdBy: user.id,
        });
        toast.success(
          tipo === 'cobro'
            ? 'Cobro registrado (cuenta corriente + caja).'
            : 'Pago registrado (cuenta corriente + caja).',
        );
      }
      onSaved();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('INVALID_AMOUNT')) {
        setFieldErrors({ importe: 'El importe debe ser mayor a 0.' });
      } else if (msg.includes('INVALID_PAYMENT_METHOD')) {
        setFieldErrors({ paymentMethod: 'Medio de pago inválido.' });
      } else {
        toast.error('No se pudo registrar el movimiento. Intentá de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const title =
    partyType === 'customer' ? 'Registrar movimiento (cliente)' : 'Registrar movimiento (proveedor)';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
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

        <div>
          <label className="block text-sm mb-1">Tipo</label>
          <SearchableSelect
            options={tipoOptions}
            value={tipoOptions.find((o) => o.value === tipo) ?? tipoOptions[0]}
            onChange={(selected: { value: string } | null) => {
              const v = (selected?.value || defaultTipo) as MovimientoTipo;
              setTipo(v);
              setFieldErrors({});
            }}
          />
          <p className="text-xs text-brand-muted mt-1">
            {isAjuste
              ? 'El ajuste no afecta caja ni finanzas.'
              : tipo === 'cobro'
                ? 'El cobro asienta Haber en la cuenta y un ingreso en caja.'
                : 'El pago asienta Debe en la cuenta y un egreso en caja.'}
          </p>
        </div>

        <div>
          <label className="block text-sm mb-1">Fecha</label>
          <InputFecha
            value={date}
            required
            onChange={(v) => {
              setDate(v);
              setFieldErrors((e) => ({ ...e, date: undefined }));
            }}
            className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm bg-white"
          />
          {fieldErrors.date && (
            <p className="text-xs text-brand-danger mt-1">{fieldErrors.date}</p>
          )}
        </div>

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
              setFieldErrors((err) => ({ ...err, importe: undefined }));
            }}
            placeholder="0.00"
          />
          {fieldErrors.importe && (
            <p className="text-xs text-brand-danger mt-1">{fieldErrors.importe}</p>
          )}
        </div>

        {!isAjuste && (
          <div>
            <label className="block text-sm mb-1">
              Medio de pago <span className="text-brand-danger">*</span>
            </label>
            <SearchableSelect
              options={PAYMENT_METHOD_OPTIONS}
              value={
                PAYMENT_METHOD_OPTIONS.find((o) => o.value === paymentMethod) ??
                PAYMENT_METHOD_OPTIONS[0]
              }
              onChange={(selected: { value: string } | null) => {
                setPaymentMethod((selected?.value as PaymentMethodCode) || 'efectivo');
                setFieldErrors((e) => ({ ...e, paymentMethod: undefined }));
              }}
            />
            {fieldErrors.paymentMethod && (
              <p className="text-xs text-brand-danger mt-1">{fieldErrors.paymentMethod}</p>
            )}
          </div>
        )}

        {isAjuste && (
          <div>
            <label className="block text-sm mb-1">Sentido</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="sentido"
                  checked={sentido === 'suma'}
                  onChange={() => setSentido('suma')}
                />
                {sumaLabel}
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="sentido"
                  checked={sentido === 'resta'}
                  onChange={() => setSentido('resta')}
                />
                {restaLabel}
              </label>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold mb-1">
            Concepto {isAjuste ? <span className="text-brand-danger">*</span> : (
              <span className="font-normal text-brand-muted">(opcional)</span>
            )}
          </label>
          <textarea
            required={isAjuste}
            className={`w-full border border-brand-border rounded-lg p-2 text-sm ${
              fieldErrors.concept ? 'border-red-400' : ''
            }`}
            rows={2}
            value={concept}
            onChange={(e) => {
              setConcept(e.target.value);
              setFieldErrors((err) => ({ ...err, concept: undefined }));
            }}
            placeholder={
              isAjuste
                ? 'Ej: saldo de apertura, corrección de diferencia...'
                : 'Ej: cobro parcial factura 123...'
            }
          />
          {fieldErrors.concept && (
            <p className="text-xs text-brand-danger mt-1">{fieldErrors.concept}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting
              ? 'Guardando…'
              : isAjuste
                ? 'Guardar ajuste'
                : tipo === 'cobro'
                  ? 'Registrar cobro'
                  : 'Registrar pago'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
