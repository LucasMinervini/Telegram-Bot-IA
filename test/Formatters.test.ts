/**
 * Tests para Formatters (Presentation Layer)
 * Tests unitarios de formateo de datos
 */

import { describe, it, expect } from 'vitest';
import { InvoiceFormatter } from '../src/presentation/formatters/InvoiceFormatter';
import { MessageFormatter } from '../src/presentation/formatters/MessageFormatter';
import { Invoice } from '../src/domain/entities/Invoice.entity';

describe('InvoiceFormatter (Unit Tests)', () => {
  const createTestInvoice = (overrides: any = {}): Invoice => {
    return Invoice.create({
      invoiceNumber: '001-00001234',
      date: '2025-11-03',
      operationType: 'Transferencia',
      vendor: {
        name: 'Empresa Test SA',
        taxId: '30-12345678-9',
        cvu: '0000003100010123456789',
      },
      totalAmount: 15750.50,
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
  };

  describe('toCompactSummary()', () => {
    it('debería formatear resumen compacto', () => {
      const invoice = createTestInvoice();
      const formatted = InvoiceFormatter.toCompactSummary(invoice);

      expect(formatted).toContain('📄 Fecha:');
      expect(formatted).toContain('03/11/2025');
      expect(formatted).toContain('💰 Monto Bruto:');
    });

    it('debería incluir operationType si está presente', () => {
      const invoice = createTestInvoice();
      const formatted = InvoiceFormatter.toCompactSummary(invoice);

      expect(formatted).toContain('Tipo de Operación:');
      expect(formatted).toContain('Transferencia');
    });

    it('debería incluir CUIT si está presente', () => {
      const invoice = createTestInvoice();
      const formatted = InvoiceFormatter.toCompactSummary(invoice);

      expect(formatted).toContain('CUIT:');
      expect(formatted).toContain('30-12345678-9');
    });

    it('debería incluir banco si está presente', () => {
      const invoice = createTestInvoice();
      const formatted = InvoiceFormatter.toCompactSummary(invoice);

      expect(formatted).toContain('Banco Receptor:');
      expect(formatted).toContain('Banco Test');
    });
  });

  describe('toDetailedSummary()', () => {
    it('debería formatear resumen detallado', () => {
      const invoice = createTestInvoice();
      const formatted = InvoiceFormatter.toDetailedSummary(invoice);

      expect(formatted).toContain('📄 **Factura Procesada**');
      expect(formatted).toContain('001-00001234');
      expect(formatted).toContain('03/11/2025');
      expect(formatted).toContain('Empresa Test SA');
    });

    it('debería incluir CVU si está presente', () => {
      const invoice = createTestInvoice();
      const formatted = InvoiceFormatter.toDetailedSummary(invoice);

      expect(formatted).toContain('CVU:');
      expect(formatted).toContain('0000003100010123456789');
    });

    it('debería incluir items de la factura', () => {
      const invoice = createTestInvoice();
      const formatted = InvoiceFormatter.toDetailedSummary(invoice);

      expect(formatted).toContain('**Items:**');
      expect(formatted).toContain('Servicio de consultoría');
      expect(formatted).toContain('10x');
    });

    it('debería incluir indicador de confianza', () => {
      const invoice = createTestInvoice();
      const formatted = InvoiceFormatter.toDetailedSummary(invoice);

      expect(formatted).toContain('**Confianza:**');
      expect(formatted).toContain('Alta');
    });

    it('debería manejar factura sin CVU ni CUIT', () => {
      const invoice = createTestInvoice({
        vendor: { name: 'Empresa Simple' },
      });
      const formatted = InvoiceFormatter.toDetailedSummary(invoice);

      expect(formatted).not.toContain('CVU:');
      expect(formatted).not.toContain('CUIT:');
      expect(formatted).toContain('Empresa Simple');
    });
  });

  describe('formatSessionSummary()', () => {
    it('debería formatear resumen de sesión', () => {
      const vendorSummary = new Map<string, number>();
      vendorSummary.set('Vendor A', 1000);
      vendorSummary.set('Vendor B', 2000);

      const formatted = InvoiceFormatter.formatSessionSummary(
        5,
        15750.50,
        ['ARS', 'USD'],
        vendorSummary
      );

      expect(formatted).toContain('📊 **Resumen de Facturas**');
      expect(formatted).toContain('Total de facturas: 5');
      expect(formatted).toContain('15.750,50');
      expect(formatted).toContain('ARS');
    });

    it('debería incluir desglose por vendor', () => {
      const vendorSummary = new Map<string, number>();
      vendorSummary.set('Vendor A', 1000);

      const formatted = InvoiceFormatter.formatSessionSummary(
        1,
        1000,
        ['ARS'],
        vendorSummary
      );

      expect(formatted).toContain('Desglose por Banco/Proveedor:');
      expect(formatted).toContain('Vendor A');
    });

    it('debería incluir tip sobre Excel', () => {
      const formatted = InvoiceFormatter.formatSessionSummary(
        1,
        1000,
        ['ARS'],
        new Map()
      );

      expect(formatted).toContain('Descargar Excel');
    });
  });
});

describe('MessageFormatter (Unit Tests)', () => {
  describe('welcomeMessage()', () => {
    it('debería incluir mensaje de bienvenida', () => {
      const formatted = MessageFormatter.welcomeMessage();
      expect(formatted).toBeTruthy();
      expect(formatted).toContain('Bienvenido');
    });

    it('debería incluir información sobre comandos', () => {
      const formatted = MessageFormatter.welcomeMessage();
      expect(formatted).toContain('/help');
      expect(formatted).toContain('/facturas');
    });
  });

  describe('helpMessage()', () => {
    it('debería incluir lista de comandos', () => {
      const formatted = MessageFormatter.helpMessage();
      expect(formatted).toBeTruthy();
      expect(formatted).toContain('Ayuda');
    });

    it('debería incluir comando /help', () => {
      const formatted = MessageFormatter.helpMessage();
      expect(formatted.toLowerCase()).toContain('help');
    });

    it('debería incluir formatos soportados', () => {
      const formatted = MessageFormatter.helpMessage();
      expect(formatted).toContain('JPG');
      expect(formatted).toContain('PDF');
    });
  });

  describe('formatError()', () => {
    it('debería incluir emoji de error', () => {
      const formatted = MessageFormatter.formatError('Error message');
      expect(formatted).toContain('❌');
    });

    it('debería incluir el mensaje de error', () => {
      const formatted = MessageFormatter.formatError('Error message');
      expect(formatted).toContain('Error message');
    });

    it('debería incluir sugerencias', () => {
      const formatted = MessageFormatter.formatError('Error message');
      expect(formatted).toContain('Sugerencias');
    });
  });

  describe('processingMessage()', () => {
    it('debería incluir emoji de procesamiento', () => {
      const formatted = MessageFormatter.processingMessage();
      expect(formatted).toContain('⏳');
    });

    it('debería indicar que está procesando', () => {
      const formatted = MessageFormatter.processingMessage();
      expect(formatted.toLowerCase()).toContain('proces');
    });
  });

  describe('generatingExcelMessage()', () => {
    it('debería incluir emoji de procesamiento', () => {
      const formatted = MessageFormatter.generatingExcelMessage();
      expect(formatted).toContain('⏳');
    });

    it('debería indicar generación de Excel', () => {
      const formatted = MessageFormatter.generatingExcelMessage();
      expect(formatted).toContain('Excel');
    });
  });

  describe('noInvoicesMessage()', () => {
    it('debería indicar que no hay facturas', () => {
      const formatted = MessageFormatter.noInvoicesMessage();
      expect(formatted).toBeTruthy();
      expect(formatted.length).toBeGreaterThan(0);
    });

    it('debería incluir emoji apropiado', () => {
      const formatted = MessageFormatter.noInvoicesMessage();
      expect(formatted).toContain('📭');
    });
  });

  describe('sessionClearedMessage()', () => {
    it('debería confirmar limpieza de sesión', () => {
      const formatted = MessageFormatter.sessionClearedMessage(5);
      expect(formatted).toContain('5');
    });

    it('debería incluir emoji de limpieza', () => {
      const formatted = MessageFormatter.sessionClearedMessage(3);
      expect(formatted).toContain('🗑️');
    });

    it('debería manejar una factura singular', () => {
      const formatted = MessageFormatter.sessionClearedMessage(1);
      expect(formatted).toContain('1');
    });
  });

  describe('excelSentMessage()', () => {
    it('debería confirmar envío de Excel', () => {
      const formatted = MessageFormatter.excelSentMessage(5);
      expect(formatted).toContain('📊');
      expect(formatted).toContain('5');
    });

    it('debería indicar que las facturas siguen en sesión', () => {
      const formatted = MessageFormatter.excelSentMessage(3);
      expect(formatted).toContain('/limpiar');
    });
  });

  describe('storageStatsMessage()', () => {
    it('debería formatear estadísticas', () => {
      const formatted = MessageFormatter.storageStatsMessage(10, 5.5, 24);
      expect(formatted).toContain('10');
      expect(formatted).toContain('5.50');
      expect(formatted).toContain('24');
    });

    it('debería incluir emoji de estadísticas', () => {
      const formatted = MessageFormatter.storageStatsMessage(0, 0, 0);
      expect(formatted).toContain('📊');
    });
  });

  describe('controlPanelMessage()', () => {
    it('debería formatear panel de control', () => {
      const formatted = MessageFormatter.controlPanelMessage(5);
      expect(formatted).toContain('📊');
      expect(formatted).toContain('5');
    });

    it('debería incluir tip sobre Excel', () => {
      const formatted = MessageFormatter.controlPanelMessage(3);
      expect(formatted).toContain('Excel');
    });
  });
});

