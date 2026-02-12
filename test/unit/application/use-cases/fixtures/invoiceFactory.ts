import { Invoice, IInvoiceProps } from '@/domain/entities/Invoice.entity';

const baseInvoiceProps: IInvoiceProps = {
  invoiceNumber: '0001-00001234',
  date: '2024-12-01',
  operationType: 'A',
  vendor: {
    name: 'ACME Inc.',
    taxId: '30-12345678-9',
    address: 'Main St 123',
  },
  totalAmount: 1500,
  currency: 'ARS',
  receiverBank: 'Galicia',
  items: [
    {
      description: 'Consulting services',
      quantity: 1,
      unitPrice: 1500,
      subtotal: 1500,
    },
  ],
  taxes: {
    iva: 315,
    otherTaxes: 0,
  },
  paymentMethod: 'Transfer',
  metadata: {
    processedAt: '2024-12-01T10:00:00.000Z',
    processingTimeMs: 1200,
    confidence: 'high',
    model: 'gpt-4o-mini',
  },
};

export const createInvoice = (overrides: Partial<IInvoiceProps> = {}): Invoice => {
  const merged: IInvoiceProps = {
    ...baseInvoiceProps,
    ...overrides,
    vendor: {
      ...baseInvoiceProps.vendor,
      ...overrides.vendor,
    },
    items: overrides.items ?? baseInvoiceProps.items,
    taxes: overrides.taxes ?? baseInvoiceProps.taxes,
    metadata: {
      ...baseInvoiceProps.metadata,
      ...overrides.metadata,
    },
  };

  return new Invoice(merged);
};
