/**
 * DIContainer.ts
 * Dependency Injection Container
 * Composition root for the entire application
 * Follows Dependency Inversion Principle
 */

import { IVisionProcessor } from '../../domain/interfaces/IVisionProcessor';
import { IDocumentIngestor } from '../../domain/interfaces/IDocumentIngestor';
import { IInvoiceRepository } from '../../domain/interfaces/IInvoiceRepository';
import { IExcelGenerator } from '../../domain/interfaces/IExcelGenerator';
import { ILogger } from '../../domain/interfaces/ILogger';
import { IArchiveExtractor } from '../../domain/interfaces/IArchiveExtractor';

import * as path from 'path';
import { OpenAIVisionProcessor } from '../services/OpenAIVisionProcessor';
import { AnthropicVisionProcessor } from '../services/AnthropicVisionProcessor';
import { FileDocumentIngestor } from '../services/FileDocumentIngestor';
import { ZipArchiveExtractor } from '../services/ZipArchiveExtractor';
import { InMemoryInvoiceRepository } from '../repositories/InMemoryInvoiceRepository';
import { ExcelJSGenerator } from '../services/ExcelJSGenerator';
import { ConsoleLogger } from '../services/ConsoleLogger';

import { ProcessInvoiceUseCase } from '../../application/use-cases/ProcessInvoiceUseCase';
import { ProcessArchiveUseCase } from '../../application/use-cases/ProcessArchiveUseCase';
import { GenerateExcelUseCase } from '../../application/use-cases/GenerateExcelUseCase';
import { ManageSessionUseCase } from '../../application/use-cases/ManageSessionUseCase';

import { RateLimiterService } from '../services/RateLimiterService';
import { AuthenticationService } from '../services/AuthenticationService';
import { AuditLogger } from '../services/AuditLogger';

/**
 * Dependency Injection Container
 * Single Responsibility: Compose and manage dependencies
 */
export class DIContainer {
  // Infrastructure Layer
  private _logger: ILogger | null = null;
  private _auditLogger: ILogger | null = null;
  private _visionProcessor: IVisionProcessor | null = null;
  private _documentIngestor: IDocumentIngestor | null = null;
  private _archiveIngestor: IDocumentIngestor | null = null;
  private _archiveExtractor: IArchiveExtractor | null = null;
  private _invoiceRepository: IInvoiceRepository | null = null;
  private _excelGenerator: IExcelGenerator | null = null;
  private _rateLimiter: RateLimiterService | null = null;
  private _authService: AuthenticationService | null = null;

  // Application Layer
  private _processInvoiceUseCase: ProcessInvoiceUseCase | null = null;
  private _processArchiveUseCase: ProcessArchiveUseCase | null = null;
  private _generateExcelUseCase: GenerateExcelUseCase | null = null;
  private _manageSessionUseCase: ManageSessionUseCase | null = null;

  // ========================================
  // Infrastructure Layer Getters (Singletons)
  // ========================================

  get logger(): ILogger {
    if (!this._logger) {
      this._logger = new ConsoleLogger('TelegramBot');
    }
    return this._logger;
  }

  get auditLogger(): ILogger {
    if (!this._auditLogger) {
      // Use AuditLogger for production, ConsoleLogger for development
      const useFileAudit = process.env.USE_FILE_AUDIT_LOG === 'true';
      if (useFileAudit) {
        this._auditLogger = new AuditLogger();
      } else {
        // In development, use console logger but with audit context
        this._auditLogger = new ConsoleLogger('Audit');
      }
    }
    return this._auditLogger;
  }

  get rateLimiter(): RateLimiterService {
    if (!this._rateLimiter) {
      this._rateLimiter = new RateLimiterService();
    }
    return this._rateLimiter;
  }

  get authService(): AuthenticationService {
    if (!this._authService) {
      this._authService = new AuthenticationService();
    }
    return this._authService;
  }

  get visionProcessor(): IVisionProcessor {
    if (!this._visionProcessor) {
      const provider = (process.env.VISION_PROVIDER ?? 'anthropic').toLowerCase();
      if (provider === 'openai') {
        this._visionProcessor = OpenAIVisionProcessor.fromEnv(this.logger);
      } else {
        this._visionProcessor = AnthropicVisionProcessor.fromEnv(this.logger);
      }
      this.logger.info(`[DI] VisionProcessor: ${this._visionProcessor.getModelName()}`);
    }
    return this._visionProcessor;
  }

