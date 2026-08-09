import { customersDB } from './db';
import { generateId } from './utils';
import type { Customer } from '../types';

export const CONSUMIDOR_FINAL_NAME = 'Consumidor Final';

let cachedId: string | null = null;

function isConsumidorFinalName(name: string): boolean {
  return name.trim().toLowerCase() === CONSUMIDOR_FINAL_NAME.toLowerCase();
}

/** ¿Este cliente es el Consumidor Final genérico del mostrador? */
export function isConsumidorFinal(customer: Pick<Customer, 'name'> | null | undefined): boolean {
  if (!customer) return false;
  return isConsumidorFinalName(customer.name);
}

/**
 * Resuelve el id del cliente "Consumidor Final".
 * Lo busca por nombre; si no existe, lo crea. Cachea el id en memoria.
 * Nunca hardcodear un uuid.
 */
export async function getConsumidorFinalId(): Promise<string> {
  if (cachedId) return cachedId;

  const all = await customersDB.getAll();
  const found = all.find((c) => isConsumidorFinalName(c.name));
  if (found) {
    cachedId = found.id;
    return found.id;
  }

  const id = generateId();
  await customersDB.save({
    id,
    name: CONSUMIDOR_FINAL_NAME,
    phone: '',
    email: '',
    address: '',
    priceListId: null,
    notes: 'Cliente genérico del mostrador (POS). No eliminar.',
  });
  cachedId = id;
  return id;
}

/** Invalida el cache (tests / recreación manual). */
export function clearConsumidorFinalCache(): void {
  cachedId = null;
}
