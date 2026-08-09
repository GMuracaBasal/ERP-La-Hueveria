import React, { useState } from 'react';
import FiltroFechas, { defaultDateRange } from '../components/FiltroFechas';

interface ModuleDashboardProps {
  title: string;
}

/** Placeholder de dashboard de módulo: título + FiltroFechas (inerte hasta construir métricas). */
export default function ModuleDashboard({ title }: ModuleDashboardProps) {
  const [range, setRange] = useState(defaultDateRange);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4 border-b pb-4">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        <FiltroFechas
          from={range.from}
          to={range.to}
          onChange={setRange}
          inert
        />
      </div>
      <div className="bg-white rounded-2xl border border-brand-border shadow-sm p-8 text-center text-brand-muted text-sm">
        El contenido de este dashboard se construirá en una próxima etapa.
      </div>
    </div>
  );
}
