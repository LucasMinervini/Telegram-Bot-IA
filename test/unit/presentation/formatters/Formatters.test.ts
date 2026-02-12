/**
 * Tests para Formatters (Presentation Layer)
 * Tests unitarios de formateo de datos
 */

import { describe, it, expect } from 'vitest';
import { InvoiceFormatter } from '@/presentation/formatters/InvoiceFormatter';
import { MessageFormatter } from '@/presentation/formatters/MessageFormatter';
import { Invoice } from '@/domain/entities/Invoice.entity';

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
          description: 'Servicio de consultorÃƒÂ­a',
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
    it('deberÃƒÂ­a formatear resumen compacto', () => {
      const invoice = createTestInvoice();
      const formatted = InvoiceFormatter.toCompactSummary(invoice);

      expect(formatted).toContain('Fecha:');
      expect(formatted).toContain('03/11/2025');
      expect(formatted).toContain('Monto Bruto:');
    });

    it('deberÃƒÂ­a incluir operationType si estÃƒÂ¡ presente', () => {
      const invoice = createTestInvoice();
      const formatted = InvoiceFormatter.toCompactSummary(invoice);

      expect(formatted).toContain('Tipo de Oper');
      expect(formatted).toContain('Transferencia');
    });

    it('deberÃƒÂ­a incluir CUIT si estÃƒÂ¡ presente', () => {
      const invoice = createTestInvoice();
      const formatted = InvoiceFormatter.toCompactSummary(invoice);

      expect(formatted).toContain('CUIT:');
      expect(formatted).toContain('30-12345678-9');
    });

    it('deberÃƒÂ­a incluir banco si estÃƒÂ¡ presente', () => {
      const invoice = createTestInvoice();
      const formatted = InvoiceFormatter.toCompactSummary(invoice);

      expect(formatted).toContain('Banco Receptor:');
      expect(formatted).toContain('Banco Test');
    });
  });

  describe('toDetailedSummary()', () => {
    it('deberÃƒÂ­a formatear resumen detallado', () => {
      const invoice = createTestInvoice();
      const formatted = InvoiceFormatter.toDetailedSummary(invoice);

      expect(formatted).toContain('**Factura Procesada**');
      expect(formatted).toContain('001-00001234');
      expect(formatted).toContain('03/11/2025');
      expect(formatted).toContain('Empresa Test SA');
    });

    it('deberÃƒÂ­a incluir CVU si estÃƒÂ¡ presente', () => {
      const invoice = createTestInvoice();
      const formatted = InvoiceFormatter.toDetailedSummary(invoice);

      expect(formatted).toContain('CVU:');
      expect(formatted).toContain('0000003100010123456789');
    });

    it('deberÃƒÂ­a incluir items de la factura', () => {
      const invoice = createTestInvoice();
      const formatted = InvoiceFormatter.toDetailedSummary(invoice);

      expect(formatted).toContain('**Items:**');
      expect(formatted).toContain('Servicio de consultorÃƒÂ­a');
      expect(formatted).toContain('10x');
    });

    it('deberÃƒÂ­a incluir indicador de confianza', () => {
      const invoice = createTestInvoice();
      const formatted = InvoiceFormatter.toDetailedSummary(invoice);

      expect(formatted).toContain('**Confianza:**');
      expect(formatted).toContain('Alta');
    });

    it('deberÃƒÂ­a manejar factura sin CVU ni CUIT', () => {
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
    it('deberÃƒÂ­a formatear resumen de sesiÃƒÂ³n', () => {
      const vendorSummary = new Map<string, number>();
      vendorSummary.set('Vendor A', 1000);
      vendorSummary.set('Vendor B', 2000);

      const formatted = InvoiceFormatter.formatSessionSummary(
        5,
        15750.50,
        ['ARS', 'USD'],
        vendorSummary
      );

      expect(formatted).toContain('**Resumen de Facturas**');
      expect(formatted).toContain('Total de facturas: 5');
      expect(formatted).toContain('15.750,50');
      expect(formatted).toContain('ARS');
    });

    it('deberÃƒÂ­a incluir desglose por vendor', () => {
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

    it('deberÃƒÂ­a incluir tip sobre Excel', () => {
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
    it('deberÃƒÂ­a incluir mensaje de bienvenida', () => {
      const formatted = MessageFormatter.welcomeMessage();
      expect(formatted).toBeTruthy();
      expect(formatted).toContain('Bienvenido');
    });

    it('deberÃƒÂ­a incluir informaciÃƒÂ³n sobre comandos', () => {
      const formatted = MessageFormatter.welcomeMessage();
      expect(formatted).toContain('/help');
      expect(formatted).toContain('/facturas');
    });
  });

  describe('helpMessage()', () => {
    it('deberÃƒÂ­a incluir lista de comandos', () => {
      const formatted = MessageFormatter.helpMessage();
      expect(formatted).toBeTruthy();
      expect(formatted).toContain('Ayuda');
    });

    it('deberÃƒÂ­a incluir comando /help', () => {
      const formatted = MessageFormatter.helpMessage();
      expect(formatted.toLowerCase()).toContain('help');
    });

    it('deberÃƒÂ­a incluir formatos soportados', () => {
      const formatted = MessageFormatter.helpMessage();
      expect(formatted).toContain('JPG');
      expect(formatted).toContain('PDF');
    });
  });

  describe('formatError()', () => {
    it('deberÃƒÂ­a incluir emoji de error', () => {
      const formatted = MessageFormatter.formatError('Error message');
      expect(formatted).toContain('Error al procesar');
    });

    it('deberÃƒÂ­a incluir el mensaje de error', () => {
      const formatted = MessageFormatter.formatError('Error message');
      expect(formatted).toContain('Error message');
    });

    it('deberÃƒÂ­a incluir sugerencias', () => {
      const formatted = MessageFormatter.formatError('Error message');
      expect(formatted).toContain('Sugerencias');
    });
  });

  describe('processingMessage()', () => {
    it('deberÃƒÂ­a incluir emoji de procesamiento', () => {
      const formatted = MessageFormatter.processingMessage();
      expect(formatted).toContain('Procesando comprobante');
    });

    it('deberÃƒÂ­a indicar que estÃƒÂ¡ procesando', () => {
      const formatted = MessageFormatter.processingMessage();
      expect(formatted.toLowerCase()).toContain('proces');
    });
  });

  describe('generatingExcelMessage()', () => {
    it('deberÃƒÂ­a incluir emoji de procesamiento', () => {
      const formatted = MessageFormatter.generatingExcelMessage();
      expect(formatted).toContain('Generando archivo Excel');
    });

    it('deberÃƒÂ­a indicar generaciÃƒÂ³n de Excel', () => {
      const formatted = MessageFormatter.generatingExcelMessage();
      expect(formatted).toContain('Excel');
    });
  });

  describe('noInvoicesMessage()', () => {
    it('deberÃƒÂ­a indicar que no hay facturas', () => {
      const formatted = MessageFormatter.noInvoicesMessage();
      expect(formatted).toBeTruthy();
      expect(formatted.length).toBeGreaterThan(0);
    });

    it('deberÃƒÂ­a incluir emoji apropiado', () => {
      const formatted = MessageFormatter.noInvoicesMessage();
      expect(formatted).toContain('No tienes facturas acumuladas');
    });
  });

  describe('sessionClearedMessage()', () => {
    it('deberÃƒÂ­a confirmar limpieza de sesiÃƒÂ³n', () => {
      const formatted = MessageFormatter.sessionClearedMessage(5);
      expect(formatted).toContain('5');
    });

    it('deberÃƒÂ­a incluir emoji de limpieza', () => {
      const formatted = MessageFormatter.sessionClearedMessage(3);
      expect(formatted).toContain('Sesi');
    });

    it('deberÃƒÂ­a manejar una factura singular', () => {
      const formatted = MessageFormatter.sessionClearedMessage(1);
      expect(formatted).toContain('1');
    });
  });

  describe('excelSentMessage()', () => {
    it('deberÃƒÂ­a confirmar envÃƒÂ­o de Excel', () => {
      const formatted = MessageFormatter.excelSentMessage(5);
      expect(formatted).toContain('Excel con');
      expect(formatted).toContain('5');
    });

    it('deberÃƒÂ­a indicar que las facturas siguen en sesiÃƒÂ³n', () => {
      const formatted = MessageFormatter.excelSentMessage(3);
      expect(formatted).toContain('/limpiar');
    });
  });

  describe('storageStatsMessage()', () => {
    it('deberÃƒÂ­a formatear estadÃƒÂ­sticas', () => {
      const formatted = MessageFormatter.storageStatsMessage(10, 5.5, 24);
      expect(formatted).toContain('10');
      expect(formatted).toContain('5.50');
      expect(formatted).toContain('24');
    });

    it('deberÃƒÂ­a incluir emoji de estadÃƒÂ­sticas', () => {
      const formatted = MessageFormatter.storageStatsMessage(0, 0, 0);
      expect(formatted).toContain('Estad');
    });
  });

  describe('controlPanelMessage()', () => {
    it('deberÃƒÂ­a formatear panel de control', () => {
      const formatted = MessageFormatter.controlPanelMessage(5);
      expect(formatted).toContain('Panel de Control');
      expect(formatted).toContain('5');
    });

    it('deberÃƒÂ­a incluir tip sobre Excel', () => {
      const formatted = MessageFormatter.controlPanelMessage(3);
      expect(formatted).toContain('Excel');
    });
  });
});

