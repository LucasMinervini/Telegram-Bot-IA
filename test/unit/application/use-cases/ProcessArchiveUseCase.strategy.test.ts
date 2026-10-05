import { describe, expect, vi } from 'vitest';
import {
  IProcessArchiveRequest,
  IProcessArchiveResponse,
  ProcessArchiveUseCase,
} from '@/application/use-cases/ProcessArchiveUseCase';
import { IDocumentIngestor } from '@/domain/interfaces/IDocumentIngestor';
import { IArchiveExtractor, IExtractedEntry } from '@/domain/interfaces/IArchiveExtractor';
import { IImageProcessingOptions, IVisionProcessor } from '@/domain/interfaces/IVisionProcessor';
import { createInvoice } from './fixtures/invoiceFactory';
import { createInvoiceRepositoryDouble, InvoiceRepositoryDouble } from './fixtures/repositoryDouble';
import { createLoggerMock } from './fixtures/loggerMock';
import { runStrategies, TestStrategy } from './strategies/StrategyRunner';

type Mocked<T> = T & Record<string, ReturnType<typeof vi.fn>>;

interface ProcessArchiveTestContext {
  useCase: ProcessArchiveUseCase;
  archiveIngestor: Mocked<IDocumentIngestor>;
  archiveExtractor: Mocked<IArchiveExtractor>;
  visionProcessor: Mocked<IVisionProcessor>;
  invoiceRepository: InvoiceRepositoryDouble;
  logger: ReturnType<typeof createLoggerMock>;
  request: IProcessArchiveRequest;
  archivePath: string;
  entries: IExtractedEntry[];
}

const createContext = (): ProcessArchiveTestContext => {
  const request: IProcessArchiveRequest = {
    fileUrl: 'https://example.com/receipts.zip',
    userId: 42,
    messageId: 9001,
    detail: 'auto',
  };
  const archivePath = '/tmp/receipts.zip';
  const entries: IExtractedEntry[] = ['01_a.jpeg', '02_b.jpeg', '03_c.pdf'].map((name, index) => ({
    originalName: name,
    filePath: `/tmp/entry_${index}${name.slice(name.lastIndexOf('.'))}`,
    sizeBytes: 100,
  }));

  const archiveIngestor = {
    downloadAndStore: vi.fn().mockResolvedValue({ success: true, filePath: archivePath, fileName: 'receipts.zip' }),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    getStorageStats: vi.fn(),
    cleanupExpiredFiles: vi.fn(),
  } as unknown as Mocked<IDocumentIngestor>;

  const archiveExtractor = {
    supports: vi.fn((name: string) => name.toLowerCase().endsWith('.zip')),
    extract: vi.fn().mockResolvedValue({ success: true, entries, skipped: [] }),
  } as unknown as Mocked<IArchiveExtractor>;

  // Each entry produces an invoice whose number identifies the source file.
  // Earlier entries resolve later to prove results keep archive order.
  const visionProcessor = {
    processInvoiceImage: vi.fn(async (options: IImageProcessingOptions) => {
      const index = entries.findIndex((entry) => entry.filePath === options.imagePath);
      await new Promise((resolve) => setTimeout(resolve, (entries.length - index) * 5));
      return {
        success: true,
        invoice: createInvoice({ invoiceNumber: `INV-${index}` }),
        userId: options.userId,
        messageId: options.messageId,
      };
    }),
    getModelName: vi.fn().mockReturnValue('mock-model'),
  } as unknown as Mocked<IVisionProcessor>;

  const invoiceRepository = createInvoiceRepositoryDouble();
  const logger = createLoggerMock();

  const useCase = new ProcessArchiveUseCase(
    archiveIngestor,
    archiveExtractor,
    visionProcessor,
    invoiceRepository,
    logger,
    0,
    3,
  );

  return {
    useCase,
    archiveIngestor,
    archiveExtractor,
    visionProcessor,
    invoiceRepository,
    logger,
    request,
    archivePath,
    entries,
  };
};

