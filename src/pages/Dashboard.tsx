import React, { useState, useEffect } from 'react';
import { financeDB } from '../lib/db';
import { FinanceMovement } from '../types';
import { Badge } from '../components/ui';
import { formatCurrency } from '../lib/utils';
import { format, isToday, isThisWeek, isThisMonth, parseISO } from 'date-fns';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

export default function Dashboard() {
  const [movements, setMovements] = useState<FinanceMovement[]>([]);

  const load = async () => {
    const movs = await financeDB.getAll();
    setMovements(movs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  };
  useEffect(() => { load(); }, []);

  // Metricas
  const calcs = (filterFn: (d: Date) => boolean) => {
    const fnc = movements.filter(m => filterFn(parseISO(m.date)));
    const ing = fnc.filter(m => m.type === 'ingreso').reduce((a, c) => a + c.amount, 0);
    const egr = fnc.filter(m => m.type === 'egreso').reduce((a, c) => a + c.amount, 0);
    return { ing, egr, net: ing - egr };
  };

  const today = calcs(isToday);
  const week = calcs(isThisWeek);
  const month = calcs(isThisMonth);

  // Stats chart methods
  const methodsChart = movements
    .filter(m => m.type === 'ingreso' && m.paymentMethod && isThisMonth(parseISO(m.date)))
    .reduce((acc, curr) => {
      const pm = curr.paymentMethod || 'Otros';
      acc[pm] = (acc[pm] || 0) + curr.amount;
      return acc;
    }, {} as Record<string, number>);
  const pieData = Object.keys(methodsChart).map(name => ({ name, value: methodsChart[name] }));
  const pieColors = ['#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#EF4444'];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard & Finanzas</h1>
      </div>

      {/* Tarjetas Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: "HOY", stats: today },
          { label: "ESTA SEMANA", stats: week },
          { label: "ESTE MES", stats: month }
        ].map((period, idx) => (
          <div key={idx} className="bg-white p-5 rounded-2xl border border-brand-border shadow-sm flex flex-col gap-3">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-50 text-green-600 rounded-xl flex items-center justify-center">
                <span className="text-xl font-bold">$</span>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase">{period.label}</p>
                <p className="text-xl font-bold text-gray-800">{formatCurrency(period.stats.net)}</p>
              </div>
            </div>
            <div className="space-y-1 mt-2 text-sm border-t border-gray-50 pt-3">
              <div className="flex justify-between"><span className="text-gray-500">Ingresos</span><span className="font-semibold text-green-600">{formatCurrency(period.stats.ing)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Egresos</span><span className="font-semibold text-red-600">{formatCurrency(period.stats.egr)}</span></div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-brand-border flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b border-brand-border flex justify-between items-center bg-brand-cream/30">
            <h2 className="font-bold text-brand-brown flex items-center gap-2">
              <span className="w-2 h-4 bg-brand-orange rounded-full"></span>
              Historial de Movimientos
            </h2>
          </div>
          <div className="overflow-x-auto max-h-[400px]">
             <table className="min-w-full text-sm">
               <thead className="text-[10px] uppercase text-gray-400 font-bold border-b border-gray-50 sticky top-0 bg-white"><tr>
                 <th className="px-6 py-3 text-left">Fecha</th>
                 <th className="px-6 py-3 text-left">Concepto</th>
                 <th className="px-6 py-3 text-left">Tipo</th>
                 <th className="px-6 py-3 text-right">Monto</th>
               </tr></thead>
               <tbody className="text-sm text-gray-600">
                 {movements.slice(0, 50).map(m => (
                   <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                     <td className="px-6 py-3">{format(parseISO(m.date), 'dd/MM/yyyy HH:mm')}</td>
                     <td className="px-6 py-3 font-medium text-gray-800">{m.concept} {m.paymentMethod && <span className="text-xs font-normal text-gray-500 ml-2">({m.paymentMethod})</span>}</td>
                     <td className="px-6 py-3"><Badge variant={m.type==='ingreso'?'success':'danger'}>{m.type.toUpperCase()}</Badge></td>
                     <td className={`px-6 py-3 text-right font-bold ${m.type==='ingreso'?'text-green-600':'text-red-600'}`}>{m.type==='ingreso'?'+':'-'}{formatCurrency(m.amount)}</td>
                   </tr>
                 ))}
               </tbody>
             </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-brand-border flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b border-brand-border flex justify-between items-center bg-brand-cream/30">
            <h2 className="font-bold text-brand-brown flex items-center gap-2">
              <span className="w-2 h-4 bg-brand-orange rounded-full"></span>
              Pagos (Ingresos Mes)
            </h2>
          </div>
          <div className="h-64 p-4">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={80} paddingAngle={5} dataKey="value">
                    {pieData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
               <div className="h-full flex items-center justify-center text-gray-400">Sin datos este mes</div>
            )}
          </div>
          <div className="px-4 pb-4 space-y-1">
            {pieData.map((d, i) => (
               <div key={d.name} className="flex justify-between text-sm"><span className="flex items-center"><span className="w-3 h-3 rounded-full mr-2" style={{backgroundColor: pieColors[i % pieColors.length]}}/>{d.name}</span><span className="font-medium text-gray-900">{formatCurrency(d.value)}</span></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
