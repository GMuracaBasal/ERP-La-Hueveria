import React, { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';
import {
  Home, Package, DollarSign, Truck, Users,
  ShoppingCart, FileText, Activity, PieChart,
  LogOut, Menu, X, Egg
} from 'lucide-react';
import { db } from '../lib/db';
import { Settings } from '../types';
import { Button } from './ui';

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    (async () => setSettings(await db.getSettings()))();
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { name: 'Inicio', path: '/', icon: Home, roles: ['admin'] },
    { name: 'Ventas', path: '/ventas', icon: FileText, roles: ['admin'] },
    { name: 'Productos', path: '/productos', icon: Package, roles: ['admin'] },
    { name: 'Inventario', path: '/inventario', icon: Activity, roles: ['admin'] },
    { name: 'Clientes', path: '/clientes', icon: Users, roles: ['admin'] },
    { name: 'Compras', path: '/compras', icon: ShoppingCart, roles: ['admin'] },
    { name: 'Listas de Precios', path: '/listas-precios', icon: DollarSign, roles: ['admin'] },
    { name: 'Proveedores', path: '/proveedores', icon: Truck, roles: ['admin'] },
    { name: 'Finanzas', path: '/finanzas', icon: PieChart, roles: ['admin'] },
    { name: 'Usuarios', path: '/usuarios', icon: Users, roles: ['admin'] },
    { name: 'Punto de Venta',   path: '/pos',            icon: ShoppingCart, roles: ['vendedor'] },
    { name: 'Caja del Día',     path: '/caja',           icon: PieChart,     roles: ['vendedor'] },
  ];

  const filteredNav = navItems.filter(item => user && item.roles.includes(user.role));

  return (
    <div className="flex h-screen bg-brand-cream overflow-hidden text-brand-text">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-30 w-[220px] bg-brand-navy border-r border-brand-border transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-auto flex flex-col",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
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

        <nav className="flex-1 px-4 py-4 space-y-1">
            {filteredNav.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors font-semibold text-sm",
                    isActive
                      ? "bg-brand-teja text-white"
                      : "text-white/50 hover:bg-white/7 hover:text-white"
                  )}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {item.name}
                </Link>
              );
            })}
        </nav>

        <div className="mt-auto">
          {/* Usuario / logout */}
          <div className="p-4 border-t border-white/10">
            <div
              onClick={handleLogout}
              className="bg-brand-slate p-3 rounded-lg flex items-center gap-3 text-white cursor-pointer hover:bg-white/10 transition-colors"
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

          {/* Marca Basal — obligatoria, no ocultable */}
          <div className="px-4 pb-4 flex flex-col items-center gap-1">
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/30">
              Desarrollado por
            </p>
            <p className="text-[11px] font-bold tracking-wider text-white/50">
              BASAL
            </p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 w-0 overflow-hidden">
        <header className="relative z-10 flex-shrink-0 h-16 bg-brand-navy flex items-center justify-between px-4 sm:px-8 border-b border-white/10">
          <div className="flex items-center gap-4">
            <button
              className="lg:hidden p-2 text-white/70 hover:text-white transition-colors focus:outline-none"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </button>
            <h1 className="text-xl font-bold text-white hidden sm:block">Panel de Control</h1>
          </div>
          
          <div className="flex items-center gap-4 sm:gap-6">
            <Button onClick={() => user?.role === 'vendedor' ? navigate('/pos') : navigate('/ventas')} size="sm" className="font-bold hidden sm:flex">
               {user?.role === 'vendedor' ? 'Ir al POS' : 'Nueva Venta'}
            </Button>
          </div>
        </header>

        <main className="flex-1 relative overflow-y-auto focus:outline-none p-4 sm:p-8 bg-brand-cream">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
