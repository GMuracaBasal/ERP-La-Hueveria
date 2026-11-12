import { useEffect, useState, type ReactElement } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { db } from './lib/db';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider, ConfirmProvider } from './components/ui';
import { canAccess, firstAllowedPath } from './lib/modules';
import Login from './pages/Login';
import Layout from './components/Layout';

import ModuleDashboard from './pages/ModuleDashboard';
import InventoryDashboard from './pages/InventoryDashboard';
import Products from './pages/Products';
import Inventory from './pages/Inventory';
import Customers from './pages/Customers';
import Sales from './pages/Sales';
import PriceLists from './pages/PriceLists';
import Purchases from './pages/Purchases';
import Suppliers from './pages/Suppliers';
import Users from './pages/Users';
import PuntoDeVenta from './pages/PuntoDeVenta';
import TreasuryAccounts from './pages/TreasuryAccounts';
import ReceivedChecks from './pages/ReceivedChecks';

function ProtectedRoute(
  { children, reqRole, sectionId }:
  { children: ReactElement; reqRole?: 'admin'; sectionId?: string }
) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!user.active) return <Navigate to="/login" replace />;
  if (reqRole && user.role !== reqRole) {
    return <Navigate to={firstAllowedPath(user)} replace />;
  }
  if (sectionId && !canAccess(user, sectionId)) {
    return <Navigate to={firstAllowedPath(user)} replace />;
  }
  return children;
}

function AppLogic() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      await db.getSettings();
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-brand-cream font-bold text-brand-brown">
        Iniciando La Hueveria...
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        {/* Inicio */}
        <Route path="/" element={<ProtectedRoute sectionId="inicio"><ModuleDashboard title="Inicio" /></ProtectedRoute>} />

        {/* Inventario */}
        <Route path="/inventario" element={<ProtectedRoute sectionId="inventario-dashboard"><InventoryDashboard /></ProtectedRoute>} />
        <Route path="/inventario/productos" element={<ProtectedRoute sectionId="inventario-productos"><Products /></ProtectedRoute>} />
        <Route path="/inventario/movimientos" element={<ProtectedRoute sectionId="inventario-movimientos"><Inventory /></ProtectedRoute>} />

        {/* Ingresos */}
        <Route path="/ingresos" element={<ProtectedRoute sectionId="ingresos-dashboard"><ModuleDashboard title="Ingresos" /></ProtectedRoute>} />
        <Route path="/ingresos/ventas" element={<ProtectedRoute sectionId="ingresos-ventas"><Sales /></ProtectedRoute>} />
        <Route path="/ingresos/punto-de-venta" element={<ProtectedRoute sectionId="ingresos-punto-de-venta"><PuntoDeVenta /></ProtectedRoute>} />
        <Route path="/ingresos/listas-precios" element={<ProtectedRoute sectionId="ingresos-listas-precios"><PriceLists /></ProtectedRoute>} />
        <Route path="/ingresos/clientes" element={<ProtectedRoute sectionId="ingresos-clientes"><Customers /></ProtectedRoute>} />

        {/* Egresos */}
        <Route path="/egresos" element={<ProtectedRoute sectionId="egresos-dashboard"><ModuleDashboard title="Egresos" /></ProtectedRoute>} />
        <Route path="/egresos/compras" element={<ProtectedRoute sectionId="egresos-compras"><Purchases /></ProtectedRoute>} />
        <Route path="/egresos/proveedores" element={<ProtectedRoute sectionId="egresos-proveedores"><Suppliers /></ProtectedRoute>} />

        {/* Finanzas */}
        <Route path="/finanzas" element={<ProtectedRoute sectionId="finanzas-dashboard"><ModuleDashboard title="Finanzas" /></ProtectedRoute>} />
        <Route path="/finanzas/cuentas" element={<ProtectedRoute sectionId="finanzas-cuentas"><TreasuryAccounts /></ProtectedRoute>} />
        <Route path="/finanzas/cheques" element={<ProtectedRoute sectionId="finanzas-cheques"><ReceivedChecks /></ProtectedRoute>} />

        {/* Usuarios (solo admin) */}
        <Route path="/usuarios" element={<ProtectedRoute reqRole="admin"><Users /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <BrowserRouter>
            <AppLogic />
          </BrowserRouter>
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
