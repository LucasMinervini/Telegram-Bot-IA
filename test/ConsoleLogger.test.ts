/**
 * Tests para ConsoleLogger (Infrastructure)
 * Tests unitarios simples para logger
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConsoleLogger } from '../src/infrastructure/services/ConsoleLogger';

describe('ConsoleLogger (Unit Tests)', () => {
  let logger: ConsoleLogger;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let consoleWarnSpy: any;

  beforeEach(() => {
    logger = new ConsoleLogger();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('info()', () => {
    it('debería llamar a console.log', () => {
      logger.info('Test message');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('debería incluir el mensaje', () => {
      logger.info('Test message');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Test message'));
    });

    it('debería incluir timestamp', () => {
      logger.info('Test');
      const call = consoleLogSpy.mock.calls[0][0];
      // Debería contener formato de fecha/hora
      expect(call).toMatch(/\d{4}-\d{2}-\d{2}/);
    });
  });

  describe('warn()', () => {
    it('debería llamar a console.warn', () => {
      logger.warn('Warning message');
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('debería incluir el mensaje', () => {
      logger.warn('Warning message');
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Warning message'));
    });
  });

  describe('error()', () => {
    it('debería llamar a console.error', () => {
      logger.error('Error message');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('debería incluir el mensaje', () => {
      logger.error('Error message');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error message'));
    });
  });

  describe('success()', () => {
    it('debería llamar a console.log', () => {
      logger.success('Success message');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('debería incluir el mensaje', () => {
      logger.success('Success message');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Success message'));
    });
  });

  describe('debug()', () => {
    it('NO debería llamar a console.log sin LOG_LEVEL=debug', () => {
      logger.debug('Debug message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('debería llamar a console.log con LOG_LEVEL=debug', () => {
      process.env.LOG_LEVEL = 'debug';
      const debugLogger = new ConsoleLogger();
      
      debugLogger.debug('Debug message');
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Debug message'));
      
      delete process.env.LOG_LEVEL;
    });
  });

  describe('Casos especiales', () => {
    it('debería manejar mensajes vacíos', () => {
      logger.info('');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('debería manejar mensajes con caracteres especiales', () => {
      logger.info('Test 🚀 with émojis');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('🚀'));
    });

    it('debería manejar mensajes largos', () => {
      const longMessage = 'A'.repeat(1000);
      logger.info(longMessage);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(longMessage));
    });

    it('debería manejar múltiples llamadas consecutivas', () => {
      logger.info('Message 1');
      logger.warn('Message 2');
      logger.error('Message 3');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });
});

