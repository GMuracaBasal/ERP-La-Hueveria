import React, { useState, useEffect, useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Home, Package, DollarSign, Truck, Users,
  ShoppingCart, FileText, PieChart,
  Menu, Egg, Sun, Moon, ArrowDownCircle, ArrowUpCircle,
} from 'lucide-react';
import { db } from '../lib/db';
import { Settings } from '../types';
import { BasalLogo } from './BasalLogo';
import SidebarModuleGroup from './SidebarModuleGroup';
import {
  MODULES,
  canAccess,
  canAccessModule,
  firstAccessibleSectionPath,
} from '../lib/modules';
import { useTheme } from '../contexts/ThemeContext';
import { cn, formatFechaHeaderDay } from '../lib/utils';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  inicio: Home,
  inventario: Package,
  ingresos: ArrowUpCircle,
  egresos: ArrowDownCircle,
  finanzas: PieChart,
  usuarios: Users,
  productos: Package,
  ventas: FileText,
  pos: ShoppingCart,
  compras: ShoppingCart,
  proveedores: Truck,
  'listas-precios': DollarSign,
};

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [openModules, setOpenModules] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    (async () => setSettings(await db.getSettings()))();
  }, []);

  const visibleModules = useMemo(
    () => MODULES.filter((m) => user && canAccessModule(user, m)),
    [user],
  );

  const isPathActive = (path: string) => location.pathname === path;

  const headerDate = formatFechaHeaderDay();

  // Al cargar / cambiar de ruta: el módulo de la sección activa queda desplegado (sin cerrar los demás)
  useEffect(() => {
    const activeMod = visibleModules.find((m) =>
      m.sections.some((s) => isPathActive(s.path)),
    );
    if (!activeMod) return;
    setOpenModules((prev) => {
      if (prev.has(activeMod.id)) return prev;
      const next = new Set(prev);
      next.add(activeMod.id);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, visibleModules]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleModule = (moduleId: string) => {
    setOpenModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  };

  return (
    <div className="flex h-screen bg-[var(--basal-bg)] overflow-hidden text-[var(--basal-text)]">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={cn(
        'fixed inset-y-0 left-0 z-30 w-[220px] bg-brand-dark border-r border-white/10 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-auto flex flex-col',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="p-6 flex items-center gap-3 border-b border-white/10">
          <div className="w-10 h-10 bg-brand-teja rounded-xl flex items-center justify-center shadow-lg">
            <Egg className="w-6 h-6 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight text-white leading-tight flex flex-col">
            <span className="truncate max-w-[120px]">{settings?.businessName || 'Huevería'}</span>
            <span className="text-[10px] font-medium text-white/50 uppercase tracking-widest mt-0.5">Gestión v2.0</span>
          </span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-3 overflow-y-auto">
          {visibleModules.map((mod) => {
            const Icon = ICONS[mod.icon] || Home;
            const modulePath = user ? firstAccessibleSectionPath(user, mod) : null;
            const accessibleSections = mod.sections.filter((s) => user && canAccess(user, s.id));
            const moduleActive = accessibleSections.some((s) => isPathActive(s.path));
            // Módulo con sub-secciones en la definición → accordion; un solo destino → navega
            const collapsible = mod.sections.length > 1;

            return (
              <SidebarModuleGroup
                key={mod.id}
                label={mod.label}
                icon={Icon}
                collapsible={collapsible}
                open={openModules.has(mod.id)}
                onToggle={() => toggleModule(mod.id)}
                href={modulePath}
                moduleActive={moduleActive}
                headerActive={!collapsible && moduleActive}
                sections={accessibleSections.map((s) => ({
                  id: s.id,
                  label: s.label,
                  path: s.path,
                  active: isPathActive(s.path),
                }))}
                onNavigate={() => setSidebarOpen(false)}
              />
            );
          })}
        </nav>

        <div className="mt-auto">
          <div className="p-4 border-t border-white/10">
            <div
              onClick={handleLogout}
              className="bg-brand-bg2 p-3 rounded-lg flex items-center gap-3 text-white cursor-pointer hover:bg-white/10 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-brand-teja flex items-center justify-center font-bold flex-shrink-0">
                {user?.fullName.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-xs font-semibold truncate">{user?.fullName}</p>
                <p className="text-[10px] opacity-70 italic">Cerrar Sesión</p>
              </div>
            </div>
          </div>

          <div className="px-4 pb-4 flex flex-col items-center gap-1.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/30">
              Desarrollado por
            </p>
            <div className="bg-brand-cream rounded-md px-3 py-1.5 w-fit mx-auto">
              <BasalLogo />
            </div>
          </div>
        </div>
      </aside>

      <div className="flex flex-col flex-1 w-0 overflow-hidden">
        <header className="relative z-10 flex-shrink-0 h-16 bg-[var(--basal-surface)] flex items-center justify-between px-4 sm:px-8 border-b border-[var(--basal-border)]">
          <div className="flex items-center gap-4">
            <button
              className="lg:hidden p-2 text-[var(--basal-text-sec)] hover:text-[var(--basal-text)] transition-colors focus:outline-none"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </button>
            <h1 className="text-xl font-bold text-[var(--basal-text)] hidden sm:block">Panel de Control</h1>
          </div>

          <div className="flex items-center gap-4 sm:gap-6">
            <p className="hidden sm:block text-sm font-medium text-[var(--basal-text-sec)]">
              {headerDate}
            </p>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-[var(--basal-hover)] transition-colors text-[var(--basal-text-sec)]"
              aria-label="Cambiar tema"
              title={theme === 'light' ? 'Modo oscuro' : 'Modo claro'}
            >
              {theme === 'light' ? (
                <Moon className="w-5 h-5" />
              ) : (
                <Sun className="w-5 h-5" />
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 relative overflow-y-auto focus:outline-none p-4 sm:p-8 bg-[var(--basal-bg)]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
