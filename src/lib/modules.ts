import type { User } from '../types';

export interface ModuleDef {
  id: string;
  label: string;
  path: string;
}

// Orden = orden en que aparecen en el menú lateral.
export const MODULES: ModuleDef[] = [
  { id: 'inicio',         label: 'Inicio',            path: '/' },
  { id: 'ventas',         label: 'Ventas',            path: '/ventas' },
  { id: 'pos',            label: 'Punto de Venta',    path: '/pos' },
  { id: 'caja',           label: 'Caja del Día',      path: '/caja' },
  { id: 'productos',      label: 'Productos',         path: '/productos' },
  { id: 'inventario',     label: 'Inventario',        path: '/inventario' },
  { id: 'clientes',       label: 'Clientes',          path: '/clientes' },
  { id: 'compras',        label: 'Compras',           path: '/compras' },
  { id: 'listas-precios', label: 'Listas de Precios', path: '/listas-precios' },
  { id: 'proveedores',    label: 'Proveedores',       path: '/proveedores' },
  { id: 'finanzas',       label: 'Finanzas',          path: '/finanzas' },
];

/** ¿El usuario puede ver este módulo? Admin = todo; vendedor = según su lista. */
export function canAccess(user: User, moduleId: string): boolean {
  if (user.role === 'admin') return true;
  return user.modules.includes(moduleId);
}

/** Primera ruta permitida para el usuario (destino de redirección). */
export function firstAllowedPath(user: User): string {
  if (user.role === 'admin') return '/';
  const first = MODULES.find((m) => user.modules.includes(m.id));
  return first ? first.path : '/login';
}
