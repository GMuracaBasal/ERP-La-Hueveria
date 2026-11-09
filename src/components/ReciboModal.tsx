import React from 'react';
import { createPortal } from 'react-dom';
import { Button, Modal } from './ui';
import PrintableVoucher, {
  type PrintableVoucherProps,
  type VoucherParty,
  type VoucherPayment,
} from './PrintableVoucher';

export interface ReciboModalProps {
  isOpen: boolean;
  onClose: () => void;
  docType: 'recibo_cobro' | 'recibo_pago';
  documentNumber: string;
  date: string;
  businessName: string;
  party: VoucherParty;
  payment: VoucherPayment;
  voided?: boolean;
}

export default function ReciboModal({
  isOpen,
  onClose,
  docType,
  documentNumber,
  date,
  businessName,
  party,
  payment,
  voided = false,
}: ReciboModalProps) {
  if (!isOpen) return null;

  const voucher: PrintableVoucherProps = {
    docType,
    documentNumber,
    date,
    businessName,
    party,
    payment,
    voided,
  };

  const title = docType === 'recibo_pago' ? 'Comprobante de Pago' : 'Recibo de Cobro';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} wide>
      <div className="space-y-4">
        <div className="no-print">
          <PrintableVoucher {...voucher} className="voucher-preview" />
        </div>

        {typeof document !== 'undefined' &&
          createPortal(
            <div className="printable-ticket" aria-hidden="true">
              <PrintableVoucher {...voucher} />
            </div>,
            document.body,
          )}

        <p className="text-xs text-brand-muted no-print">
          Tip: en el diálogo de impresión, desactivá “Encabezados y pies de página” para no
          imprimir la fecha/URL del navegador.
        </p>

        <div className="flex justify-end gap-2 pt-4 border-t no-print">
          <Button variant="secondary" onClick={() => window.print()}>
            Imprimir
          </Button>
        </div>
      </div>
    </Modal>
  );
}
