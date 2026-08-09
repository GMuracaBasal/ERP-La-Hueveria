import React from 'react';
import InputFecha from './InputFecha';
import { todayISODate } from '../lib/utils';

export interface DateRange {
  from: string; // yyyy-MM-dd
  to: string;
}

export { todayISODate, parseLocalDate } from '../lib/utils';

export function defaultDateRange(): DateRange {
  const today = todayISODate();
  return { from: today, to: today };
}

/** ¿La fecha ISO (timestamptz o date) cae dentro del rango [from, to] inclusive (día local)? */
export function isDateInRange(isoDate: string, from: string, to: string): boolean {
  if (!isoDate || !from || !to) return true;
  const d = new Date(isoDate);
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return day >= from && day <= to;
}

interface FiltroFechasProps {
  from: string;
  to: string;
  onChange: (range: DateRange) => void;
  /** Si true, se muestra pero no dispara cambios (dashboards placeholder). */
  inert?: boolean;
  className?: string;
}

/** Filtro reutilizable Desde–Hasta (entrada DD/MM/AAAA → valor ISO). */
export default function FiltroFechas({
  from,
  to,
  onChange,
  inert = false,
  className = '',
}: FiltroFechasProps) {
  return (
    <div
      className={`flex flex-wrap items-end gap-3 ${className}`}
      aria-disabled={inert || undefined}
    >
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-brand-muted mb-1">
          Desde
        </label>
        <InputFecha
          value={from}
          disabled={inert}
          required
          onChange={(nextFrom) => {
            if (inert || !nextFrom) return;
            onChange({ from: nextFrom, to: to < nextFrom ? nextFrom : to });
          }}
        />
      </div>
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-brand-muted mb-1">
          Hasta
        </label>
        <InputFecha
          value={to}
          disabled={inert}
          required
          onChange={(nextTo) => {
            if (inert || !nextTo) return;
            onChange({ from: from > nextTo ? nextTo : from, to: nextTo });
          }}
        />
      </div>
    </div>
  );
}
