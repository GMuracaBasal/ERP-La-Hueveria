import { useEffect, useState, type ReactElement } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { db } from './lib/db';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider, ConfirmProvider } from './components/ui';
import { canAccess, firstAllowedPath } from './lib/modules';
import Login from './pages/Login';
import Layout from './components/Layout';

import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Inventory from './pages/Inventory';
import Customers from './pages/Customers';
import Sales from './pages/Sales';
import PriceLists from './pages/PriceLists';
import Purchases from './pages/Purchases';
import Suppliers from './pages/Suppliers';
import Users from './pages/Users';
import POS from './pages/POS';
import Caja from './pages/Caja';

function ProtectedRoute(
  { children, reqRole, moduleId }:
  { children: ReactElement; reqRole?: 'admin'; moduleId?: string }
) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!user.active) return <Navigate to="/login" replace />;
  if (reqRole && user.role !== reqRole) {
    return <Navigate to={firstAllowedPath(user)} replace />;
  }
  if (moduleId && !canAccess(user, moduleId)) {
    return <Navigate to={firstAllowedPath(user)} replace />;
  }
  return children;
}

// App configuration wrapper checking setup status
function AppLogic() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      await db.getSettings();
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="h-screen w-screen flex items-center justify-center bg-brand-cream font-bold text-brand-brown">Iniciando La Hueveria...</div>;

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/"               element={<ProtectedRoute moduleId="inicio"><Dashboard /></ProtectedRoute>} />
        <Route path="/ventas"         element={<ProtectedRoute moduleId="ventas"><Sales /></ProtectedRoute>} />
        <Route path="/productos"      element={<ProtectedRoute moduleId="productos"><Products /></ProtectedRoute>} />
        <Route path="/inventario"     element={<ProtectedRoute moduleId="inventario"><Inventory /></ProtectedRoute>} />
        <Route path="/clientes"       element={<ProtectedRoute moduleId="clientes"><Customers /></ProtectedRoute>} />
        <Route path="/listas-precios" element={<ProtectedRoute moduleId="listas-precios"><PriceLists /></ProtectedRoute>} />
        <Route path="/compras"        element={<ProtectedRoute moduleId="compras"><Purchases /></ProtectedRoute>} />
        <Route path="/proveedores"    element={<ProtectedRoute moduleId="proveedores"><Suppliers /></ProtectedRoute>} />
        <Route path="/finanzas"       element={<ProtectedRoute moduleId="finanzas"><Dashboard /></ProtectedRoute>} />
        <Route path="/pos"            element={<ProtectedRoute moduleId="pos"><POS /></ProtectedRoute>} />
        <Route path="/caja"           element={<ProtectedRoute moduleId="caja"><Caja /></ProtectedRoute>} />
        <Route path="/usuarios"       element={<ProtectedRoute reqRole="admin"><Users /></ProtectedRoute>} />
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
