/**
 * Test suite para Invoice.entity.ts (DOMAIN)
 * Tests UNITARIOS del modelo de dominio
 * Valida lógica de negocio, getters, validaciones y métodos del entity
 */

import { describe, it, expect } from 'vitest';
import { Invoice, type IInvoiceProps } from '../src/domain/entities/Invoice.entity';

describe('Invoice Entity (Domain - Unit Tests)', () => {
  // Helper para crear props válidos
  const createValidProps = (overrides?: Partial<IInvoiceProps>): IInvoiceProps => ({
    invoiceNumber: '001-00001234',
    date: '2025-11-03',
    operationType: 'Transferencia',
    vendor: {
      name: 'Empresa Test SA',
      taxId: '30-12345678-9',
      cvu: '0000003100010123456789',
    },
    totalAmount: 15750.00,
    currency: 'ARS',
    receiverBank: 'Banco Test',
    items: [
      {
        description: 'Servicio de consultoría',
        quantity: 10,
        unitPrice: 1500.00,
        subtotal: 15000.00,
      },
    ],
    taxes: {
      iva: 3150.00,
      otherTaxes: 600.00,
    },
    paymentMethod: 'Transferencia bancaria',
    metadata: {
      processedAt: '2025-11-03T10:00:00Z',
      processingTimeMs: 6420,
      confidence: 'high',
      model: 'gpt-4o-mini',
    },
    ...overrides,
  });

  describe('Constructor y Factory', () => {
    it('debería crear una instancia válida con create()', () => {
      const props = createValidProps();
      const invoice = Invoice.create(props);

      expect(invoice).toBeInstanceOf(Invoice);
      expect(invoice.invoiceNumber).toBe('001-00001234');
    });

    it('debería validar props en el constructor', () => {
      const props = createValidProps();
      const invoice = new Invoice(props);

      expect(invoice).toBeInstanceOf(Invoice);
    });
  });

  describe('Validaciones de negocio', () => {
    it('debería rechazar invoice sin número', () => {
      const props = createValidProps({ invoiceNumber: '' });

      expect(() => Invoice.create(props)).toThrow('Invoice number is required');
    });

    it('debería rechazar invoice con número solo espacios', () => {
      const props = createValidProps({ invoiceNumber: '   ' });

      expect(() => Invoice.create(props)).toThrow('Invoice number is required');
    });

    it('debería rechazar fecha con formato inválido', () => {
      const props = createValidProps({ date: '03/11/2025' });

      expect(() => Invoice.create(props)).toThrow('Invalid date format. Expected YYYY-MM-DD');
    });

    it('debería rechazar fecha vacía', () => {
      const props = createValidProps({ date: '' });

      expect(() => Invoice.create(props)).toThrow('Invalid date format. Expected YYYY-MM-DD');
    });

    it('debería aceptar fecha válida en formato YYYY-MM-DD', () => {
      const props = createValidProps({ date: '2025-12-31' });
      const invoice = Invoice.create(props);

      expect(invoice.date).toBe('2025-12-31');
    });

    it('debería rechazar vendor sin nombre', () => {
      const props = createValidProps({ vendor: { name: '' } });

      expect(() => Invoice.create(props)).toThrow('Vendor name is required');
    });

    it('debería rechazar vendor undefined', () => {
      const props = createValidProps();
      // @ts-ignore - forzar vendor undefined para test
      props.vendor = undefined;

      expect(() => Invoice.create(props)).toThrow('Vendor name is required');
    });

    it('debería rechazar monto total cero', () => {
      const props = createValidProps({ totalAmount: 0 });

      expect(() => Invoice.create(props)).toThrow('Total amount must be positive');
    });

    it('debería rechazar monto total negativo', () => {
      const props = createValidProps({ totalAmount: -100 });

      expect(() => Invoice.create(props)).toThrow('Total amount must be positive');
    });

    it('debería aceptar montos decimales positivos', () => {
      const props = createValidProps({ totalAmount: 0.01 });
      const invoice = Invoice.create(props);

      expect(invoice.totalAmount).toBe(0.01);
    });

    it('debería rechazar currency con longitud incorrecta', () => {
      const props = createValidProps({ currency: 'US' });

      expect(() => Invoice.create(props)).toThrow('Currency must be a 3-letter ISO code');
    });

    it('debería rechazar currency vacía', () => {
      const props = createValidProps({ currency: '' });

      expect(() => Invoice.create(props)).toThrow('Currency must be a 3-letter ISO code');
    });

    it('debería aceptar currency de 3 letras', () => {
      const currencies = ['ARS', 'USD', 'EUR', 'BRL', 'CLP'];

      currencies.forEach(currency => {
        const props = createValidProps({ currency });
        const invoice = Invoice.create(props);
        expect(invoice.currency).toBe(currency);
      });
    });

    it('debería rechazar invoice sin items', () => {
      const props = createValidProps({ items: [] });

      expect(() => Invoice.create(props)).toThrow('Invoice must have at least one item');
    });

    it('debería rechazar invoice con items undefined', () => {
      const props = createValidProps();
      // @ts-ignore - forzar items undefined para test
      props.items = undefined;

      expect(() => Invoice.create(props)).toThrow('Invoice must have at least one item');
    });

    it('debería aceptar invoice con un solo item', () => {
      const props = createValidProps({
        items: [{
          description: 'Item único',
          quantity: 1,
          unitPrice: 100,
          subtotal: 100,
        }],
      });

      const invoice = Invoice.create(props);
      expect(invoice.items).toHaveLength(1);
    });

    it('debería aceptar invoice con múltiples items', () => {
      const props = createValidProps({
        items: [
          { description: 'Item 1', quantity: 1, unitPrice: 100, subtotal: 100 },
          { description: 'Item 2', quantity: 2, unitPrice: 200, subtotal: 400 },
          { description: 'Item 3', quantity: 3, unitPrice: 300, subtotal: 900 },
        ],
      });

      const invoice = Invoice.create(props);
      expect(invoice.items).toHaveLength(3);
    });
  });

  describe('Getters (inmutabilidad)', () => {
    it('debería retornar invoiceNumber', () => {
      const invoice = Invoice.create(createValidProps());
      expect(invoice.invoiceNumber).toBe('001-00001234');
    });

    it('debería retornar date', () => {
      const invoice = Invoice.create(createValidProps());
      expect(invoice.date).toBe('2025-11-03');
    });

    it('debería retornar operationType', () => {
      const invoice = Invoice.create(createValidProps());
      expect(invoice.operationType).toBe('Transferencia');
    });

    it('debería retornar vendor como copia', () => {
      const invoice = Invoice.create(createValidProps());
      const vendor = invoice.vendor;

      expect(vendor.name).toBe('Empresa Test SA');
      expect(vendor.taxId).toBe('30-12345678-9');
    });

    it('debería retornar totalAmount', () => {
      const invoice = Invoice.create(createValidProps());
      expect(invoice.totalAmount).toBe(15750.00);
    });

    it('debería retornar currency', () => {
      const invoice = Invoice.create(createValidProps());
      expect(invoice.currency).toBe('ARS');
    });

    it('debería retornar receiverBank', () => {
      const invoice = Invoice.create(createValidProps());
      expect(invoice.receiverBank).toBe('Banco Test');
    });

    it('debería retornar items como copia', () => {
      const invoice = Invoice.create(createValidProps());
      const items = invoice.items;

      expect(items).toHaveLength(1);
      expect(items[0].description).toBe('Servicio de consultoría');
    });

    it('debería retornar taxes como copia', () => {
      const invoice = Invoice.create(createValidProps());
      const taxes = invoice.taxes;

      expect(taxes?.iva).toBe(3150.00);
      expect(taxes?.otherTaxes).toBe(600.00);
    });

    it('debería retornar undefined si no hay taxes', () => {
      const props = createValidProps({ taxes: undefined });
      const invoice = Invoice.create(props);

      expect(invoice.taxes).toBeUndefined();
    });

    it('debería retornar paymentMethod', () => {
      const invoice = Invoice.create(createValidProps());
      expect(invoice.paymentMethod).toBe('Transferencia bancaria');
    });

    it('debería retornar metadata como copia', () => {
      const invoice = Invoice.create(createValidProps());
      const metadata = invoice.metadata;

      expect(metadata.confidence).toBe('high');
      expect(metadata.processingTimeMs).toBe(6420);
      expect(metadata.model).toBe('gpt-4o-mini');
    });
  });

  describe('Métodos de negocio', () => {
    describe('getTotalWithTaxes()', () => {
      it('debería sumar monto total + impuestos', () => {
        const invoice = Invoice.create(createValidProps({
          totalAmount: 10000,
          taxes: {
            iva: 2100,
            otherTaxes: 500,
          },
        }));

        expect(invoice.getTotalWithTaxes()).toBe(12600);
      });

      it('debería retornar solo totalAmount si no hay taxes', () => {
        const invoice = Invoice.create(createValidProps({
          totalAmount: 10000,
          taxes: undefined,
        }));

        expect(invoice.getTotalWithTaxes()).toBe(10000);
      });

      it('debería manejar taxes con valores en cero', () => {
        const invoice = Invoice.create(createValidProps({
          totalAmount: 10000,
          taxes: {
            iva: 0,
            otherTaxes: 0,
          },
        }));

        expect(invoice.getTotalWithTaxes()).toBe(10000);
      });

      it('debería calcular correctamente con decimales', () => {
        const invoice = Invoice.create(createValidProps({
          totalAmount: 1234.56,
          taxes: {
            iva: 123.45,
            otherTaxes: 67.89,
          },
        }));

        expect(invoice.getTotalWithTaxes()).toBeCloseTo(1425.90, 2);
      });
    });

    describe('getFormattedDate()', () => {
      it('debería formatear fecha a DD/MM/YYYY', () => {
        const invoice = Invoice.create(createValidProps({ date: '2025-11-03' }));
        expect(invoice.getFormattedDate()).toBe('03/11/2025');
      });

      it('debería formatear correctamente diferentes fechas', () => {
        const testCases = [
          { input: '2025-01-15', expected: '15/01/2025' },
          { input: '2025-12-31', expected: '31/12/2025' },
          { input: '2025-06-01', expected: '01/06/2025' },
        ];

        testCases.forEach(({ input, expected }) => {
          const invoice = Invoice.create(createValidProps({ date: input }));
          expect(invoice.getFormattedDate()).toBe(expected);
        });
      });
    });

    describe('isHighConfidence()', () => {
      it('debería retornar true para confidence "high"', () => {
        const invoice = Invoice.create(createValidProps({
          metadata: {
            processedAt: '2025-11-03T10:00:00Z',
            processingTimeMs: 1000,
            confidence: 'high',
          },
        }));

        expect(invoice.isHighConfidence()).toBe(true);
      });

      it('debería retornar false para confidence "medium"', () => {
        const invoice = Invoice.create(createValidProps({
          metadata: {
            processedAt: '2025-11-03T10:00:00Z',
            processingTimeMs: 1000,
            confidence: 'medium',
          },
        }));

        expect(invoice.isHighConfidence()).toBe(false);
      });

      it('debería retornar false para confidence "low"', () => {
        const invoice = Invoice.create(createValidProps({
          metadata: {
            processedAt: '2025-11-03T10:00:00Z',
            processingTimeMs: 1000,
            confidence: 'low',
          },
        }));

        expect(invoice.isHighConfidence()).toBe(false);
      });
    });

    describe('getFormattedAmount()', () => {
      it('debería formatear monto en ARS', () => {
        const invoice = Invoice.create(createValidProps({
          totalAmount: 15750.50,
          currency: 'ARS',
        }));

        const formatted = invoice.getFormattedAmount();
        expect(formatted).toContain('15');
        expect(formatted).toContain('750');
        expect(formatted).toContain('50');
      });

      it('debería formatear monto en USD', () => {
        const invoice = Invoice.create(createValidProps({
          totalAmount: 1234.56,
          currency: 'USD',
        }));

        const formatted = invoice.getFormattedAmount();
        expect(formatted).toContain('1');
        expect(formatted).toContain('234');
        expect(formatted).toContain('56');
      });

      it('debería incluir 2 decimales', () => {
        const invoice = Invoice.create(createValidProps({
          totalAmount: 100,
          currency: 'ARS',
        }));

        const formatted = invoice.getFormattedAmount();
        expect(formatted).toMatch(/\d+[.,]\d{2}/);
      });
    });

    describe('toObject()', () => {
      it('debería convertir a objeto plano', () => {
        const props = createValidProps();
        const invoice = Invoice.create(props);
        const obj = invoice.toObject();

        expect(obj.invoiceNumber).toBe(props.invoiceNumber);
        expect(obj.date).toBe(props.date);
        expect(obj.totalAmount).toBe(props.totalAmount);
        expect(obj.vendor.name).toBe(props.vendor.name);
      });

      it('debería crear copias independientes', () => {
        const invoice = Invoice.create(createValidProps());
        const obj = invoice.toObject();

        // Modificar el objeto no debería afectar el entity original
        obj.totalAmount = 99999;
        expect(invoice.totalAmount).not.toBe(99999);
        expect(invoice.totalAmount).toBe(15750.00);
      });

      it('debería incluir todos los campos', () => {
        const invoice = Invoice.create(createValidProps());
        const obj = invoice.toObject();

        expect(obj).toHaveProperty('invoiceNumber');
        expect(obj).toHaveProperty('date');
        expect(obj).toHaveProperty('operationType');
        expect(obj).toHaveProperty('vendor');
        expect(obj).toHaveProperty('totalAmount');
        expect(obj).toHaveProperty('currency');
        expect(obj).toHaveProperty('receiverBank');
        expect(obj).toHaveProperty('items');
        expect(obj).toHaveProperty('taxes');
        expect(obj).toHaveProperty('paymentMethod');
        expect(obj).toHaveProperty('metadata');
      });

      it('debería manejar campos opcionales undefined', () => {
        const props = createValidProps({
          operationType: undefined,
          receiverBank: undefined,
          taxes: undefined,
          paymentMethod: undefined,
        });
        const invoice = Invoice.create(props);
        const obj = invoice.toObject();

        expect(obj.operationType).toBeUndefined();
        expect(obj.receiverBank).toBeUndefined();
        expect(obj.taxes).toBeUndefined();
        expect(obj.paymentMethod).toBeUndefined();
      });
    });
  });

  describe('Edge Cases y Casos Límite', () => {
    it('debería aceptar vendor solo con nombre (sin taxId ni cvu)', () => {
      const props = createValidProps({
        vendor: {
          name: 'Empresa Simple',
        },
      });

      const invoice = Invoice.create(props);
      expect(invoice.vendor.name).toBe('Empresa Simple');
      expect(invoice.vendor.taxId).toBeUndefined();
      expect(invoice.vendor.cvu).toBeUndefined();
    });

    it('debería manejar nombres de vendor con caracteres especiales', () => {
      const props = createValidProps({
        vendor: {
          name: 'Empresa & Asociados <Test> S.A.',
        },
      });

      const invoice = Invoice.create(props);
      expect(invoice.vendor.name).toBe('Empresa & Asociados <Test> S.A.');
    });

    it('debería aceptar operationType undefined', () => {
      const props = createValidProps({ operationType: undefined });
      const invoice = Invoice.create(props);

      expect(invoice.operationType).toBeUndefined();
    });

    it('debería aceptar receiverBank undefined', () => {
      const props = createValidProps({ receiverBank: undefined });
      const invoice = Invoice.create(props);

      expect(invoice.receiverBank).toBeUndefined();
    });

    it('debería manejar montos muy grandes', () => {
      const props = createValidProps({ totalAmount: 999999999.99 });
      const invoice = Invoice.create(props);

      expect(invoice.totalAmount).toBe(999999999.99);
    });

    it('debería manejar montos muy pequeños', () => {
      const props = createValidProps({ totalAmount: 0.01 });
      const invoice = Invoice.create(props);

      expect(invoice.totalAmount).toBe(0.01);
    });

    it('debería manejar item con cantidad decimal', () => {
      const props = createValidProps({
        items: [{
          description: 'Servicio por hora',
          quantity: 2.5,
          unitPrice: 100,
          subtotal: 250,
        }],
      });

      const invoice = Invoice.create(props);
      expect(invoice.items[0].quantity).toBe(2.5);
    });

    it('debería aceptar metadata sin model', () => {
      const props = createValidProps({
        metadata: {
          processedAt: '2025-11-03T10:00:00Z',
          processingTimeMs: 1000,
          confidence: 'high',
        },
      });

      const invoice = Invoice.create(props);
      expect(invoice.metadata.model).toBeUndefined();
    });
  });
});

