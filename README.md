# La Huevería — Sistema de Gestión Comercial

Sistema de gestión para huevería minorista. Administración de compras, ventas, inventario, clientes, proveedores y finanzas.

## Stack

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS
- **Backend:** Supabase (Postgres) — *Fase 2*
- **Deploy:** Vercel
- **Repo:** GitHub

## Módulos

| Módulo | Acceso |
|---|---|
| Dashboard / Finanzas | Admin |
| Productos | Admin |
| Listas de Precios | Admin |
| Compras | Admin |
| Proveedores | Admin |
| Clientes | Admin |
| Ventas | Admin |
| Inventario | Admin |
| Usuarios | Admin |
| POS (Punto de Venta) | Admin + Vendedor |
| Caja | Admin + Vendedor |

## Desarrollo local

**Requisitos:** Node.js 18+

```bash
# 1. Instalar dependencias
npm install

# 2. (Fase 2) Copiar variables de entorno
cp .env.example .env.local
# Completar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY

# 3. Correr en desarrollo
npm run dev
```

## Deploy en Vercel

El deploy es automático al hacer push a `main`.

- **Framework:** Vite (autodetectado)
- **Build command:** `npm run build`
- **Output directory:** `dist`

## Estado del proyecto

| Fase | Descripción | Estado |
|---|---|---|
| Fase 1 | GitHub + Vercel + localStorage | ✅ |
| Fase 2 | Migración a Supabase | 🔜 |
| Fase 3 | Supabase Auth | 🔜 |
