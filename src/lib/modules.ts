import type { User } from '../types';

export interface SectionDef {
  id: string;
  label: string;
  path: string;
  /** No se asigna a vendedores; solo admin. */
  adminOnly?: boolean;
}

export interface ModuleDef {
  id: string;
  label: string;
  /** Clave de ícono en Layout */
  icon: string;
  sections: SectionDef[];
  /** Solo visible / accesible para admin (no se asigna a vendedores) */
  adminOnly?: boolean;
}

/**
 * Mapa de ids de permiso viejos → nuevos (sección).
 * Se usa en runtime para no dejar sin acceso a usuarios ya guardados.
 */
export const LEGACY_SECTION_MAP: Record<string, string> = {
  inicio: 'inicio',
  ventas: 'ingresos-ventas',
  pos: 'ingresos-punto-de-venta',
  caja: 'ingresos-punto-de-venta',
  productos: 'inventario-productos',
  inventario: 'inventario-movimientos',
  clientes: 'ingresos-clientes',
  'listas-precios': 'ingresos-listas-precios',
  compras: 'egresos-compras',
  proveedores: 'egresos-proveedores',
  finanzas: 'finanzas-dashboard',
};

/** Orden = orden en el menú lateral. */
export const MODULES: ModuleDef[] = [
  {
    id: 'inicio',
    label: 'Inicio',
    icon: 'inicio',
    sections: [
      { id: 'inicio', label: 'Inicio', path: '/' },
    ],
  },
  {
    id: 'inventario',
    label: 'Inventario',
    icon: 'inventario',
    sections: [
      { id: 'inventario-dashboard', label: 'Dashboard', path: '/inventario' },
      { id: 'inventario-productos', label: 'Productos', path: '/inventario/productos' },
      { id: 'inventario-movimientos', label: 'Movimientos de Stock', path: '/inventario/movimientos' },
    ],
  },
  {
    id: 'ingresos',
    label: 'Ingresos',
    icon: 'ingresos',
    sections: [
      { id: 'ingresos-dashboard', label: 'Dashboard', path: '/ingresos' },
      { id: 'ingresos-ventas', label: 'Ventas', path: '/ingresos/ventas' },
      { id: 'ingresos-punto-de-venta', label: 'Punto de Venta', path: '/ingresos/punto-de-venta' },
      { id: 'ingresos-listas-precios', label: 'Listas de Precios', path: '/ingresos/listas-precios' },
      { id: 'ingresos-clientes', label: 'Clientes', path: '/ingresos/clientes' },
    ],
  },
  {
    id: 'egresos',
    label: 'Egresos',
    icon: 'egresos',
    sections: [
      { id: 'egresos-dashboard', label: 'Dashboard', path: '/egresos' },
      { id: 'egresos-compras', label: 'Compras', path: '/egresos/compras' },
      { id: 'egresos-proveedores', label: 'Proveedores', path: '/egresos/proveedores' },
    ],
  },
  {
    id: 'finanzas',
    label: 'Finanzas',
    icon: 'finanzas',
    sections: [
      { id: 'finanzas-dashboard', label: 'Dashboard', path: '/finanzas' },
      { id: 'finanzas-cuentas', label: 'Cuentas', path: '/finanzas/cuentas', adminOnly: true },
      { id: 'finanzas-cheques', label: 'Cheques', path: '/finanzas/cheques' },
    ],
  },
  {
    id: 'usuarios',
    label: 'Usuarios',
    icon: 'usuarios',
    adminOnly: true,
    sections: [
      { id: 'usuarios', label: 'Usuarios', path: '/usuarios' },
    ],
  },
];

/** Todas las secciones (aplanadas), útiles para lookups. */
export function getAllSections(): SectionDef[] {
  return MODULES.flatMap((m) => m.sections);
}

export function getSectionById(sectionId: string): SectionDef | undefined {
  return getAllSections().find((s) => s.id === sectionId);
}

export function getSectionLabel(sectionId: string): string {
  return getSectionById(sectionId)?.label ?? sectionId;
}

/** Normaliza ids viejos a ids de sección actuales (sin duplicados). */
export function normalizeSectionIds(ids: string[]): string[] {
  const mapped = ids.map((id) => LEGACY_SECTION_MAP[id] ?? id);
  return [...new Set(mapped)];
}

/** Permiso a nivel SECCIÓN. Admin = todo. */
export function canAccess(user: User, sectionId: string): boolean {
  if (user.role === 'admin') return true;
  const section = getSectionById(sectionId);
  if (!section) return false;
  if (section.adminOnly) return false;
  const mod = MODULES.find((m) => m.sections.some((s) => s.id === sectionId));
  if (mod?.adminOnly) return false;
  return normalizeSectionIds(user.modules).includes(sectionId);
}

/** ¿El usuario ve el módulo en el sidebar? (al menos una sección accesible) */
export function canAccessModule(user: User, mod: ModuleDef): boolean {
  if (mod.adminOnly) return user.role === 'admin';
  return mod.sections.some((s) => canAccess(user, s.id));
}

/** Primera sección accesible del módulo (para click en encabezado). */
export function firstAccessibleSectionPath(user: User, mod: ModuleDef): string | null {
  const section = mod.sections.find((s) => canAccess(user, s.id));
  return section?.path ?? null;
}

/** Primera ruta permitida (login / redirecciones). */
export function firstAllowedPath(user: User): string {
  if (user.role === 'admin') return '/';
  for (const mod of MODULES) {
    if (mod.adminOnly) continue;
    const path = firstAccessibleSectionPath(user, mod);
    if (path) return path;
  }
  return '/login';
}

/** Secciones asignables a vendedores (agrupadas por módulo, sin adminOnly). */
export function assignableModules(): ModuleDef[] {
  return MODULES
    .filter((m) => !m.adminOnly)
    .map((m) => ({
      ...m,
      sections: m.sections.filter((s) => !s.adminOnly),
    }))
    .filter((m) => m.sections.length > 0);
}

/** Default de permisos para un vendedor nuevo. */
export const DEFAULT_VENDOR_SECTIONS = ['ingresos-punto-de-venta'];
