import { useEffect, useState, type ReactElement } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { db } from './lib/db';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider, ConfirmProvider } from './components/ui';
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

// Protect routes based on authentication
function ProtectedRoute({ children, reqRole }: { children: ReactElement, reqRole?: 'admin' }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (reqRole && user.role !== reqRole) return <Navigate to="/" replace />;
  
  if (user.role === 'vendedor') {
    const allowedPaths = ['/pos', '/caja'];
    const currentPath = window.location.pathname;
    if (!allowedPaths.includes(currentPath)) {
      return <Navigate to="/pos" replace />;
    }
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
        <Route path="/" element={<Dashboard />} />
        <Route path="/productos" element={<Products />} />
        <Route path="/inventario" element={<Inventory />} />
        <Route path="/clientes" element={<Customers />} />
        <Route path="/ventas" element={<Sales />} />
        <Route path="/listas-precios" element={<PriceLists />} />
        <Route path="/compras" element={<ProtectedRoute reqRole="admin"><Purchases /></ProtectedRoute>} />
        <Route path="/proveedores" element={<ProtectedRoute reqRole="admin"><Suppliers /></ProtectedRoute>} />
        <Route path="/finanzas" element={<ProtectedRoute reqRole="admin"><Dashboard /></ProtectedRoute>} />
        <Route path="/usuarios" element={<ProtectedRoute reqRole="admin"><Users /></ProtectedRoute>} />
        <Route path="/pos" element={<ProtectedRoute><POS /></ProtectedRoute>} />
        <Route path="/caja" element={<ProtectedRoute><Caja /></ProtectedRoute>} />
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
