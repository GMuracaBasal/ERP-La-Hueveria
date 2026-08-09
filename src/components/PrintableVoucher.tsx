import React from 'react';
import { Egg } from 'lucide-react';
import { formatCurrency, formatFecha } from '../lib/utils';

export type VoucherDocType = 'venta' | 'compra';

export interface VoucherLineItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface VoucherParty {
  /** DESTINATARIO (venta) o PROVEEDOR (compra) */
  sectionTitle: string;
  name: string;
  /** Si no hay CUIT/CUIL en el sistema, mostrar "S/D". */
  taxId?: string | null;
  contactName?: string | null;
  address?: string | null;
  phone?: string | null;
  /** Solo compras: Nº de factura/remito del proveedor */
  invoiceNumber?: string | null;
}

export interface VoucherCommercial {
  condition: string;
  paymentMethod: string;
  /** Solo ventas: Mostrador / Mayorista */
  pointOfSale?: string | null;
}

export interface PrintableVoucherProps {
  docType: VoucherDocType;
  documentNumber: string;
  date: string;
  businessName: string;
  businessTagline?: string;
  businessAddress?: string | null;
  party: VoucherParty;
  commercial: VoucherCommercial;
  items: VoucherLineItem[];
  total: number;
  voided?: boolean;
  className?: string;
}

const DOC_TITLE: Record<VoucherDocType, string> = {
  venta: 'COMPROBANTE DE VENTA',
  compra: 'COMPROBANTE DE COMPRA',
};

/**
 * Comprobante formal A4 (venta / compra).
 * Misma maqueta en vista previa e impresión — solo presentación.
 */
export default function PrintableVoucher({
  docType,
  documentNumber,
  date,
  businessName,
  businessTagline = 'Distribución de huevos',
  businessAddress,
  party,
  commercial,
  items,
  total,
  voided = false,
  className = '',
}: PrintableVoucherProps) {
  const itemsQty = items.reduce((acc, i) => acc + i.quantity, 0);
  const shortNumber = documentNumber.slice(0, 8).toUpperCase();

  return (
    <div className={`printable-voucher ${className}`.trim()}>
      {voided && (
        <>
          <div className="pv-void-banner" aria-hidden="true">
            ANULADO
          </div>
          <div className="pv-void-watermark" aria-hidden="true">
            ANULADO
          </div>
        </>
      )}

      <header className="pv-header">
        <div className="pv-brand">
          <div className="pv-logo" aria-hidden="true">
            <Egg className="pv-logo-icon" strokeWidth={2.25} />
          </div>
          <div className="pv-brand-text">
            <div className="pv-business-name">{businessName}</div>
            {businessTagline ? (
              <div className="pv-tagline">{businessTagline}</div>
            ) : null}
            {businessAddress ? (
              <div className="pv-address">{businessAddress}</div>
            ) : null}
          </div>
        </div>
        <div className="pv-doc-box">
          <div className="pv-doc-type">{DOC_TITLE[docType]}</div>
          <div className="pv-doc-number">Nº {shortNumber}</div>
          <div className="pv-doc-date">{formatFecha(date)}</div>
        </div>
      </header>

      <div className="pv-rule" />

      <section className="pv-meta">
        <div className="pv-meta-col">
          <h3 className="pv-section-title">{party.sectionTitle}</h3>
          <div className="pv-party-name">{party.name}</div>
          <div className="pv-party-line">
            <span className="pv-label">CUIT/CUIL:</span> {party.taxId?.trim() || 'S/D'}
          </div>
          {party.contactName?.trim() ? (
            <div className="pv-party-line">
              <span className="pv-label">Contacto:</span> {party.contactName}
            </div>
          ) : null}
          {party.address?.trim() ? (
            <div className="pv-party-line">
              <span className="pv-label">Dirección:</span> {party.address}
            </div>
          ) : null}
          {party.phone?.trim() ? (
            <div className="pv-party-line">
              <span className="pv-label">Teléfono:</span> {party.phone}
            </div>
          ) : null}
          {party.invoiceNumber?.trim() ? (
            <div className="pv-party-line">
              <span className="pv-label">Factura / Remito:</span> {party.invoiceNumber}
            </div>
          ) : null}
        </div>
        <div className="pv-meta-col pv-meta-col--right">
          <h3 className="pv-section-title">Información comercial</h3>
          <div className="pv-party-line">
            <span className="pv-label">Condición:</span> {commercial.condition}
          </div>
          <div className="pv-party-line">
            <span className="pv-label">Medio de pago:</span> {commercial.paymentMethod}
          </div>
          {commercial.pointOfSale ? (
            <div className="pv-party-line">
              <span className="pv-label">Punto de venta:</span> {commercial.pointOfSale}
            </div>
          ) : null}
        </div>
      </section>

      <table className="pv-table">
        <thead>
          <tr>
            <th className="pv-col-product">Producto</th>
            <th className="pv-col-qty">Cantidad</th>
            <th className="pv-col-price">Precio Unit.</th>
            <th className="pv-col-sub">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx}>
              <td className="pv-col-product">{item.productName}</td>
              <td className="pv-col-qty">{item.quantity}</td>
              <td className="pv-col-price">{formatCurrency(item.unitPrice)}</td>
              <td className="pv-col-sub">{formatCurrency(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="pv-totals">
        <div className="pv-totals-left">
          <span className="pv-items-summary">
            {items.length} {items.length === 1 ? 'ítem' : 'ítems'}
            {' · '}
            {itemsQty} u. en total
          </span>
        </div>
        <div className="pv-totals-right">
          <div className="pv-subtotal-row">
            <span>SUBTOTAL</span>
            <span className={voided ? 'pv-struck' : undefined}>{formatCurrency(total)}</span>
          </div>
          <div className="pv-total-row">
            <span>TOTAL</span>
            <span className={voided ? 'pv-struck' : undefined}>{formatCurrency(total)}</span>
          </div>
        </div>
      </div>

      <footer className="pv-footer">
        <div className="pv-signatures">
          <div className="pv-sign">
            <div className="pv-sign-line" />
            <div className="pv-sign-label">FIRMA DEL RECEPTOR / Aclaración y DNI</div>
          </div>
          <div className="pv-sign">
            <div className="pv-sign-line" />
            <div className="pv-sign-label">POR LA HUEVERÍA</div>
          </div>
        </div>
        <p className="pv-legal">Documento no válido como factura</p>
      </footer>
    </div>
  );
}
