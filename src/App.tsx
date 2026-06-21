import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { db, usersDB, priceListsDB, productsDB, suppliersDB, customersDB } from './lib/db';
import { hashPassword, generateId } from './lib/utils';
import { AuthProvider, useAuth } from './contexts/AuthContext';
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
function ProtectedRoute({ children, reqRole }: { children: JSX.Element, reqRole?: 'admin' }) {
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
    async function initDB() {
      const settings = db.getSettings();
      if (!settings.setupCompleted) {
        // Create Price Lists
        const pListMayoristaId = generateId();
        const pListMinoristaId = generateId();
        
        priceListsDB.save({ id: pListMayoristaId, name: 'Lista Mayorista', isDefault: false, prices: {} });
        priceListsDB.save({ id: pListMinoristaId, name: 'Lista Minorista', isDefault: true, prices: {} });

        // Cargar Catálogo (5 Productos de ejemplo)
        const products = [
          { id: generateId(), sku: 'H-BLA-M', name: 'Maple Huevos Blancos Medianos', category: 'Huevos', unit: 'Maple', costPrice: 2000, stock: 50, minStock: 10 },
          { id: generateId(), sku: 'H-BLA-G', name: 'Maple Huevos Blancos Grandes', category: 'Huevos', unit: 'Maple', costPrice: 2200, stock: 40, minStock: 10 },
          { id: generateId(), sku: 'H-COL-G', name: 'Maple Huevos Color Grandes', category: 'Huevos', unit: 'Maple', costPrice: 2400, stock: 30, minStock: 10 },
          { id: generateId(), sku: 'H-SUELTO-B', name: 'Huevo Blanco Suelto', category: 'Huevos', unit: 'Unidad', costPrice: 70, stock: 600, minStock: 100 },
          { id: generateId(), sku: 'MAP-CART', name: 'Maple de Cartón Vacío', category: 'Insumos', unit: 'Unidad', costPrice: 80, stock: 200, minStock: 50 },
        ];
        
        products.forEach(p => {
          productsDB.save(p);
          // Asignar precios a listas
          const mayorista = priceListsDB.getById(pListMayoristaId)!;
          mayorista.prices[p.id] = p.costPrice * 1.30;
          priceListsDB.save(mayorista);

          const minorista = priceListsDB.getById(pListMinoristaId)!;
          minorista.prices[p.id] = p.costPrice * 1.50;
          priceListsDB.save(minorista);
        });

        // Proveedores
        suppliersDB.save({ id: generateId(), name: 'Granja San Jorge', phone: '1122334455', email: 'ventas@sanjorge.com', address: 'Ruta 2 Km 40', notes: 'Entrega los Lunes' });
        suppliersDB.save({ id: generateId(), name: 'Insumos Cartón S.A.', phone: '1199887766', email: 'contacto@cartonsa.com', address: 'Parque Industrial', notes: '' });

        // Clientes
        customersDB.save({ id: generateId(), name: 'Despensa Don José', phone: '11-1234-5678', email: '', address: 'Av. Principal 123', priceListId: pListMayoristaId, notes: '' });
        customersDB.save({ id: generateId(), name: 'Panadería La Central', phone: '11-5555-5555', email: '', address: 'Calle Falsa 123', priceListId: pListMayoristaId, notes: '' });

        // Admin
        const hashed = await hashPassword('HueveriaBasal');
        usersDB.save({
          id: generateId(),
          fullName: 'Guido Muraca',
          username: 'GuidoM',
          passwordHash: hashed,
          role: 'admin'
        });

        // Settings
        db.setSettings({
          businessName: 'La Hueveria',
          defaultPriceListId: pListMinoristaId,
          setupCompleted: true
        });
      }

      // ENSURE EXACT ADMIN USER ALWAYS EXISTS (Bypass Setup constraint in case they got stuck)
      const users = usersDB.getAll();
      const adminUser = users.find(u => u.username === 'GuidoM' || u.role === 'admin');
      const hashed = await hashPassword('HueveriaBasal');
      
      if (!adminUser) {
        usersDB.save({
          id: generateId(),
          fullName: 'Guido Muraca',
          username: 'GuidoM',
          passwordHash: hashed,
          role: 'admin'
        });
      } else {
        // Enforce the requested credentials
        adminUser.fullName = 'Guido Muraca';
        adminUser.username = 'GuidoM';
        adminUser.passwordHash = hashed;
        adminUser.role = 'admin';
        usersDB.save(adminUser);
      }
      
      setLoading(false);
    }
    
    initDB();
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
      <BrowserRouter>
        <AppLogic />
      </BrowserRouter>
    </AuthProvider>
  );
}
