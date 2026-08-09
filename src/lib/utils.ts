import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, isValid, parse } from 'date-fns';
import { es } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Simple hash function for demo purposes. In production, use bcrypt via backend.
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(amount);
}

export function generateId(): string {
  return crypto.randomUUID();
}

/** Fecha local de hoy como yyyy-MM-dd (valor de almacenamiento / filtros). */
export function todayISODate(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/** Parsea yyyy-MM-dd como fecha local (evita desfase UTC). */
export function parseLocalDate(yyyyMmDd: string): Date {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Convierte string ISO/timestamptz o Date a Date local válida. */
export function toValidDate(value: string | Date | null | undefined): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return isValid(value) ? value : null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = parseLocalDate(value);
    return isValid(d) ? d : null;
  }
  const d = new Date(value);
  return isValid(d) ? d : null;
}

/** Formato de visualización estándar del sistema: DD/MM/AAAA. */
export function formatFecha(value: string | Date | null | undefined): string {
  const d = toValidDate(value);
  if (!d) return '—';
  return format(d, 'dd/MM/yyyy');
}

/** Fecha + hora en DD/MM/AAAA HH:mm. */
export function formatFechaHora(value: string | Date | null | undefined): string {
  const d = toValidDate(value);
  if (!d) return '—';
  return format(d, 'dd/MM/yyyy HH:mm');
}

/** Header: "Domingo 09/08/2026" (día capitalizado). */
export function formatFechaHeaderDay(date: Date = new Date()): string {
  const raw = format(date, 'EEEE dd/MM/yyyy', { locale: es });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** dd/MM/yyyy → yyyy-MM-dd, o null si es inválida. */
export function parseFechaDisplay(display: string): string | null {
  const trimmed = display.trim();
  if (!trimmed) return null;
  const parsed = parse(trimmed, 'dd/MM/yyyy', new Date());
  if (!isValid(parsed)) return null;
  if (format(parsed, 'dd/MM/yyyy') !== trimmed) return null;
  return format(parsed, 'yyyy-MM-dd');
}

/** yyyy-MM-dd → dd/MM/yyyy. */
export function isoDateToDisplay(iso: string): string {
  if (!iso) return '';
  const d = toValidDate(iso);
  if (!d) return '';
  return format(d, 'dd/MM/yyyy');
}

/** Convierte yyyy-MM-dd a ISO timestamptz usando la hora de referencia (default: ahora). */
export function isoDateToTimestamp(isoDate: string, at: Date = new Date()): string {
  const local = parseLocalDate(isoDate);
  local.setHours(at.getHours(), at.getMinutes(), at.getSeconds(), at.getMilliseconds());
  return local.toISOString();
}
