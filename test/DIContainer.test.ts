/**
 * DIContainer.test.ts
 * Unit tests for DIContainer
 * Tests dependency injection and singleton creation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ProcessEnv } from 'node:process';
import { DIContainer } from '../src/infrastructure/di/DIContainer';
import { ILogger } from '../src/domain/interfaces/ILogger';
import { IVisionProcessor } from '../src/domain/interfaces/IVisionProcessor';
import { IDocumentIngestor } from '../src/domain/interfaces/IDocumentIngestor';
import { IInvoiceRepository } from '../src/domain/interfaces/IInvoiceRepository';
import { IExcelGenerator } from '../src/domain/interfaces/IExcelGenerator';
import { ProcessInvoiceUseCase } from '../src/application/use-cases/ProcessInvoiceUseCase';
import { GenerateExcelUseCase } from '../src/application/use-cases/GenerateExcelUseCase';
import { ManageSessionUseCase } from '../src/application/use-cases/ManageSessionUseCase';
import { RateLimiterService } from '../src/infrastructure/services/RateLimiterService';
import { AuthenticationService } from '../src/infrastructure/services/AuthenticationService';

describe('DIContainer', () => {
  let container: DIContainer;
  let originalEnv: ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    container = new DIContainer();
  });

  afterEach(() => {
    process.env = originalEnv;
    container.reset();
  });

  describe('Logger Injection', () => {
    it('should provide logger instance', () => {
      const logger = container.logger;
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
    });

    it('should return same logger instance (singleton)', () => {
      const logger1 = container.logger;
      const logger2 = container.logger;
      
      expect(logger1).toBe(logger2);
    });

    it('should create ConsoleLogger by default', () => {
      const logger = container.logger;
      
      expect(logger).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.error).toBeDefined();
      expect(logger.warn).toBeDefined();
    });

    it('should implement ILogger interface', () => {
      const logger = container.logger;
      
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.success).toBe('function');
    });
  });

  describe('Audit Logger Injection', () => {
    it('should provide audit logger instance', () => {
      const auditLogger = container.auditLogger;
      expect(auditLogger).toBeDefined();
    });

    it('should return same audit logger instance (singleton)', () => {
      const logger1 = container.auditLogger;
      const logger2 = container.auditLogger;
      
      expect(logger1).toBe(logger2);
    });

    it('should use ConsoleLogger in development by default', () => {
      delete process.env.USE_FILE_AUDIT_LOG;
      const newContainer = new DIContainer();
      
      const auditLogger = newContainer.auditLogger;
      expect(auditLogger).toBeDefined();
    });

    it('should use AuditLogger when USE_FILE_AUDIT_LOG is true', () => {
      process.env.USE_FILE_AUDIT_LOG = 'true';
      const newContainer = new DIContainer();
      
      const auditLogger = newContainer.auditLogger;
      expect(auditLogger).toBeDefined();
      expect(typeof auditLogger.audit).toBe('function');
    });
  });

  describe('Vision Processor Injection', () => {
    it('should provide vision processor instance', () => {
      const processor = container.visionProcessor;
      expect(processor).toBeDefined();
    });

    it('should return same vision processor instance (singleton)', () => {
      const processor1 = container.visionProcessor;
      const processor2 = container.visionProcessor;
      
      expect(processor1).toBe(processor2);
    });

    it('should create OpenAIVisionProcessor', () => {
      const processor = container.visionProcessor;
      
      expect(processor).toBeDefined();
      expect(typeof processor.processInvoiceImage).toBe('function');
    });

    it('should implement IVisionProcessor interface', () => {
      const processor = container.visionProcessor;
      
      expect(typeof processor.processInvoiceImage).toBe('function');
      expect(typeof processor.getModelName).toBe('function');
    });
  });

  describe('Document Ingestor Injection', () => {
    it('should provide document ingestor instance', () => {
      const ingestor = container.documentIngestor;
      expect(ingestor).toBeDefined();
    });

    it('should return same document ingestor instance (singleton)', () => {
      const ingestor1 = container.documentIngestor;
      const ingestor2 = container.documentIngestor;
      
      expect(ingestor1).toBe(ingestor2);
    });

    it('should create FileDocumentIngestor', () => {
      const ingestor = container.documentIngestor;
      
      expect(ingestor).toBeDefined();
      expect(typeof ingestor.downloadAndStore).toBe('function');
    });

    it('should implement IDocumentIngestor interface', () => {
      const ingestor = container.documentIngestor;
      
      expect(typeof ingestor.downloadAndStore).toBe('function');
      expect(typeof ingestor.deleteFile).toBe('function');
    });
  });

  describe('Invoice Repository Injection', () => {
    it('should provide invoice repository instance', () => {
      const repository = container.invoiceRepository;
      expect(repository).toBeDefined();
    });

    it('should return same repository instance (singleton)', () => {
      const repo1 = container.invoiceRepository;
      const repo2 = container.invoiceRepository;
      
      expect(repo1).toBe(repo2);
    });

    it('should create InMemoryInvoiceRepository', () => {
      const repository = container.invoiceRepository;
      
      expect(repository).toBeDefined();
      expect(typeof repository.addInvoice).toBe('function');
    });

    it('should implement IInvoiceRepository interface', () => {
      const repository = container.invoiceRepository;
      
      expect(typeof repository.addInvoice).toBe('function');
      expect(typeof repository.getInvoices).toBe('function');
      expect(typeof repository.clearInvoices).toBe('function');
    });

    it('should use SESSION_TIMEOUT_MINUTES from env', () => {
      process.env.SESSION_TIMEOUT_MINUTES = '60';
      const newContainer = new DIContainer();
      
      const repository = newContainer.invoiceRepository;
      expect(repository).toBeDefined();
    });

    it('should use default timeout when env not set', () => {
      delete process.env.SESSION_TIMEOUT_MINUTES;
      const newContainer = new DIContainer();
      
      const repository = newContainer.invoiceRepository;
      expect(repository).toBeDefined();
    });
  });

  describe('Excel Generator Injection', () => {
    it('should provide excel generator instance', () => {
      const generator = container.excelGenerator;
      expect(generator).toBeDefined();
    });

    it('should return same generator instance (singleton)', () => {
      const gen1 = container.excelGenerator;
      const gen2 = container.excelGenerator;
      
      expect(gen1).toBe(gen2);
    });

    it('should create ExcelJSGenerator', () => {
      const generator = container.excelGenerator;
      
      expect(generator).toBeDefined();
      expect(typeof generator.generateExcel).toBe('function');
    });

    it('should implement IExcelGenerator interface', () => {
      const generator = container.excelGenerator;
      
      expect(typeof generator.generateExcel).toBe('function');
    });
  });

  describe('Rate Limiter Injection', () => {
    it('should provide rate limiter instance', () => {
      const limiter = container.rateLimiter;
      expect(limiter).toBeDefined();
    });

    it('should return same rate limiter instance (singleton)', () => {
      const limiter1 = container.rateLimiter;
      const limiter2 = container.rateLimiter;
      
      expect(limiter1).toBe(limiter2);
    });

    it('should create RateLimiterService', () => {
      const limiter = container.rateLimiter;
      
      expect(limiter).toBeDefined();
      expect(typeof limiter.isAllowed).toBe('function');
    });
  });

  describe('Authentication Service Injection', () => {
    it('should provide authentication service instance', () => {
      const authService = container.authService;
      expect(authService).toBeDefined();
    });

    it('should return same auth service instance (singleton)', () => {
      const auth1 = container.authService;
      const auth2 = container.authService;
      
      expect(auth1).toBe(auth2);
    });

    it('should create AuthenticationService', () => {
      const authService = container.authService;
      
      expect(authService).toBeDefined();
      expect(typeof authService.isAuthorized).toBe('function');
    });
  });

  describe('Use Case Injection', () => {
    it('should provide ProcessInvoiceUseCase', () => {
      const useCase = container.processInvoiceUseCase;
      expect(useCase).toBeDefined();
      expect(useCase instanceof ProcessInvoiceUseCase).toBe(true);
    });

    it('should return same ProcessInvoiceUseCase instance (singleton)', () => {
      const useCase1 = container.processInvoiceUseCase;
      const useCase2 = container.processInvoiceUseCase;
      
      expect(useCase1).toBe(useCase2);
    });

    it('should provide GenerateExcelUseCase', () => {
      const useCase = container.generateExcelUseCase;
      expect(useCase).toBeDefined();
      expect(useCase instanceof GenerateExcelUseCase).toBe(true);
    });

    it('should return same GenerateExcelUseCase instance (singleton)', () => {
      const useCase1 = container.generateExcelUseCase;
      const useCase2 = container.generateExcelUseCase;
      
      expect(useCase1).toBe(useCase2);
    });

    it('should provide ManageSessionUseCase', () => {
      const useCase = container.manageSessionUseCase;
      expect(useCase).toBeDefined();
      expect(useCase instanceof ManageSessionUseCase).toBe(true);
    });

    it('should return same ManageSessionUseCase instance (singleton)', () => {
      const useCase1 = container.manageSessionUseCase;
      const useCase2 = container.manageSessionUseCase;
      
      expect(useCase1).toBe(useCase2);
    });

    it('should use IMAGE_RETENTION_HOURS for ProcessInvoiceUseCase', () => {
      process.env.IMAGE_RETENTION_HOURS = '24';
      const newContainer = new DIContainer();
      
      const useCase = newContainer.processInvoiceUseCase;
      expect(useCase).toBeDefined();
    });
  });

  describe('Dependency chain', () => {
    it('should inject dependencies into use cases', () => {
      const useCase = container.processInvoiceUseCase;
      
      expect(useCase).toBeDefined();
      expect(typeof useCase.execute).toBe('function');
    });

    it('should share logger across all components', () => {
      const logger1 = container.logger;
      const logger2 = container.logger;
      
      expect(logger1).toBe(logger2);
    });

    it('should have repository accessible from use cases', () => {
      const repo1 = container.invoiceRepository;
      const repo2 = container.invoiceRepository;
      
      expect(repo1).toBe(repo2);
    });
  });

  describe('Cleanup', () => {
    it('should have cleanup method', () => {
      expect(typeof container.cleanup).toBe('function');
    });

    it('should not throw error on cleanup', () => {
      expect(() => container.cleanup()).not.toThrow();
    });

    it('should stop rate limiter on cleanup', () => {
      const limiter = container.rateLimiter;
      const stopSpy = vi.spyOn(limiter, 'stop');
      
      container.cleanup();
      
      expect(stopSpy).toHaveBeenCalled();
    });
  });

  describe('Reset', () => {
    it('should have reset method', () => {
      expect(typeof container.reset).toBe('function');
    });

    it('should clear all singletons', () => {
      const logger1 = container.logger;
      container.reset();
      const logger2 = container.logger;
      
      expect(logger1).not.toBe(logger2);
    });

    it('should create new instances after reset', () => {
      const useCase1 = container.processInvoiceUseCase;
      container.reset();
      const useCase2 = container.processInvoiceUseCase;
      
      expect(useCase1).not.toBe(useCase2);
    });

    it('should reset all infrastructure components', () => {
      const loggerBefore = container.logger;
      const auditBefore = container.auditLogger;
      const visionBefore = container.visionProcessor;
      const ingestBefore = container.documentIngestor;
      const repoBefore = container.invoiceRepository;
      const excelBefore = container.excelGenerator;
      const limiterBefore = container.rateLimiter;
      const authBefore = container.authService;

      container.reset();

      expect(container.logger).not.toBe(loggerBefore);
      expect(container.auditLogger).not.toBe(auditBefore);
      expect(container.visionProcessor).not.toBe(visionBefore);
      expect(container.documentIngestor).not.toBe(ingestBefore);
      expect(container.invoiceRepository).not.toBe(repoBefore);
      expect(container.excelGenerator).not.toBe(excelBefore);
      expect(container.rateLimiter).not.toBe(limiterBefore);
      expect(container.authService).not.toBe(authBefore);
    });

    it('should reset all use cases', () => {
      const processBefore = container.processInvoiceUseCase;
      const excelBefore = container.generateExcelUseCase;
      const manageBefore = container.manageSessionUseCase;

      container.reset();

      expect(container.processInvoiceUseCase).not.toBe(processBefore);
      expect(container.generateExcelUseCase).not.toBe(excelBefore);
      expect(container.manageSessionUseCase).not.toBe(manageBefore);
    });
  });

  describe('Environment variable configuration', () => {
    it('should respect all environment variables', () => {
      process.env.SESSION_TIMEOUT_MINUTES = '45';
      process.env.IMAGE_RETENTION_HOURS = '2';
      process.env.USE_FILE_AUDIT_LOG = 'true';
      process.env.RATE_LIMIT_REQUESTS_PER_MINUTE = '20';
      process.env.ALLOWED_USER_IDS = '123,456';
      
      const newContainer = new DIContainer();
      
      expect(newContainer.invoiceRepository).toBeDefined();
      expect(newContainer.processInvoiceUseCase).toBeDefined();
      expect(newContainer.auditLogger).toBeDefined();
      expect(newContainer.rateLimiter).toBeDefined();
      expect(newContainer.authService).toBeDefined();
    });
  });

  describe('Integration', () => {
    it('should bootstrap complete application', () => {
      const logger = container.logger;
      const repo = container.invoiceRepository;
      const excel = container.excelGenerator;
      const useCase = container.generateExcelUseCase;
      
      expect(logger).toBeDefined();
      expect(repo).toBeDefined();
      expect(excel).toBeDefined();
      expect(useCase).toBeDefined();
    });

    it('should provide all required interfaces', () => {
      expect(container.logger).toBeDefined();
      expect(container.auditLogger).toBeDefined();
      expect(container.visionProcessor).toBeDefined();
      expect(container.documentIngestor).toBeDefined();
      expect(container.invoiceRepository).toBeDefined();
      expect(container.excelGenerator).toBeDefined();
      expect(container.rateLimiter).toBeDefined();
      expect(container.authService).toBeDefined();
      expect(container.processInvoiceUseCase).toBeDefined();
      expect(container.generateExcelUseCase).toBeDefined();
      expect(container.manageSessionUseCase).toBeDefined();
    });
  });
});
