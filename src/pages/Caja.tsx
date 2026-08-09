import React, { useState, useEffect, useMemo } from 'react';
import { salesDB, productsDB, financeDB, priceListsDB, customersDB, db } from '../lib/db';
import { FinanceMovement, Sale, Product, PriceList, Settings, Customer } from '../types';
import { formatCurrency, formatFecha, formatFechaHora, parseLocalDate } from '../lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button, Badge } from '../components/ui';
import SaleTicketModal from '../components/SaleTicketModal';
import FiltroFechas, { defaultDateRange, isDateInRange } from '../components/FiltroFechas';

export default function Caja() {
  const [allFinances, setAllFinances] = useState<FinanceMovement[]>([]);
  const [allSales, setAllSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [dateRange, setDateRange] = useState(defaultDateRange);

  const loadData = async () => {
    const sales = await salesDB.getAll({ includeVoided: true });
    const mostradorSales = sales
      .filter((s) => s.pointOfSale === 'mostrador')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setAllSales(mostradorSales);

    const mostradorIds = new Set(mostradorSales.map((s) => s.id));
    const allFin = await financeDB.getAll();
    // Caja del POS: solo ingresos ligados a ventas de mostrador
    setAllFinances(
      allFin.filter(
        (f) => f.type === 'ingreso' && !!f.referenceId && mostradorIds.has(f.referenceId),
      ),
    );

    setProducts(await productsDB.getAll());
    setPriceLists(await priceListsDB.getAll());
    setCustomers(await customersDB.getAll());
    setSettings(await db.getSettings());
  };

  useEffect(() => {
    loadData();
  }, []);

  const finances = useMemo(
    () => allFinances.filter((f) => isDateInRange(f.date, dateRange.from, dateRange.to)),
    [allFinances, dateRange],
  );

  const rangeSales = useMemo(
    () => allSales.filter((s) => isDateInRange(s.date, dateRange.from, dateRange.to)),
    [allSales, dateRange],
  );

  const getProductName = (productId: string) => {
    return products.find(p => p.id === productId)?.name || 'Desconocido';
  };

  const currentTotal = finances.reduce((acc, f) => acc + f.amount, 0);
  const totalEfectivo = finances.filter(f => f.paymentMethod === 'Efectivo').reduce((acc, f) => acc + f.amount, 0);
  const countEfectivo = finances.filter(f => f.paymentMethod === 'Efectivo').length;
  const totalTransferencia = finances.filter(f => f.paymentMethod === 'QR / Transferencia').reduce((acc, f) => acc + f.amount, 0);
  const countTransferencia = finances.filter(f => f.paymentMethod === 'QR / Transferencia').length;

  const rangeLabel =
    dateRange.from === dateRange.to
      ? format(parseLocalDate(dateRange.from), "EEEE d 'de' MMMM 'de' yyyy", { locale: es })
      : `${formatFecha(dateRange.from)} — ${formatFecha(dateRange.to)}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap justify-between items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-brand-border">
        <div>
          <h1 className="text-2xl font-bold text-brand-brown">Caja del Día</h1>
          <p className="text-sm font-medium text-gray-500 capitalize mt-1">
            {rangeLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <FiltroFechas from={dateRange.from} to={dateRange.to} onChange={setDateRange} />
          <Button variant="secondary" size="sm" onClick={loadData}>
            <svg className="w-4 h-4 mr-2 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            Actualizar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-brand-cream rounded-2xl p-6 border border-brand-orange/30 shadow-sm flex flex-col justify-center">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-orange mb-2">Total del período</p>
          <p className="text-4xl font-black text-brand-brown mb-1">{formatCurrency(currentTotal)}</p>
          <p className="text-sm text-gray-600 font-medium">{finances.length} operaciones</p>
        </div>
        <div className="bg-green-50 rounded-2xl p-6 border border-green-200 shadow-sm flex flex-col justify-center">
          <p className="text-xs font-bold uppercase tracking-widest text-green-600 mb-2">Efectivo</p>
          <p className="text-4xl font-black text-green-700 mb-1">{formatCurrency(totalEfectivo)}</p>
          <p className="text-sm text-green-700/70 font-medium">{countEfectivo} transacciones</p>
        </div>
        <div className="bg-blue-50 rounded-2xl p-6 border border-blue-200 shadow-sm flex flex-col justify-center">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-2">QR / Transferencia</p>
          <p className="text-4xl font-black text-blue-700 mb-1">{formatCurrency(totalTransferencia)}</p>
          <p className="text-sm text-blue-700/70 font-medium">{countTransferencia} transacciones</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-brand-border flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-brand-border flex justify-between items-center bg-brand-cream/30">
          <h2 className="font-bold text-brand-brown flex items-center gap-2">
            <span className="w-2 h-4 bg-brand-orange rounded-full"></span>
            Historial de Ventas
          </h2>
        </div>
        <div className="overflow-x-auto max-h-[500px]">
          {rangeSales.length === 0 ? (
            <div className="p-12 text-center text-gray-500 font-medium">
              No hay ventas en el período seleccionado
            </div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="text-[10px] uppercase text-gray-400 font-bold border-b border-gray-50 bg-white sticky top-0">
                <tr>
                  <th className="px-6 py-3 text-left">Fecha / Hora</th>
                  <th className="px-6 py-3 text-left">Productos</th>
                  <th className="px-6 py-3 text-left">Medio de Pago</th>
                  <th className="px-6 py-3 text-right">Total</th>
                  <th className="px-6 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="text-sm text-gray-600">
                {rangeSales.map(s => {
                  const descList = s.items.map(i => `${getProductName(i.productId)} x${i.quantity}`).join(', ');
                  return (
                    <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-800">
                        {formatFechaHora(s.date)}
                      </td>
                      <td className="px-6 py-4 text-gray-600 max-w-sm truncate" title={descList}>
                        {descList}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={s.paymentMethod === 'Efectivo' ? 'success' : 'default'}>
                          {s.paymentMethod || '—'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-green-700">
                        {formatCurrency(s.total)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedSale(s)}>
                          Ver / Editar
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <SaleTicketModal
        sale={selectedSale}
        onClose={() => setSelectedSale(null)}
        onUpdated={loadData}
        products={products}
        customers={customers}
        priceLists={priceLists}
        settings={settings}
        posStyle
      />
    </div>
  );
}
