/**
 * Test suite para Interfaces.ts
 * Valida schemas Zod y tipos de datos
 */

import { describe, it, expect } from 'vitest';
import {
  VendorSchema,
  InvoiceItemSchema,
  TaxesSchema,
  MetadataSchema,
  InvoiceSchema,
  ProcessingResultSchema,
  type Invoice,
  type Vendor,
  type InvoiceItem,
} from '../src/modules/Interfaces';
import { z } from 'zod';

describe('Interfaces - Zod Schema Validation', () => {
  describe('VendorSchema', () => {
    it('debería validar un vendor completo con todos los campos', () => {
      const vendor = {
        name: 'Empresa Test SA',
        taxId: '30-12345678-9',
        cvu: '0000003100010123456789',
        address: 'Av. Test 123, CABA',
      };

      const result = VendorSchema.parse(vendor);
      expect(result).toEqual(vendor);
    });

    it('debería validar vendor solo con name (campos opcionales)', () => {
      const vendor = {
        name: 'Empresa Mínima',
      };

      const result = VendorSchema.parse(vendor);
      expect(result.name).toBe('Empresa Mínima');
      expect(result.taxId).toBeUndefined();
      expect(result.cvu).toBeUndefined();
    });

    it('debería rechazar vendor sin name', () => {
      const vendor = {
        taxId: '30-12345678-9',
      };

      expect(() => VendorSchema.parse(vendor)).toThrow();
    });

    it('debería rechazar vendor con name vacío', () => {
      const vendor = {
        name: '',
      };

      expect(() => VendorSchema.parse(vendor)).toThrow(z.ZodError);
    });
  });

  describe('InvoiceItemSchema', () => {
    it('debería validar un item completo', () => {
      const item = {
        description: 'Producto Test',
        quantity: 10,
        unitPrice: 100.50,
        subtotal: 1005.00,
      };

      const result = InvoiceItemSchema.parse(item);
      expect(result).toEqual(item);
    });

    it('debería rechazar item con cantidad negativa', () => {
      const item = {
        description: 'Producto',
        quantity: -5,
        unitPrice: 100,
        subtotal: -500,
      };

      expect(() => InvoiceItemSchema.parse(item)).toThrow();
    });

    it('debería rechazar item con precio unitario negativo', () => {
      const item = {
        description: 'Producto',
        quantity: 5,
        unitPrice: -100,
        subtotal: 500,
      };

      expect(() => InvoiceItemSchema.parse(item)).toThrow();
    });

    it('debería aceptar precio unitario en cero', () => {
      const item = {
        description: 'Item gratuito',
        quantity: 1,
        unitPrice: 0,
        subtotal: 0,
      };

      const result = InvoiceItemSchema.parse(item);
      expect(result.unitPrice).toBe(0);
    });

    it('debería rechazar item sin descripción', () => {
      const item = {
        description: '',
        quantity: 1,
        unitPrice: 100,
        subtotal: 100,
      };

      expect(() => InvoiceItemSchema.parse(item)).toThrow();
    });
  });

  describe('TaxesSchema', () => {
    it('debería validar impuestos completos', () => {
      const taxes = {
        iva: 210.50,
        otherTaxes: 50.00,
      };

      const result = TaxesSchema.parse(taxes);
      expect(result).toEqual(taxes);
    });

    it('debería usar defaults para campos no provistos', () => {
      const taxes = {};

      const result = TaxesSchema.parse(taxes);
      expect(result.iva).toBe(0);
      expect(result.otherTaxes).toBe(0);
    });

    it('debería rechazar IVA negativo', () => {
      const taxes = {
        iva: -100,
        otherTaxes: 0,
      };

      expect(() => TaxesSchema.parse(taxes)).toThrow();
    });

    it('debería aceptar valores en cero', () => {
      const taxes = {
        iva: 0,
        otherTaxes: 0,
      };

      const result = TaxesSchema.parse(taxes);
      expect(result.iva).toBe(0);
    });
  });

  describe('MetadataSchema', () => {
    it('debería validar metadata completa', () => {
      const metadata = {
        processedAt: '2025-11-03T10:00:00Z',
        processingTimeMs: 5000,
        confidence: 'high' as const,
        model: 'gpt-4o-mini',
      };

      const result = MetadataSchema.parse(metadata);
      expect(result).toEqual(metadata);
    });

    it('debería usar default para confidence', () => {
      const metadata = {
        processedAt: '2025-11-03T10:00:00Z',
        processingTimeMs: 5000,
      };

      const result = MetadataSchema.parse(metadata);
      expect(result.confidence).toBe('medium');
    });

    it('debería rechazar formato de fecha inválido', () => {
      const metadata = {
        processedAt: 'not-a-date',
        processingTimeMs: 5000,
      };

      expect(() => MetadataSchema.parse(metadata)).toThrow();
    });

    it('debería rechazar tiempo de procesamiento negativo', () => {
      const metadata = {
        processedAt: '2025-11-03T10:00:00Z',
        processingTimeMs: -100,
      };

      expect(() => MetadataSchema.parse(metadata)).toThrow();
    });

    it('debería rechazar confidence inválida', () => {
      const metadata = {
        processedAt: '2025-11-03T10:00:00Z',
        processingTimeMs: 5000,
        confidence: 'invalid',
      };

      expect(() => MetadataSchema.parse(metadata)).toThrow();
    });
  });

  describe('InvoiceSchema', () => {
    const validInvoice = {
      invoiceNumber: '001-00001234',
      date: '2025-11-03',
      operationType: 'Transferencia',
      vendor: {
        name: 'Proveedor Test SA',
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
        otherTaxes: 0,
      },
      paymentMethod: 'Transferencia bancaria',
      metadata: {
        processedAt: '2025-11-03T10:00:00Z',
        processingTimeMs: 6420,
        confidence: 'high' as const,
        model: 'gpt-4o-mini',
      },
    };

    it('debería validar una factura completa', () => {
      const result = InvoiceSchema.parse(validInvoice);
      expect(result.invoiceNumber).toBe('001-00001234');
      expect(result.totalAmount).toBe(15750.00);
      expect(result.items.length).toBe(1);
    });

    it('debería usar default ARS para currency', () => {
      const invoice = {
        ...validInvoice,
        currency: undefined,
      };
      delete (invoice as any).currency;

      const result = InvoiceSchema.parse(invoice);
      expect(result.currency).toBe('ARS');
    });

    it('debería validar factura con campos opcionales omitidos', () => {
      const minimalInvoice = {
        invoiceNumber: '001-00001234',
        date: '2025-11-03',
        vendor: {
          name: 'Proveedor Mínimo',
        },
        totalAmount: 1000,
        currency: 'ARS',
        items: [
          {
            description: 'Item',
            quantity: 1,
            unitPrice: 1000,
            subtotal: 1000,
          },
        ],
        metadata: {
          processedAt: '2025-11-03T10:00:00Z',
          processingTimeMs: 1000,
        },
      };

      const result = InvoiceSchema.parse(minimalInvoice);
      expect(result.invoiceNumber).toBe('001-00001234');
      expect(result.operationType).toBeUndefined();
      expect(result.receiverBank).toBeUndefined();
    });

    it('debería rechazar fecha con formato incorrecto', () => {
      const invoice = {
        ...validInvoice,
        date: '03/11/2025', // formato DD/MM/YYYY en lugar de YYYY-MM-DD
      };

      expect(() => InvoiceSchema.parse(invoice)).toThrow();
    });

    it('debería rechazar monto total negativo o cero', () => {
      const invoice = {
        ...validInvoice,
        totalAmount: 0,
      };

      expect(() => InvoiceSchema.parse(invoice)).toThrow();
    });

    it('debería rechazar currency con longitud incorrecta', () => {
      const invoice = {
        ...validInvoice,
        currency: 'ARSS', // 4 caracteres en lugar de 3
      };

      expect(() => InvoiceSchema.parse(invoice)).toThrow();
    });

    it('debería rechazar factura sin items', () => {
      const invoice = {
        ...validInvoice,
        items: [],
      };

      expect(() => InvoiceSchema.parse(invoice)).toThrow();
    });

    it('debería validar múltiples items', () => {
      const invoice = {
        ...validInvoice,
        items: [
          {
            description: 'Item 1',
            quantity: 2,
            unitPrice: 100,
            subtotal: 200,
          },
          {
            description: 'Item 2',
            quantity: 3,
            unitPrice: 50,
            subtotal: 150,
          },
        ],
      };

      const result = InvoiceSchema.parse(invoice);
      expect(result.items.length).toBe(2);
    });
  });

  describe('ProcessingResultSchema', () => {
    it('debería validar resultado exitoso con invoice', () => {
      const result = {
        success: true,
        invoice: {
          invoiceNumber: '001-00001234',
          date: '2025-11-03',
          vendor: {
            name: 'Test',
          },
          totalAmount: 1000,
          currency: 'ARS',
          items: [
            {
              description: 'Item',
              quantity: 1,
              unitPrice: 1000,
              subtotal: 1000,
            },
          ],
          metadata: {
            processedAt: '2025-11-03T10:00:00Z',
            processingTimeMs: 1000,
          },
        },
        userId: 12345,
        messageId: 67890,
      };

      const parsed = ProcessingResultSchema.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.invoice).toBeDefined();
    });

    it('debería validar resultado fallido con error', () => {
      const result = {
        success: false,
        error: 'No se pudo procesar la imagen',
        userId: 12345,
        messageId: 67890,
      };

      const parsed = ProcessingResultSchema.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('No se pudo procesar la imagen');
      expect(parsed.invoice).toBeUndefined();
    });

    it('debería rechazar resultado sin userId', () => {
      const result = {
        success: true,
        messageId: 67890,
      };

      expect(() => ProcessingResultSchema.parse(result)).toThrow();
    });
  });

  describe('Type Safety', () => {
    it('debería inferir tipos correctamente', () => {
      const invoice: Invoice = {
        invoiceNumber: '001-00001234',
        date: '2025-11-03',
        vendor: {
          name: 'Test Vendor',
        },
        totalAmount: 1000,
        currency: 'ARS',
        items: [
          {
            description: 'Test Item',
            quantity: 1,
            unitPrice: 1000,
            subtotal: 1000,
          },
        ],
        metadata: {
          processedAt: '2025-11-03T10:00:00Z',
          processingTimeMs: 1000,
        },
      };

      // Verificar que el tipo se infiere correctamente
      expect(invoice.invoiceNumber).toBeTypeOf('string');
      expect(invoice.totalAmount).toBeTypeOf('number');
      expect(invoice.vendor.name).toBeTypeOf('string');
    });
  });
});

