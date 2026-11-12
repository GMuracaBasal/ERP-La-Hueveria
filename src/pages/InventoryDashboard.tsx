import React, { useEffect, useState } from 'react';
import { inventoryDB, productsDB, salesDB } from '../lib/db';
import {
  INVENTORY_WINDOW_DAYS,
  buildInventorySnapshot,
  inventoryWindowStart,
  type InventorySnapshot,
} from '../lib/inventoryDashboard';
import { useToast } from '../components/ui';
import { formatCurrency, formatFecha } from '../lib/utils';

function errorText(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'object' && err) {
    const record = err as { message?: unknown; details?: unknown; hint?: unknown };
    const parts = [record.message, record.details, record.hint].filter(
      (part): part is string => typeof part === 'string' && part.trim() !== '',
    );
    if (parts.length > 0) return parts.join(' ');
  }
  return 'No se pudo cargar el dashboard de inventario.';
}

function formatUnits(value: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(value);
}

function formatSignedUnits(value: number): string {
  const body = formatUnits(Math.abs(value));
  if (value > 0) return `+${body}`;
  if (value < 0) return `−${body}`;
  return body;
}

function formatCoverage(days: number | null): string {
  if (days == null) return '—';
  if (days <= 0) return '0';
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(days);
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)}%`;
}

function replenishmentRowClass(stock: number, coverage: number | null): string {
  if (stock <= 0 || coverage === 0) return 'bg-red-50';
  if (coverage != null && coverage < 7) return 'bg-amber-50';
  return '';
}

export default function InventoryDashboard() {
  const { toast } = useToast();
  const [snapshot, setSnapshot] = useState<InventorySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const windowStart = inventoryWindowStart();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const since = inventoryWindowStart();
        const [products, movements, saleLines] = await Promise.all([
          productsDB.getAll(),
          inventoryDB.listSince(since),
          salesDB.listItemsSince(since),
        ]);
        if (cancelled) return;
        setSnapshot(buildInventorySnapshot(products, movements, saleLines));
        setError('');
      } catch (err) {
        if (cancelled) return;
        const message = errorText(err);
        setError(message);
        setSnapshot(null);
        toast.error(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Carga única al entrar. toast no es estable entre renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Inventario</h1>
        <p className="text-sm text-brand-muted mt-1">
          Foto del stock de hoy. Cobertura, rotación y movimiento usan los últimos {INVENTORY_WINDOW_DAYS} días, desde el {formatFecha(windowStart)}.
        </p>
      </div>

      {loading && (
        <div className="bg-white rounded-2xl border border-brand-border shadow-sm p-8 text-center text-brand-muted text-sm">
          Cargando el stock de hoy…
        </div>
      )}

      {!loading && error && (
        <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-8 text-center text-sm text-brand-danger">
          {error}
        </div>
      )}

      {!loading && snapshot && <DashboardBody snapshot={snapshot} />}
    </div>
  );
}

function DashboardBody({ snapshot }: { snapshot: InventorySnapshot }) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard
          label="Valorización del stock"
          value={formatCurrency(snapshot.stockValue)}
          hint="Capital inmovilizado · al día de hoy"
        />
        <StatCard
          label="Con stock bajo"
          value={formatUnits(snapshot.lowStockCount)}
          hint="Stock por encima de cero y hasta el mínimo"
          tone={snapshot.lowStockCount > 0 ? 'amber' : 'default'}
        />
        <StatCard
          label="En quiebre"
          value={formatUnits(snapshot.stockoutCount)}
          hint="Ventas que no podés hacer"
          tone={snapshot.stockoutCount > 0 ? 'red' : 'default'}
        />
        <StatCard
          label="Productos activos"
          value={formatUnits(snapshot.activeProducts)}
          hint="Total de productos cargados"
        />
      </div>

      <Section
        title="Reposición urgente"
        note="Cobertura calculada sobre los últimos 30 días."
      >
        {snapshot.replenishment.length === 0 ? (
          <EmptyNote>No hay productos para reponer.</EmptyNote>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-[10px] uppercase text-white font-bold bg-brand-navy">
                <tr>
                  <th className="px-4 py-3 text-left">Producto</th>
                  <th className="px-4 py-3 text-left">Categoría</th>
                  <th className="px-4 py-3 text-right">Stock actual</th>
                  <th className="px-4 py-3 text-right">Mínimo</th>
                  <th className="px-4 py-3 text-right">Venta diaria promedio</th>
                  <th className="px-4 py-3 text-right">Días de cobertura</th>
                  <th className="px-4 py-3 text-right">Valorizado</th>
                </tr>
              </thead>
              <tbody className="text-sm text-gray-600">
                {snapshot.replenishment.map((row) => (
                  <tr
                    key={row.product.id}
                    className={`border-b border-gray-50 ${replenishmentRowClass(row.product.stock, row.coverageDays)}`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{row.product.name}</div>
                      <div className="text-xs text-brand-muted">{row.product.sku}</div>
                    </td>
                    <td className="px-4 py-3">{row.product.category || 'Sin categoría'}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatUnits(row.product.stock)}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatUnits(row.product.minStock)}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatUnits(row.dailyAverage)}</td>
                    <td className="px-4 py-3 text-right font-bold">{formatCoverage(row.coverageDays)}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatCurrency(row.valorized)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Movimiento de los últimos 30 días" note="Los ajustes no entran en estos tres números.">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4">
          <MiniStat label="Entradas" value={formatUnits(snapshot.entries)} hint="Unidades" />
          <MiniStat label="Salidas" value={formatUnits(snapshot.exits)} hint="Unidades" />
          <MiniStat
            label="Neto"
            value={formatSignedUnits(snapshot.net)}
            hint="Entradas − salidas"
            valueClass={snapshot.net > 0 ? 'text-green-700' : snapshot.net < 0 ? 'text-brand-danger' : 'text-brand-brown'}
          />
        </div>
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Más vendidos" note="Últimos 30 días. El importe es lo facturado en ventas no anuladas.">
          {snapshot.bestSellers.length === 0 ? (
            <EmptyNote>No hubo salidas en los últimos 30 días.</EmptyNote>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-[10px] uppercase text-white font-bold bg-brand-navy">
                  <tr>
                    <th className="px-4 py-3 text-left">Producto</th>
                    <th className="px-4 py-3 text-right">Unidades</th>
                    <th className="px-4 py-3 text-right">Importe facturado</th>
                  </tr>
                </thead>
                <tbody className="text-sm text-gray-600">
                  {snapshot.bestSellers.map((row) => (
                    <tr key={row.product.id} className="border-b border-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{row.product.name}</div>
                        <div className="text-xs text-brand-muted">{row.product.sku}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{formatUnits(row.units)}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatCurrency(row.billed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Sin movimiento" note="Capital dormido. Productos sin ninguna salida en los últimos 30 días.">
          {snapshot.idle.length === 0 ? (
            <EmptyNote>Todos los productos tuvieron alguna salida en los últimos 30 días.</EmptyNote>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-[10px] uppercase text-white font-bold bg-brand-navy">
                  <tr>
                    <th className="px-4 py-3 text-left">Producto</th>
                    <th className="px-4 py-3 text-right">Stock</th>
                    <th className="px-4 py-3 text-right">Valorizado</th>
                  </tr>
                </thead>
                <tbody className="text-sm text-gray-600">
                  {snapshot.idle.map((row) => (
                    <tr key={row.product.id} className="border-b border-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{row.product.name}</div>
                        <div className="text-xs text-brand-muted">{row.product.sku}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{formatUnits(row.product.stock)}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatCurrency(row.valorized)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>

      <Section title="Valorización por categoría" note="Participación sobre el capital inmovilizado de hoy.">
        {snapshot.categories.length === 0 ? (
          <EmptyNote>No hay productos cargados.</EmptyNote>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-[10px] uppercase text-white font-bold bg-brand-navy">
                <tr>
                  <th className="px-4 py-3 text-left">Categoría</th>
                  <th className="px-4 py-3 text-right">Productos</th>
                  <th className="px-4 py-3 text-right">Unidades en stock</th>
                  <th className="px-4 py-3 text-right">Valorizado</th>
                  <th className="px-4 py-3 text-left w-[220px]">% del total</th>
                </tr>
              </thead>
              <tbody className="text-sm text-gray-600">
                {snapshot.categories.map((row) => (
                  <tr key={row.category} className="border-b border-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{row.category}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatUnits(row.products)}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatUnits(row.units)}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatCurrency(row.valorized)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className="h-full bg-brand-navy rounded-full"
                            style={{ width: `${Math.min(100, Math.max(0, row.percent))}%` }}
                          />
                        </div>
                        <span className="w-14 text-right font-mono text-xs">{formatPercent(row.percent)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Ajustes de stock"
        note="Últimos 30 días. Los ajustes suelen ser roturas, mermas o errores de carga."
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 border-b border-brand-border">
          <MiniStat label="Ajustes" value={formatUnits(snapshot.adjustmentCount)} hint="Movimientos de ajuste" />
          <MiniStat label="Unidades netas" value={formatSignedUnits(snapshot.adjustmentUnits)} hint="Suma de las cantidades registradas" />
          <MiniStat label="Impacto" value={formatCurrency(snapshot.adjustmentValue)} hint="Cantidad × costo actual" />
        </div>
        {snapshot.recentAdjustments.length === 0 ? (
          <EmptyNote>No hubo ajustes en los últimos 30 días.</EmptyNote>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-[10px] uppercase text-white font-bold bg-brand-navy">
                <tr>
                  <th className="px-4 py-3 text-left">Fecha</th>
                  <th className="px-4 py-3 text-left">Producto</th>
                  <th className="px-4 py-3 text-right">Cantidad</th>
                  <th className="px-4 py-3 text-left">Motivo</th>
                </tr>
              </thead>
              <tbody className="text-sm text-gray-600">
                {snapshot.recentAdjustments.map((row) => (
                  <tr key={row.id} className="border-b border-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap">{formatFecha(row.date)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{row.productName}</div>
                      <div className="text-xs text-brand-muted">{row.sku}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{formatUnits(row.quantity)}</td>
                    <td className="px-4 py-3">{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint: string;
  tone?: 'default' | 'amber' | 'red';
}) {
  const toneClass = tone === 'amber'
    ? 'border-amber-300 bg-amber-50'
    : tone === 'red'
      ? 'border-red-300 bg-red-50'
      : 'border-brand-border bg-white';
  const valueClass = tone === 'amber'
    ? 'text-amber-800'
    : tone === 'red'
      ? 'text-brand-danger'
      : 'text-brand-brown';
  return (
    <div className={`rounded-2xl border px-5 py-4 min-w-0 ${toneClass}`}>
      <div className="text-xs font-bold uppercase tracking-wider text-brand-muted">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${valueClass}`}>{value}</div>
      <p className="text-xs text-brand-muted mt-1">{hint}</p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  hint,
  valueClass = 'text-brand-brown',
}: {
  label: string;
  value: string;
  hint: string;
  valueClass?: string;
}) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-wider text-brand-muted">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${valueClass}`}>{value}</div>
      <p className="text-xs text-brand-muted mt-1">{hint}</p>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-brand-border flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-brand-border bg-brand-cream/30">
        <h2 className="font-bold text-brand-brown flex items-center gap-2">
          <span className="w-2 h-4 bg-brand-orange rounded-full" />
          {title}
        </h2>
        <p className="text-xs text-brand-muted mt-1">{note}</p>
      </div>
      {children}
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="px-6 py-8 text-sm text-brand-muted italic text-center">{children}</p>;
}