describe('ProcessArchiveUseCase (Strategy Pattern)', () => {
  const strategies: TestStrategy<ProcessArchiveTestContext, IProcessArchiveResponse>[] = [
    {
      name: 'processes every document and stores invoices in archive order',
      act: (ctx) => ctx.useCase.execute(ctx.request),
      assert: (result, ctx) => {
        expect(result.success).toBe(true);
        expect(result.processedCount).toBe(3);
        expect(result.failedCount).toBe(0);
        expect(result.totalInvoices).toBe(3);
        expect(result.items.map((item) => item.fileName)).toEqual(['01_a.jpeg', '02_b.jpeg', '03_c.pdf']);
        expect(ctx.invoiceRepository.getInvoices(ctx.request.userId).map((i) => i.invoiceNumber)).toEqual([
          'INV-0',
          'INV-1',
          'INV-2',
        ]);
      },
    },
    {
      name: 'removes the archive and every extracted file',
      act: (ctx) => ctx.useCase.execute(ctx.request),
      assert: (_result, ctx) => {
        const deleted = ctx.archiveIngestor.deleteFile.mock.calls.map((call) => call[0]);
        expect(deleted).toContain(ctx.archivePath);
        ctx.entries.forEach((entry) => expect(deleted).toContain(entry.filePath));
      },
    },
    {
      name: 'keeps going when a single document fails',
      arrange: (ctx) => {
        ctx.visionProcessor.processInvoiceImage.mockImplementationOnce(async (options: IImageProcessingOptions) => ({
          success: false,
          error: 'unreadable',
          userId: options.userId,
          messageId: options.messageId,
        }));
      },
      act: (ctx) => ctx.useCase.execute(ctx.request),
      assert: (result, ctx) => {
        expect(result.success).toBe(true);
        expect(result.processedCount).toBe(2);
        expect(result.failedCount).toBe(1);
        expect(result.items[0]).toEqual(expect.objectContaining({ success: false, error: 'unreadable' }));
        expect(ctx.invoiceRepository.getInvoiceCount(ctx.request.userId)).toBe(2);
      },
    },
    {
      name: 'treats thrown vision errors as failed items',
      arrange: (ctx) => {
        ctx.visionProcessor.processInvoiceImage.mockRejectedValue(new Error('model timeout'));
      },
      act: (ctx) => ctx.useCase.execute(ctx.request),
      assert: (result, ctx) => {
        expect(result.success).toBe(false);
        expect(result.failedCount).toBe(3);
        expect(result.error).toBeDefined();
        expect(ctx.invoiceRepository.getInvoiceCount(ctx.request.userId)).toBe(0);
      },
    },
    {
      name: 'stops processing remaining documents when the AI provider is unavailable',
      arrange: (ctx) => {
        ctx.useCase = new ProcessArchiveUseCase(
          ctx.archiveIngestor,
          ctx.archiveExtractor,
          ctx.visionProcessor,
          ctx.invoiceRepository,
          ctx.logger,
          0,
          1,
        );
        ctx.visionProcessor.processInvoiceImage.mockImplementation(async (options: IImageProcessingOptions) => ({
          success: false,
          error: 'Servicio de IA no disponible',
          errorCode: 'PROVIDER_UNAVAILABLE',
          userId: options.userId,
          messageId: options.messageId,
        }));
      },
      act: (ctx) => ctx.useCase.execute(ctx.request),
      assert: (result, ctx) => {
        expect(result.success).toBe(false);
        expect(result.errorCode).toBe('PROVIDER_UNAVAILABLE');
        expect(ctx.visionProcessor.processInvoiceImage).toHaveBeenCalledTimes(1);
        expect(result.items).toHaveLength(1);
        expect(result.failedCount).toBe(3);
        const deleted = ctx.archiveIngestor.deleteFile.mock.calls.map((call) => call[0]);
        ctx.entries.forEach((entry) => expect(deleted).toContain(entry.filePath));
      },
    },
    {
      name: 'keeps invoices processed before the provider became unavailable',
      arrange: (ctx) => {
        ctx.useCase = new ProcessArchiveUseCase(
          ctx.archiveIngestor,
          ctx.archiveExtractor,
          ctx.visionProcessor,
          ctx.invoiceRepository,
          ctx.logger,
          0,
          1,
        );
        ctx.visionProcessor.processInvoiceImage
          .mockResolvedValueOnce({
            success: true,
            invoice: createInvoice({ invoiceNumber: 'INV-0' }),
            userId: ctx.request.userId,
            messageId: ctx.request.messageId,
          })
          .mockResolvedValueOnce({
            success: false,
            error: 'Servicio de IA no disponible',
            errorCode: 'PROVIDER_UNAVAILABLE',
            userId: ctx.request.userId,
            messageId: ctx.request.messageId,
          });
      },
      act: (ctx) => ctx.useCase.execute(ctx.request),
      assert: (result, ctx) => {
        expect(result.errorCode).toBe('PROVIDER_UNAVAILABLE');
        expect(result.processedCount).toBe(1);
        expect(ctx.visionProcessor.processInvoiceImage).toHaveBeenCalledTimes(2);
        expect(ctx.invoiceRepository.getInvoiceCount(ctx.request.userId)).toBe(1);
      },
    },
    {
      name: 'reports progress after each document',
      arrange: (ctx) => {
        ctx.request.onProgress = vi.fn();
      },
      act: (ctx) => ctx.useCase.execute(ctx.request),
      assert: (_result, ctx) => {
        const progress = (ctx.request.onProgress as ReturnType<typeof vi.fn>).mock.calls;
        expect(progress).toHaveLength(3);
        expect(progress[progress.length - 1]).toEqual([3, 3]);
      },
    },
    {
      name: 'does not fail when the progress callback throws',
      arrange: (ctx) => {
        ctx.request.onProgress = vi.fn().mockRejectedValue(new Error('telegram 429'));
      },
      act: (ctx) => ctx.useCase.execute(ctx.request),
      assert: (result) => {
        expect(result.success).toBe(true);
        expect(result.processedCount).toBe(3);
      },
    },
    {
      name: 'stops when the archive download fails',
      arrange: (ctx) => {
        ctx.archiveIngestor.downloadAndStore.mockResolvedValueOnce({ success: false, error: 'too big' });
      },
      act: (ctx) => ctx.useCase.execute(ctx.request),
      assert: (result, ctx) => {
        expect(result.success).toBe(false);
        expect(result.error).toBe('too big');
        expect(ctx.archiveExtractor.extract).not.toHaveBeenCalled();
        expect(ctx.visionProcessor.processInvoiceImage).not.toHaveBeenCalled();
      },
    },
    {
      name: 'surfaces extraction errors and still deletes the archive',
      arrange: (ctx) => {
        ctx.archiveExtractor.extract.mockResolvedValueOnce({
          success: false,
          entries: [],
          skipped: [],
          error: 'Archivo ZIP inválido o corrupto',
        });
      },
      act: (ctx) => ctx.useCase.execute(ctx.request),
      assert: (result, ctx) => {
        expect(result.success).toBe(false);
        expect(result.error).toContain('ZIP inválido');
        expect(ctx.archiveIngestor.deleteFile).toHaveBeenCalledWith(ctx.archivePath);
        expect(ctx.visionProcessor.processInvoiceImage).not.toHaveBeenCalled();
      },
    },
    {
      name: 'reports skipped entries when nothing is processable',
      arrange: (ctx) => {
        ctx.archiveExtractor.extract.mockResolvedValueOnce({
          success: true,
          entries: [],
          skipped: [{ originalName: 'notes.txt', reason: 'Formato no soportado (.txt)' }],
        });
      },
      act: (ctx) => ctx.useCase.execute(ctx.request),
      assert: (result) => {
        expect(result.success).toBe(false);
        expect(result.skipped).toHaveLength(1);
        expect(result.error).toContain('no contiene comprobantes');
      },
    },
    {
      name: 'delegates archive detection to the extractor',
      act: (ctx) => ctx.useCase.isArchive('Comprobantes.zip') && !ctx.useCase.isArchive('factura.pdf'),
      assert: (result) => {
        expect(result).toBe(true);
      },
    },
  ] as TestStrategy<ProcessArchiveTestContext, any>[];

  runStrategies(() => createContext(), strategies);
});
