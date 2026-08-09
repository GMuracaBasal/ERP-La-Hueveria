import type { AccountMovement, AccountPartyType } from '../types';

/** Redondeo a 2 decimales para importes (evita residuos de float). */
export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * Delta de saldo de un movimiento según el titular.
 * Cliente: debe − haber (positivo = nos debe).
 * Proveedor: haber − debe (positivo = le debemos).
 */
export function movementDelta(m: AccountMovement, partyType: AccountPartyType): number {
  if (partyType === 'customer') return roundMoney(m.debe - m.haber);
  return roundMoney(m.haber - m.debe);
}

/** Saldo actual (solo voided=false). */
export function computeBalance(
  movements: AccountMovement[],
  partyType: AccountPartyType,
): number {
  return movements
    .filter((m) => !m.voided)
    .reduce((acc, m) => roundMoney(acc + movementDelta(m, partyType)), 0);
}

export interface AccountMovementRow extends AccountMovement {
  /** Saldo corrido tras esta línea (anulados no lo modifican). */
  runningBalance: number;
}

/** Agrega saldo corrido línea a línea. Asume movimientos ya ordenados. */
export function withRunningBalance(
  movements: AccountMovement[],
  partyType: AccountPartyType,
): AccountMovementRow[] {
  let balance = 0;
  return movements.map((m) => {
    if (!m.voided) {
      balance = roundMoney(balance + movementDelta(m, partyType));
    }
    return { ...m, runningBalance: balance };
  });
}

/**
 * Debe/Haber de un ajuste según sentido y titular.
 * "suma" aumenta el saldo mostrado; "resta" lo disminuye.
 */
export function ajusteDebeHaber(
  partyType: AccountPartyType,
  sentido: 'suma' | 'resta',
  importe: number,
): { debe: number; haber: number } {
  const amount = roundMoney(importe);
  if (partyType === 'customer') {
    return sentido === 'suma'
      ? { debe: amount, haber: 0 }
      : { debe: 0, haber: amount };
  }
  return sentido === 'suma'
    ? { debe: 0, haber: amount }
    : { debe: amount, haber: 0 };
}

/** Saldos por titular a partir de movimientos vigentes (voided=false). */
export function balancesByParty(
  movements: AccountMovement[],
  partyType: AccountPartyType,
): Map<string, number> {
  const balances = new Map<string, number>();
  for (const m of movements) {
    if (m.voided) continue;
    const key = partyType === 'customer' ? m.customerId : m.supplierId;
    if (!key) continue;
    balances.set(key, roundMoney((balances.get(key) ?? 0) + movementDelta(m, partyType)));
  }
  return balances;
}
