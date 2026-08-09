import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

export interface SidebarSectionLink {
  id: string;
  label: string;
  path: string;
  active: boolean;
}

interface SidebarModuleGroupProps {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** true = pliega/despliega; false = navega directo (Inicio, etc.) */
  collapsible: boolean;
  open: boolean;
  onToggle: () => void;
  /** Ruta al click del encabezado cuando NO es colapsable */
  href?: string | null;
  moduleActive: boolean;
  /** Encabezado con estilo activo (módulo de un solo destino activo) */
  headerActive: boolean;
  sections: SidebarSectionLink[];
  onNavigate: () => void;
}

/** Grupo de módulo del sidebar: accordion o link directo. */
export default function SidebarModuleGroup({
  label,
  icon: Icon,
  collapsible,
  open,
  onToggle,
  href,
  moduleActive,
  headerActive,
  sections,
  onNavigate,
}: SidebarModuleGroupProps) {
  const headerClass = cn(
    'flex w-full items-center gap-2.5 px-3 py-2 rounded-lg transition-colors font-bold text-xs uppercase tracking-wider',
    headerActive
      ? 'bg-brand-teja text-white'
      : moduleActive
        ? 'text-white'
        : 'text-white/60 hover:bg-white/7 hover:text-white'
  );

  return (
    <div>
      {collapsible ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className={headerClass}
        >
          <Icon className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1 text-left">{label}</span>
          <ChevronDown
            className={cn(
              'w-4 h-4 flex-shrink-0 transition-transform duration-200',
              open ? 'rotate-0' : '-rotate-90'
            )}
          />
        </button>
      ) : (
        href && (
          <Link to={href} onClick={onNavigate} className={headerClass}>
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1 text-left">{label}</span>
          </Link>
        )
      )}

      {collapsible && open && sections.length > 0 && (
        <div className="mt-0.5 ml-2 pl-2 border-l border-white/10 space-y-0.5">
          {sections.map((section) => (
            <Link
              key={section.id}
              to={section.path}
              onClick={onNavigate}
              className={cn(
                'block px-3 py-2 rounded-lg transition-colors text-sm font-semibold',
                section.active
                  ? 'bg-brand-teja text-white'
                  : 'text-white/50 hover:bg-white/7 hover:text-white'
              )}
            >
              {section.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
