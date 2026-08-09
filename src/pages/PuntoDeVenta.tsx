import React, { useState } from 'react';
import { cn } from '../lib/utils';
import POS from './POS';
import Caja from './Caja';

type PosTabId = 'nueva-venta' | 'caja' | 'arqueo';

interface PosTab {
  id: PosTabId;
  label: string;
  /** false = reservada para el futuro, no se muestra aún */
  enabled: boolean;
}

const TABS: PosTab[] = [
  { id: 'nueva-venta', label: 'Nueva Venta', enabled: true },
  { id: 'caja', label: 'Caja del Día', enabled: true },
  { id: 'arqueo', label: 'Arqueo', enabled: false },
];

export default function PuntoDeVenta() {
  const [tab, setTab] = useState<PosTabId>('nueva-venta');
  const visibleTabs = TABS.filter((t) => t.enabled);

  return (
    <div className="flex flex-col gap-4">
      <div className="w-full bg-white rounded-xl border border-brand-border shadow-sm">
        <nav
          className="flex gap-6 sm:gap-8 px-4 sm:px-6 border-b border-brand-border"
          aria-label="Punto de Venta"
        >
          {visibleTabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'relative py-3.5 text-sm font-semibold whitespace-nowrap transition-colors',
                  active
                    ? 'text-brand-teja'
                    : 'text-brand-muted hover:text-brand-brown',
                )}
              >
                {t.label}
                {active && (
                  <span
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-teja rounded-full"
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="w-full">
        {tab === 'nueva-venta' && <POS />}
        {tab === 'caja' && <Caja />}
      </div>
    </div>
  );
}
