import React, { useEffect, useState } from 'react';
import { Button, Modal, useToast } from './ui';
import InputFecha from './InputFecha';
import type { AccountPartyType } from '../types';
import { accountMovementsDB } from '../lib/db';
import { generateId, parseLocalDate, todayISODate } from '../lib/utils';
import { ajusteDebeHaber, roundMoney } from '../lib/accountMovements';
import { useAuth } from '../contexts/AuthContext';

interface RegistrarMovimientoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  partyType: AccountPartyType;
  partyId: string;
  partyName: string;
}

type Sentido = 'suma' | 'resta';

export default function RegistrarMovimientoModal({
  isOpen,
  onClose,
  onSaved,
  partyType,
  partyId,
  partyName,
}: RegistrarMovimientoModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [date, setDate] = useState(todayISODate);
  const [importe, setImporte] = useState('');
  const [sentido, setSentido] = useState<Sentido>('suma');
  const [concept, setConcept] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setDate(todayISODate());
    setImporte('');
    setSentido('suma');
    setConcept('');
    setSubmitting(false);
  }, [isOpen]);

  const sumaLabel =
    partyType === 'customer' ? 'Suma saldo (nos debe más)' : 'Suma saldo (le debemos más)';
  const restaLabel =
    partyType === 'customer' ? 'Resta saldo (reduce lo que nos debe)' : 'Resta saldo (reduce lo que le debemos)';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const conceptTrim = concept.trim();
    if (!conceptTrim) {
      toast.error('El concepto / motivo es obligatorio.');
      return;
    }

    const amount = roundMoney(Number(importe));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('El importe debe ser mayor a 0.');
      return;
    }

    if (!date) {
      toast.error('La fecha es obligatoria.');
      return;
    }

    const { debe, haber } = ajusteDebeHaber(partyType, sentido, amount);
    const now = new Date();
    const local = parseLocalDate(date);
    local.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
    const dateIso = local.toISOString();
    const createdAt = now.toISOString();

    setSubmitting(true);
    try {
      await accountMovementsDB.save({
        id: generateId(),
        date: dateIso,
        customerId: partyType === 'customer' ? partyId : null,
        supplierId: partyType === 'supplier' ? partyId : null,
        concept: conceptTrim,
        debe,
        haber,
        referenceType: 'ajuste',
        referenceId: null,
        createdBy: user.id,
        createdAt,
        voided: false,
        voidedAt: null,
        voidedBy: null,
      });
      toast.success('Ajuste registrado correctamente.');
      onSaved();
      onClose();
    } catch {
      toast.error('No se pudo registrar el movimiento. Intentá de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Registrar Movimiento">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-brand-muted">
          Ajuste manual para <strong>{partyName}</strong>. No afecta caja ni finanzas.
        </p>

        <div>
          <label className="block text-sm mb-1">Tipo</label>
          <input
            className="w-full border p-2 rounded bg-gray-50 text-gray-700"
            value="Ajuste"
            readOnly
            disabled
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Fecha</label>
          <InputFecha
            value={date}
            required
            onChange={setDate}
            className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm bg-white"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Importe</label>
          <input
            type="number"
            required
            min="0.01"
            step="0.01"
            className="w-full border p-2 rounded"
            value={importe}
            onChange={(e) => setImporte(e.target.value)}
            placeholder="0.00"
          />
        </div>

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

        <div>
          <label className="block text-sm font-semibold mb-1">
            Concepto / motivo <span className="text-brand-danger">*</span>
          </label>
          <textarea
            required
            className="w-full border border-brand-border rounded-lg p-2 text-sm"
            rows={2}
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            placeholder="Ej: saldo de apertura, corrección de diferencia..."
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            Guardar ajuste
          </Button>
        </div>
      </form>
    </Modal>
  );
}