  get documentIngestor(): IDocumentIngestor {
    if (!this._documentIngestor) {
      this._documentIngestor = FileDocumentIngestor.fromEnv();
    }
    return this._documentIngestor;
  }

  /**
   * Dedicated ingestor for archives: only accepts ZIP content (magic bytes)
   * and allows a larger size than single documents (Telegram Bot API caps downloads at 20 MB)
   */
  get archiveIngestor(): IDocumentIngestor {
    if (!this._archiveIngestor) {
      this._archiveIngestor = new FileDocumentIngestor({
        tempStoragePath: path.resolve(process.env.TEMP_STORAGE_PATH || './temp'),
        maxFileSizeMB: parseInt(process.env.ARCHIVE_MAX_SIZE_MB || '20'),
        supportedFormats: ['zip'],
        retentionHours: parseInt(process.env.IMAGE_RETENTION_HOURS || '0'),
      });
    }
    return this._archiveIngestor;
  }

  get archiveExtractor(): IArchiveExtractor {
    if (!this._archiveExtractor) {
      this._archiveExtractor = ZipArchiveExtractor.fromEnv(this.logger);
    }
    return this._archiveExtractor;
  }

  get invoiceRepository(): IInvoiceRepository {
    if (!this._invoiceRepository) {
      const sessionTimeoutMinutes = parseInt(process.env.SESSION_TIMEOUT_MINUTES || '30');
      this._invoiceRepository = new InMemoryInvoiceRepository(sessionTimeoutMinutes);
    }
    return this._invoiceRepository;
  }

  get excelGenerator(): IExcelGenerator {
    if (!this._excelGenerator) {
      this._excelGenerator = new ExcelJSGenerator();
    }
    return this._excelGenerator;
  }

  // ========================================
  // Application Layer Getters (Use Cases)
  // ========================================

  get processInvoiceUseCase(): ProcessInvoiceUseCase {
    if (!this._processInvoiceUseCase) {
      const retentionHours = parseInt(process.env.IMAGE_RETENTION_HOURS || '0');
      
      this._processInvoiceUseCase = new ProcessInvoiceUseCase(
        this.documentIngestor,
        this.visionProcessor,
        this.invoiceRepository,
        this.logger,
        retentionHours
      );
    }
    return this._processInvoiceUseCase;
  }

  get processArchiveUseCase(): ProcessArchiveUseCase {
    if (!this._processArchiveUseCase) {
      this._processArchiveUseCase = new ProcessArchiveUseCase(
        this.archiveIngestor,
        this.archiveExtractor,
        this.visionProcessor,
        this.invoiceRepository,
        this.logger,
        parseInt(process.env.IMAGE_RETENTION_HOURS || '0'),
        parseInt(process.env.ARCHIVE_PROCESSING_CONCURRENCY || '3')
      );
    }
    return this._processArchiveUseCase;
  }

  get generateExcelUseCase(): GenerateExcelUseCase {
    if (!this._generateExcelUseCase) {
      this._generateExcelUseCase = new GenerateExcelUseCase(
        this.invoiceRepository,
        this.excelGenerator,
        this.logger
      );
    }
    return this._generateExcelUseCase;
  }

  get manageSessionUseCase(): ManageSessionUseCase {
    if (!this._manageSessionUseCase) {
      this._manageSessionUseCase = new ManageSessionUseCase(
        this.invoiceRepository,
        this.logger
      );
    }
    return this._manageSessionUseCase;
  }

  // ========================================
  // Cleanup Methods
  // ========================================

  /**
   * Cleanup all resources (for graceful shutdown)
   */
  cleanup(): void {
    if (this._invoiceRepository instanceof InMemoryInvoiceRepository) {
      this._invoiceRepository.stopCleanupTask();
    }
    
    if (this._rateLimiter) {
      this._rateLimiter.stop();
    }
    
    this.logger.info('DIContainer cleaned up successfully');
  }

  /**
   * Reset all dependencies (useful for testing)
   */
  reset(): void {
    this._logger = null;
    this._auditLogger = null;
    this._visionProcessor = null;
    this._documentIngestor = null;
    this._archiveIngestor = null;
    this._archiveExtractor = null;
    this._invoiceRepository = null;
    this._excelGenerator = null;
    this._rateLimiter = null;
    this._authService = null;
    this._processInvoiceUseCase = null;
    this._processArchiveUseCase = null;
    this._generateExcelUseCase = null;
    this._manageSessionUseCase = null;
  }
}

// Export singleton instance
export const container = new DIContainer();

