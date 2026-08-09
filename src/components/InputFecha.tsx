import React from 'react';
import DatePicker, { registerLocale } from 'react-datepicker';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn, parseLocalDate } from '../lib/utils';

registerLocale('es', es);

interface InputFechaProps {
  /** Valor en ISO yyyy-MM-dd */
  value: string;
  /** Emite ISO yyyy-MM-dd (o '' si se limpia) */
  onChange: (isoDate: string) => void;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  className?: string;
  placeholder?: string;
  /** Fecha máxima seleccionable (ej. hoy para evitar futuras). */
  maxDate?: Date;
}

/**
 * Entrada de fecha con calendario (react-datepicker).
 * Muestra dd/MM/yyyy; emite/recibe yyyy-MM-dd.
 */
export default function InputFecha({
  value,
  onChange,
  disabled = false,
  required = false,
  id,
  className,
  placeholder = 'dd/mm/aaaa',
  maxDate,
}: InputFechaProps) {
  const selected = value ? parseLocalDate(value) : null;

  return (
    <DatePicker
      id={id}
      selected={selected}
      onChange={(date: Date | null) => {
        if (!date) {
          if (!required) onChange('');
          return;
        }
        onChange(format(date, 'yyyy-MM-dd'));
      }}
      dateFormat="dd/MM/yyyy"
      locale="es"
      placeholderText={placeholder}
      disabled={disabled}
      required={required}
      maxDate={maxDate}
      calendarClassName="basal-datepicker"
      popperClassName="basal-datepicker-popper"
      className={cn(
        'border border-brand-border rounded-lg px-3 py-2 text-sm bg-white disabled:opacity-60 w-[9.5rem] focus:outline-none focus:ring-2 focus:ring-brand-teja/30',
        className,
      )}
      showPopperArrow={false}
      isClearable={!required && !disabled}
      autoComplete="off"
    />
  );
}
