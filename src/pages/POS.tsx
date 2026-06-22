import React, { useState, useEffect } from 'react';
import { productsDB, salesDB, inventoryDB, financeDB, priceListsDB, db } from '../lib/db';
import { Product, SaleItem, PriceList, Settings } from '../types';
import { Button } from '../components/ui';
import { generateId, formatCurrency } from '../lib/utils';

export default function POS() {
  const [products, setProducts] = useState<Product[]>([]);
  const [defaultList, setDefaultList] = useState<PriceList | null>(null);
  const [search, setSearch] = useState('');
  const [cartItems, setCartItems] = useState<SaleItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'Efectivo' | 'QR / Transferencia'>('Efectivo');
  const [cashReceived, setCashReceived] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<{total: number, change: number | null} | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    (async () => {
      setSettings(await db.getSettings());
      loadData();
    })();
  }, []);

  const loadData = async () => {
    setProducts(await productsDB.getAll());
    const lists = await priceListsDB.getAll();
    const defaultL = lists.find(l => l.isDefault) || null;
    setDefaultList(defaultL);
  };

  const filteredProd = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.sku.toLowerCase().includes(search.toLowerCase())
  );

  const getProductPrice = (productId: string) => {
    if (!defaultList) return 0;
    return defaultList.prices[productId] || 0;
  };

  const getCartQuantity = (productId: string) => {
    return cartItems.find(item => item.productId === productId)?.quantity || 0;
  };

  const handleProductClick = (product: Product) => {
    if (product.stock <= 0) return;

    const existingIndex = cartItems.findIndex(item => item.productId === product.id);
    const existingQuantity = existingIndex >= 0 ? cartItems[existingIndex].quantity : 0;

    if (existingQuantity >= product.stock) return;

    const unitPrice = getProductPrice(product.id);

    if (existingIndex >= 0) {
      const newItems = [...cartItems];
      newItems[existingIndex].quantity += 1;
      newItems[existingIndex].subtotal = newItems[existingIndex].quantity * unitPrice;
      setCartItems(newItems);
    } else {
      setCartItems([...cartItems, {
        productId: product.id,
        quantity: 1,
        unitPrice: unitPrice,
        subtotal: unitPrice
      }]);
    }
  };

  const updateCartQuantity = (productId: string, newQuantity: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    if (newQuantity < 1) newQuantity = 1;
    if (newQuantity > product.stock) newQuantity = product.stock;

    const newItems = cartItems.map(item => {
      if (item.productId === productId) {
        return {
          ...item,
          quantity: newQuantity,
          subtotal: newQuantity * item.unitPrice
        };
      }
      return item;
    });
    setCartItems(newItems);
  };

  const removeCartItem = (productId: string) => {
    setCartItems(cartItems.filter(item => item.productId !== productId));
  };

  const total = cartItems.reduce((acc, item) => acc + item.subtotal, 0);

  const handleSaveSale = async () => {
    if (cartItems.length === 0) return;
    
    if (paymentMethod === 'Efectivo') {
      const received = parseFloat(cashReceived);
      if (isNaN(received) || received < total) {
        alert("Monto recibido es insuficiente");
        return;
      }
    }

    const saleId = generateId();
    const dateStr = new Date().toISOString();

    // 1. Guardar la venta
    await salesDB.save({
      id: saleId,
      date: dateStr,
      customerId: null, // Consumidor Final
      paymentMethod: paymentMethod,
      total: total,
      items: cartItems
    });

    // 2. Registrar ingreso en finanzas
    await financeDB.save({
      id: generateId(),
      date: dateStr,
      type: 'ingreso',
      concept: `Venta POS #${saleId.slice(0, 6).toUpperCase()}`,
      amount: total,
      paymentMethod: paymentMethod,
      referenceId: saleId
    });

    // 3. Actualizar inventario y stock
    for (const item of cartItems) {
      const prod = await productsDB.getById(item.productId);
      if (prod) {
        prod.stock -= item.quantity;
        await productsDB.save(prod);
        await inventoryDB.save({
          id: generateId(),
          date: dateStr,
          productId: prod.id,
          type: 'salida',
          quantity: item.quantity,
          referenceId: saleId,
          reason: 'Venta POS - Consumidor Final'
        });
      }
    }

    const received = parseFloat(cashReceived);
    const change = (paymentMethod === 'Efectivo' && !isNaN(received)) ? received - total : null;

    setSuccessMessage({ total, change });
    
    setCartItems([]);
    setCashReceived('');
    setPaymentMethod('Efectivo');
    loadData(); // Refrescar stock

    setTimeout(() => {
      setSuccessMessage(null);
    }, 3000);
  };

  if (successMessage) {
    return (
      <div className="flex-1 bg-brand-cream flex items-center justify-center h-full absolute inset-0 z-50">
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-brand-border text-center max-w-sm w-full">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">¡Venta Registrada!</h2>
          <p className="text-gray-500 mb-4">La venta se guardó correctamente.</p>
          <div className="bg-gray-50 p-4 rounded-xl">
            <p className="text-sm text-gray-500 mb-1">Total Cobrado</p>
            <p className="text-2xl font-bold text-brand-brown">{formatCurrency(successMessage.total)}</p>
            {successMessage.change !== null && (
              <div className="mt-2 pt-2 border-t border-gray-200">
                <p className="text-sm text-gray-500 mb-1">Vuelto a entregar</p>
                <p className="text-xl font-bold text-green-600">{formatCurrency(successMessage.change)}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden -m-4 sm:-m-8">
      {/* Columna Izquierda: Grilla */}
      <div className="w-[60%] bg-brand-cream flex flex-col border-r border-brand-border">
        <div className="p-6 border-b border-brand-border bg-white flex flex-col gap-4">
          <h1 className="text-2xl font-bold text-brand-brown">Punto de Venta - {settings?.businessName || 'La Hueveria'}</h1>
          <input
            type="text"
            placeholder="Buscar producto..."
            className="w-full border border-brand-border p-3 rounded-lg bg-gray-50 focus:bg-white transition-colors"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProd.map(product => {
              const outOfStock = product.stock <= 0;
              const cartQty = getCartQuantity(product.id);
              const price = getProductPrice(product.id);
              
              return (
                <div 
                  key={product.id}
                  onClick={() => handleProductClick(product)}
                  className={`relative p-4 bg-white rounded-xl border border-brand-border transition-all select-none
                    ${outOfStock ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-md hover:border-brand-orange hover:-translate-y-0.5'}
                  `}
                >
                  <div className="font-bold text-gray-800 line-clamp-2 min-h-[40px] text-sm leading-tight mb-2">{product.name}</div>
                  <div className="text-xl font-bold text-green-600 mb-1">{formatCurrency(price)}</div>
                  <div className="text-xs text-gray-500">Disp: {product.stock} {product.unit}</div>
                  
                  {outOfStock && (
                    <div className="mt-2 text-xs font-bold text-red-600 bg-red-50 p-1 rounded inline-block">SIN STOCK</div>
                  )}

                  {cartQty > 0 && (
                    <div className="absolute -top-2 -right-2 w-7 h-7 bg-brand-orange text-white text-xs font-bold rounded-full flex items-center justify-center shadow-md">
                      {cartQty}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Columna Derecha: Ticket */}
      <div className="w-[40%] bg-white flex flex-col">
        <div className="p-4 border-b border-brand-border bg-gray-50 flex items-center gap-2 text-gray-800">
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>
          <h2 className="font-bold uppercase tracking-wide text-sm">Ticket Actual</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 bg-white">
          {cartItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <svg className="w-16 h-16 mb-4 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>
              <p>Seleccioná un producto para empezar</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cartItems.map(item => {
                const prod = products.find(p => p.id === item.productId);
                return (
                  <div key={item.productId} className="flex gap-3 bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-800 truncate mb-2">{prod?.name}</div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center bg-white border border-gray-200 rounded-md overflow-hidden h-8">
                          <button 
                            className="w-8 h-full flex items-center justify-center text-gray-600 hover:bg-gray-100 font-bold transition-colors"
                            onClick={() => updateCartQuantity(item.productId, item.quantity - 1)}
                          >−</button>
                          <input 
                            type="number" 
                            min="1" 
                            className="w-12 h-full text-center text-sm font-medium border-x border-gray-200 focus:outline-none focus:bg-amber-50"
                            value={item.quantity}
                            onChange={(e) => updateCartQuantity(item.productId, parseInt(e.target.value) || 1)}
                          />
                          <button 
                            className="w-8 h-full flex items-center justify-center text-gray-600 hover:bg-gray-100 font-bold transition-colors"
                            onClick={() => updateCartQuantity(item.productId, item.quantity + 1)}
                          >+</button>
                        </div>
                        <div className="text-xs text-gray-500 font-medium ml-2">x {formatCurrency(item.unitPrice)}</div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end justify-between">
                      <div className="font-bold text-brand-brown">{formatCurrency(item.subtotal)}</div>
                      <button 
                        onClick={() => removeCartItem(item.productId)}
                        className="text-red-400 hover:text-red-600 p-1 transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-brand-border bg-gray-50 p-6 flex flex-col gap-4 shrink-0">
          <div className="flex justify-between items-end">
            <span className="text-gray-500 font-medium uppercase tracking-wider text-sm">Total a cobrar</span>
            <span className="text-3xl font-bold text-brand-brown leading-none">{formatCurrency(total)}</span>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setPaymentMethod('Efectivo')}
              className={`flex-1 py-3 rounded-lg font-bold text-sm transition-colors border ${
                paymentMethod === 'Efectivo' 
                  ? 'bg-brand-orange text-white border-brand-orange shadow-md' 
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Efectivo
            </button>
            <button
              onClick={() => setPaymentMethod('QR / Transferencia')}
              className={`flex-1 py-3 rounded-lg font-bold text-sm transition-colors border ${
                paymentMethod === 'QR / Transferencia' 
                  ? 'bg-brand-orange text-white border-brand-orange shadow-md' 
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              QR / Transferencia
            </button>
          </div>

          {paymentMethod === 'Efectivo' && (
            <div className="bg-white p-3 rounded-lg border border-gray-200 space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-gray-600">Monto Recibido</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-28 pl-7 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-right font-bold text-brand-brown focus:bg-white focus:outline-brand-orange focus:ring-0"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                <span className="text-sm font-bold text-gray-700">Vuelto</span>
                <span className={`font-bold ${
                  cashReceived && parseFloat(cashReceived) >= total ? 'text-green-600' : 'text-red-500'
                }`}>
                  {cashReceived 
                    ? parseFloat(cashReceived) >= total
                      ? formatCurrency(parseFloat(cashReceived) - total)
                      : 'Monto insuficiente'
                    : '$ 0,00'
                  }
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <Button 
              size="lg" 
              className="w-full font-bold uppercase tracking-wide py-4 shadow-lg active:scale-[0.99] transition-transform text-center flex justify-center"
              disabled={cartItems.length === 0}
              onClick={handleSaveSale}
            >
              Cerrar Venta
            </Button>
            <Button 
              variant="secondary" 
              className="w-full text-xs font-semibold"
              disabled={cartItems.length === 0}
              onClick={() => {
                if (confirm('¿Está seguro de limpiar el carrito actual?')) {
                  setCartItems([]);
                  setCashReceived('');
                }
              }}
            >
              Limpiar Tarjeta
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
