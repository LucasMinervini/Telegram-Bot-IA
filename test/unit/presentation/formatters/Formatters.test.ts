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

      expect(formatted).toContain('**Comprobante Procesado**');
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

      expect(formatted).toContain('**Resumen de Comprobantes**');
      expect(formatted).toContain('Total de comprobantes: 5');
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
      expect(formatted).toContain('/comprobantes');
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
      expect(formatted).toContain('No tienes comprobantes acumulados');
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

  describe('providerUnavailableMessage()', () => {
    it('does not mention partial results when nothing was processed', () => {
      const formatted = MessageFormatter.providerUnavailableMessage();
      expect(formatted).toContain('IA no est');
      expect(formatted).not.toContain('Se alcanzaron');
    });

    it('mentions how many documents were kept when some were processed', () => {
      const formatted = MessageFormatter.providerUnavailableMessage(4);
      expect(formatted).toContain('Se alcanzaron a procesar 4');
    });
  });

  describe('escapeMarkdown()', () => {
    it('escapes Telegram legacy Markdown control characters', () => {
      expect(MessageFormatter.escapeMarkdown('a_b*c`d[e')).toBe('a\\_b\\*c\\`d\\[e');
    });

    it('leaves plain text untouched', () => {
      expect(MessageFormatter.escapeMarkdown('plain text')).toBe('plain text');
    });
  });

  describe('archiveProgressMessage()', () => {
    it('shows processed and total counts', () => {
      expect(MessageFormatter.archiveProgressMessage(2, 5)).toContain('2/5');
    });
  });

  describe('archiveTooLargeMessage()', () => {
    it('shows max size and actual size with two decimals', () => {
      const formatted = MessageFormatter.archiveTooLargeMessage(20, 25.456);
      expect(formatted).toContain('20 MB');
      expect(formatted).toContain('25.46 MB');
    });
  });

  describe('archiveResultMessages()', () => {
    const invoice = Invoice.create({
      invoiceNumber: 'A-1',
      date: '2025-11-03',
      vendor: { name: 'Vendor_SA', taxId: '30-12345678-9' },
      totalAmount: 1500,
      currency: 'ARS',
      items: [{ description: 'Item', quantity: 1, unitPrice: 1500, subtotal: 1500 }],
    });

    const buildResponse = (overrides: any = {}) => ({
      success: true,
      items: [
        { fileName: 'ok_1.jpg', success: true, invoice },
        { fileName: 'bad.pdf', success: false, error: 'Unreadable' },
      ],
      skipped: [],
      processedCount: 1,
      failedCount: 1,
      totalInvoices: 1,
      ...overrides,
    });

    it('builds a single message with header, successes and failures', () => {
      const messages = MessageFormatter.archiveResultMessages('batch_1.zip', buildResponse());

      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain('batch\\_1.zip');
      expect(messages[0]).toContain('Procesados: 1/2');
      expect(messages[0]).toContain('Con error: 1');
      expect(messages[0]).toContain('1. ✅ ok\\_1.jpg');
      expect(messages[0]).toContain('Vendor\\_SA');
      expect(messages[0]).toContain('2. ❌ bad.pdf');
      expect(messages[0]).toContain('Unreadable');
    });

    it('omits failure and skipped lines when there are none', () => {
      const messages = MessageFormatter.archiveResultMessages(
        'all.zip',
        buildResponse({ items: [{ fileName: 'ok.jpg', success: true, invoice }], failedCount: 0 })
      );

      expect(messages[0]).not.toContain('Con error');
      expect(messages[0]).not.toContain('Omitidos');
    });

    it('lists skipped entries with their reason', () => {
      const messages = MessageFormatter.archiveResultMessages(
        'mixed.zip',
        buildResponse({ skipped: [{ originalName: 'notes.txt', reason: 'Unsupported format' }] })
      );

      expect(messages[0]).toContain('Omitidos: 1');
      expect(messages[0]).toContain('notes.txt — Unsupported format');
    });

    it('uses a default and truncates long error messages', () => {
      const longError = 'x'.repeat(200);
      const messages = MessageFormatter.archiveResultMessages(
        'errors.zip',
        buildResponse({
          items: [
            { fileName: 'a.jpg', success: false },
            { fileName: 'b.jpg', success: false, error: longError },
          ],
          processedCount: 0,
          failedCount: 2,
        })
      );

      expect(messages[0]).toContain('Error desconocido');
      expect(messages[0]).toContain(`${'x'.repeat(119)}…`);
      expect(messages[0]).not.toContain('x'.repeat(120));
    });

    it('splits long summaries into chunks under the Telegram limit', () => {
      const items = Array.from({ length: 120 }, (_, i) => ({
        fileName: `receipt-with-a-long-file-name-number-${i}.jpg`,
        success: false,
        error: 'Could not read the document because the image is blurry',
      }));

      const messages = MessageFormatter.archiveResultMessages(
        'big.zip',
        buildResponse({ items, processedCount: 0, failedCount: items.length })
      );

      expect(messages.length).toBeGreaterThan(1);
      messages.forEach((message) => expect(message.length).toBeLessThanOrEqual(3800));
      expect(messages.join('\n')).toContain('number-119.jpg');
    });
  });
});

