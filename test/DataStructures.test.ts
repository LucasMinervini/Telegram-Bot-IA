/**
 * Test suite para DataStructures.ts
 * Valida formateo de facturas, mensajes y logging
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InvoiceResponse, ProcessingResultFormatter, Logger } from '../src/modules/DataStructures';
import type { Invoice, ProcessingResult } from '../src/modules/Interfaces';

describe('DataStructures', () => {
  // Helper para crear factura de prueba
  const createMockInvoice = (overrides?: Partial<Invoice>): Invoice => ({
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
    metadata: {
      processedAt: '2025-11-03T10:00:00Z',
      processingTimeMs: 6420,
      confidence: 'high',
      model: 'gpt-4o-mini',
    },
    ...overrides,
  });

  describe('InvoiceResponse', () => {
    describe('toReadableSummary', () => {
      it('debería generar resumen completo con todos los campos', () => {
        const invoice = createMockInvoice();
        const response = new InvoiceResponse(invoice);
        const summary = response.toReadableSummary();

        expect(summary).toContain('✅');
        expect(summary).toContain('Comprobante procesado exitosamente');
        expect(summary).toContain('Fecha:');
        expect(summary).toContain('Transferencia');
        expect(summary).toContain('CVU: 0000003100010123456789');
        expect(summary).toContain('Monto bruto:');
        expect(summary).toContain('Banco Test');
      });

      it('debería priorizar CVU sobre CUIT', () => {
        const invoice = createMockInvoice({
          vendor: {
            name: 'Test',
            taxId: '30-12345678-9',
            cvu: '0000003100010123456789',
          },
        });
        const response = new InvoiceResponse(invoice);
        const summary = response.toReadableSummary();

        expect(summary).toContain('CVU: 0000003100010123456789');
        expect(summary).not.toContain('CUIT/CUIL:');
      });

      it('debería usar CUIT si no hay CVU', () => {
        const invoice = createMockInvoice({
          vendor: {
            name: 'Test',
            taxId: '30-12345678-9',
          },
        });
        const response = new InvoiceResponse(invoice);
        const summary = response.toReadableSummary();

        expect(summary).toContain('CUIT/CUIL: 30-12345678-9');
        expect(summary).not.toContain('CVU:');
      });

      it('debería usar nombre si no hay CVU ni CUIT', () => {
        const invoice = createMockInvoice({
          vendor: {
            name: 'Empresa Sin Identificación',
          },
        });
        const response = new InvoiceResponse(invoice);
        const summary = response.toReadableSummary();

        expect(summary).toContain('Titular: Empresa Sin Identificación');
      });

      it('no debería incluir tipo de operación si no está presente', () => {
        const invoice = createMockInvoice({
          operationType: undefined,
        });
        const response = new InvoiceResponse(invoice);
        const summary = response.toReadableSummary();

        expect(summary).not.toContain('Tipo de operación:');
      });

      it('no debería incluir banco receptor si no está presente', () => {
        const invoice = createMockInvoice({
          receiverBank: undefined,
        });
        const response = new InvoiceResponse(invoice);
        const summary = response.toReadableSummary();

        expect(summary).not.toContain('Banco receptor:');
      });

      it('debería formatear moneda correctamente para ARS', () => {
        const invoice = createMockInvoice({
          totalAmount: 1234.56,
          currency: 'ARS',
        });
        const response = new InvoiceResponse(invoice);
        const summary = response.toReadableSummary();

        expect(summary).toContain('$1.234,56');
      });

      it('debería formatear moneda correctamente para USD', () => {
        const invoice = createMockInvoice({
          totalAmount: 1234.56,
          currency: 'USD',
        });
        const response = new InvoiceResponse(invoice);
        const summary = response.toReadableSummary();

        expect(summary).toContain('USD $1.234,56');
      });
    });

    describe('toCompactSummary', () => {
      it('debería generar resumen de una línea', () => {
        const invoice = createMockInvoice();
        const response = new InvoiceResponse(invoice);
        const summary = response.toCompactSummary();

        expect(summary).toContain('|');
        expect(summary.split('|')).toHaveLength(3);
      });

      it('debería usar CVU truncado si está disponible', () => {
        const invoice = createMockInvoice({
          vendor: {
            name: 'Test',
            cvu: '0000003100010123456789',
          },
        });
        const response = new InvoiceResponse(invoice);
        const summary = response.toCompactSummary();

        expect(summary).toContain('0000003100...');
      });

      it('debería usar CUIT si no hay CVU', () => {
        const invoice = createMockInvoice({
          vendor: {
            name: 'Test',
            taxId: '30-12345678-9',
          },
        });
        const response = new InvoiceResponse(invoice);
        const summary = response.toCompactSummary();

        expect(summary).toContain('30-12345678-9');
      });

      it('debería truncar nombre si no hay CVU ni CUIT', () => {
        const invoice = createMockInvoice({
          vendor: {
            name: 'Nombre Muy Largo Que Debe Ser Truncado',
          },
        });
        const response = new InvoiceResponse(invoice);
        const summary = response.toCompactSummary();

        expect(summary).toContain('Nombre Muy Largo Que');
        expect(summary).not.toContain('Debe Ser Truncado');
      });
    });

    describe('toPrettyJSON', () => {
      it('debería generar JSON formateado', () => {
        const invoice = createMockInvoice();
        const response = new InvoiceResponse(invoice);
        const json = response.toPrettyJSON();

        expect(json).toContain('\n');
        expect(json).toContain('  ');
        expect(() => JSON.parse(json)).not.toThrow();

        const parsed = JSON.parse(json);
        expect(parsed.invoiceNumber).toBe('001-00001234');
      });
    });

    describe('toMinifiedJSON', () => {
      it('debería generar JSON sin espacios', () => {
        const invoice = createMockInvoice();
        const response = new InvoiceResponse(invoice);
        const json = response.toMinifiedJSON();

        expect(json).not.toContain('\n');
        expect(() => JSON.parse(json)).not.toThrow();

        const parsed = JSON.parse(json);
        expect(parsed.invoiceNumber).toBe('001-00001234');
      });

      it('debería ser más corto que pretty JSON', () => {
        const invoice = createMockInvoice();
        const response = new InvoiceResponse(invoice);

        const pretty = response.toPrettyJSON();
        const minified = response.toMinifiedJSON();

        expect(minified.length).toBeLessThan(pretty.length);
      });
    });

    describe('getInvoice', () => {
      it('debería retornar la factura original', () => {
        const invoice = createMockInvoice();
        const response = new InvoiceResponse(invoice);

        const retrieved = response.getInvoice();

        expect(retrieved).toEqual(invoice);
        expect(retrieved.invoiceNumber).toBe('001-00001234');
      });
    });

    describe('Formateo de monedas', () => {
      const currencies = [
        { code: 'ARS', symbol: '$' },
        { code: 'USD', symbol: 'USD $' },
        { code: 'EUR', symbol: '€' },
        { code: 'BRL', symbol: 'R$' },
        { code: 'CLP', symbol: '$' },
        { code: 'MXN', symbol: '$' },
        { code: 'COP', symbol: '$' },
      ];

      currencies.forEach(({ code, symbol }) => {
        it(`debería formatear ${code} correctamente`, () => {
          const invoice = createMockInvoice({
            totalAmount: 1000,
            currency: code,
          });
          const response = new InvoiceResponse(invoice);
          const summary = response.toReadableSummary();

          expect(summary).toContain(`${symbol}1.000,00`);
        });
      });

      it('debería usar código de moneda para monedas desconocidas', () => {
        const invoice = createMockInvoice({
          totalAmount: 1000,
          currency: 'XYZ',
        });
        const response = new InvoiceResponse(invoice);
        const summary = response.toReadableSummary();

        expect(summary).toContain('XYZ1.000,00');
      });
    });
  });

  describe('ProcessingResultFormatter', () => {
    describe('format', () => {
      it('debería formatear resultado exitoso', () => {
        const result: ProcessingResult = {
          success: true,
          invoice: createMockInvoice(),
          userId: 12345,
          messageId: 67890,
        };

        const formatted = ProcessingResultFormatter.format(result);

        expect(formatted).toContain('✅');
        expect(formatted).toContain('Comprobante procesado exitosamente');
      });

      it('debería formatear resultado con error', () => {
        const result: ProcessingResult = {
          success: false,
          error: 'No se pudo procesar la imagen',
          userId: 12345,
          messageId: 67890,
        };

        const formatted = ProcessingResultFormatter.format(result);

        expect(formatted).toContain('❌');
        expect(formatted).toContain('No se pudo procesar la imagen');
      });

      it('debería manejar resultado sin error message', () => {
        const result: ProcessingResult = {
          success: false,
          userId: 12345,
          messageId: 67890,
        };

        const formatted = ProcessingResultFormatter.format(result);

        expect(formatted).toContain('Error desconocido');
      });
    });

    describe('formatError', () => {
      it('debería mapear "imagen no existe" a mensaje amigable', () => {
        const error = 'La imagen no existe en el path especificado';
        const formatted = ProcessingResultFormatter.formatError(error);

        expect(formatted).toContain('❌');
        expect(formatted).toContain('No se pudo encontrar la imagen');
      });

      it('debería mapear "API Key" a mensaje amigable', () => {
        const error = 'Error: API Key inválida';
        const formatted = ProcessingResultFormatter.formatError(error);

        expect(formatted).toContain('❌');
        expect(formatted).toContain('Error de configuración del servidor');
      });

      it('debería mapear "validación" a mensaje amigable', () => {
        const error = 'Error de validación: campo requerido';
        const formatted = ProcessingResultFormatter.formatError(error);

        expect(formatted).toContain('⚠️');
        expect(formatted).toContain('No se pudo extraer toda la información');
      });

      it('debería mapear "rate limit" a mensaje amigable', () => {
        const error = 'Rate limit exceeded';
        const formatted = ProcessingResultFormatter.formatError(error);

        expect(formatted).toContain('⏸️');
        expect(formatted).toContain('límite de procesamiento');
      });

      it('debería mapear "timeout" a mensaje amigable', () => {
        const error = 'Request timeout';
        const formatted = ProcessingResultFormatter.formatError(error);

        expect(formatted).toContain('⏱️');
        expect(formatted).toContain('tomando más tiempo');
      });

      it('debería retornar mensaje genérico para errores desconocidos', () => {
        const error = 'Este es un error completamente nuevo';
        const formatted = ProcessingResultFormatter.formatError(error);

        expect(formatted).toContain('❌');
        expect(formatted).toContain('Error al procesar el comprobante');
        expect(formatted).toContain('Este es un error completamente nuevo');
        expect(formatted).toContain('Sugerencias:');
      });
    });

    describe('welcomeMessage', () => {
      it('debería generar mensaje de bienvenida completo', () => {
        const message = ProcessingResultFormatter.welcomeMessage();

        expect(message).toContain('Bienvenido');
        expect(message).toContain('¿Cómo funciona?');
        expect(message).toContain('Formatos soportados:');
        expect(message).toContain('Comandos disponibles:');
        expect(message).toContain('/start');
        expect(message).toContain('/help');
        expect(message).toContain('/facturas');
        expect(message).toContain('/limpiar');
      });

      it('debería mencionar formatos de imagen', () => {
        const message = ProcessingResultFormatter.welcomeMessage();

        expect(message).toContain('JPG');
        expect(message).toContain('PNG');
        expect(message).toContain('PDF');
      });
    });

    describe('helpMessage', () => {
      it('debería generar mensaje de ayuda completo', () => {
        const message = ProcessingResultFormatter.helpMessage();

        expect(message).toContain('Ayuda');
        expect(message).toContain('¿Qué hace este bot?');
        expect(message).toContain('Información extraída:');
        expect(message).toContain('Comandos útiles:');
        expect(message).toContain('Consejos para mejores resultados:');
        expect(message).toContain('Privacidad:');
      });

      it('debería mencionar datos extraídos', () => {
        const message = ProcessingResultFormatter.helpMessage();

        expect(message).toContain('Fecha');
        expect(message).toContain('CUIT');
        expect(message).toContain('Monto bruto');
        expect(message).toContain('Banco receptor');
      });

      it('debería incluir limitaciones', () => {
        const message = ProcessingResultFormatter.helpMessage();

        expect(message).toContain('10MB');
        expect(message).toContain('Limitaciones:');
      });

      it('debería mencionar privacidad', () => {
        const message = ProcessingResultFormatter.helpMessage();

        expect(message).toContain('30 minutos');
        expect(message).toContain('eliminan después del procesamiento');
      });
    });
  });

  describe('Logger', () => {
    let logger: Logger;
    let consoleLogSpy: any;
    let consoleErrorSpy: any;
    let consoleWarnSpy: any;
    let consoleDebugSpy: any;

    beforeEach(() => {
      logger = new Logger('TestContext');
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe('info', () => {
      it('debería loggear mensaje info con contexto', () => {
        logger.info('Test message');

        const call = consoleLogSpy.mock.calls[0][0];
        expect(call).toContain('[TestContext]');
        expect(call).toContain('ℹ️');
        expect(call).toContain('Test message');
      });

      it('debería loggear argumentos adicionales', () => {
        logger.info('Message', { data: 'value' }, 123);

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.any(String),
          { data: 'value' },
          123
        );
      });
    });

    describe('success', () => {
      it('debería loggear mensaje success con emoji', () => {
        logger.success('Operation completed');

        const call = consoleLogSpy.mock.calls[0][0];
        expect(call).toContain('[TestContext]');
        expect(call).toContain('✅');
        expect(call).toContain('Operation completed');
      });
    });

    describe('error', () => {
      it('debería loggear error con console.error', () => {
        logger.error('Error occurred');

        const call = consoleErrorSpy.mock.calls[0][0];
        expect(call).toContain('[TestContext]');
        expect(call).toContain('❌');
        expect(call).toContain('Error occurred');
      });
    });

    describe('warn', () => {
      it('debería loggear warning con console.warn', () => {
        logger.warn('Warning message');

        const call = consoleWarnSpy.mock.calls[0][0];
        expect(call).toContain('[TestContext]');
        expect(call).toContain('⚠️');
        expect(call).toContain('Warning message');
      });
    });

    describe('debug', () => {
      it('debería loggear debug solo cuando LOG_LEVEL=debug', () => {
        process.env.LOG_LEVEL = 'debug';
        logger.debug('Debug message');

        expect(consoleDebugSpy).toHaveBeenCalled();
      });

      it('no debería loggear debug cuando LOG_LEVEL no es debug', () => {
        process.env.LOG_LEVEL = 'info';
        logger.debug('Debug message');

        expect(consoleDebugSpy).not.toHaveBeenCalled();
      });

      it('no debería loggear debug cuando LOG_LEVEL no está definido', () => {
        delete process.env.LOG_LEVEL;
        logger.debug('Debug message');

        expect(consoleDebugSpy).not.toHaveBeenCalled();
      });
    });

    describe('Multiple contexts', () => {
      it('debería usar contextos diferentes para diferentes loggers', () => {
        const logger1 = new Logger('Context1');
        const logger2 = new Logger('Context2');

        logger1.info('Message 1');
        logger2.info('Message 2');

        const call1 = consoleLogSpy.mock.calls[0][0];
        const call2 = consoleLogSpy.mock.calls[1][0];
        
        expect(call1).toContain('[Context1]');
        expect(call1).toContain('Message 1');
        expect(call2).toContain('[Context2]');
        expect(call2).toContain('Message 2');
      });
    });
  });
});

