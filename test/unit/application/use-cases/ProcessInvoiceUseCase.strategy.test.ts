import { describe, expect, vi } from 'vitest';
import {
  IProcessInvoiceRequest,
  IProcessInvoiceResponse,
  ProcessInvoiceUseCase,
} from '@/application/use-cases/ProcessInvoiceUseCase';
import { IDocumentIngestor } from '@/domain/interfaces/IDocumentIngestor';
import { IVisionProcessor } from '@/domain/interfaces/IVisionProcessor';
import { Invoice } from '@/domain/entities/Invoice.entity';
import { createInvoice } from './fixtures/invoiceFactory';
import { createInvoiceRepositoryDouble, InvoiceRepositoryDouble } from './fixtures/repositoryDouble';
import { createLoggerMock } from './fixtures/loggerMock';
import { runStrategies, TestStrategy } from './strategies/StrategyRunner';

interface ProcessInvoiceTestContext {
  useCase: ProcessInvoiceUseCase;
  documentIngestor: IDocumentIngestor & {
    downloadAndStore: ReturnType<typeof vi.fn>;
    deleteFile: ReturnType<typeof vi.fn>;
  };
  visionProcessor: IVisionProcessor & {
    processInvoiceImage: ReturnType<typeof vi.fn>;
  };
  invoiceRepository: InvoiceRepositoryDouble;
  logger: ReturnType<typeof createLoggerMock>;
  invoice: Invoice;
  request: IProcessInvoiceRequest;
  filePath: string;
}

const createContext = (retentionHours = 0): ProcessInvoiceTestContext => {
  const invoice = createInvoice();
  const request: IProcessInvoiceRequest = {
    fileUrl: 'https://example.com/invoice.png',
    userId: 42,
    messageId: 9001,
    detail: 'high',
  };

  const filePath = `/tmp/user-${request.userId}-${request.messageId}.png`;

  const documentIngestor = {
    downloadAndStore: vi.fn().mockResolvedValue({
      success: true,
      filePath,
      fileName: 'invoice.png',
    }),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    getStorageStats: vi.fn(),
    cleanupExpiredFiles: vi.fn(),
  } as unknown as IDocumentIngestor & {
    downloadAndStore: ReturnType<typeof vi.fn>;
    deleteFile: ReturnType<typeof vi.fn>;
  };

  const visionProcessor = {
    processInvoiceImage: vi.fn().mockResolvedValue({
      success: true,
      invoice,
      userId: request.userId,
      messageId: request.messageId,
    }),
    getModelName: vi.fn().mockReturnValue('mock-model'),
  } as unknown as IVisionProcessor & {
    processInvoiceImage: ReturnType<typeof vi.fn>;
  };

  const invoiceRepository = createInvoiceRepositoryDouble();
  const logger = createLoggerMock();

  const useCase = new ProcessInvoiceUseCase(
    documentIngestor,
    visionProcessor,
    invoiceRepository,
    logger,
    retentionHours,
  );

  return {
    useCase,
    documentIngestor,
    visionProcessor,
    invoiceRepository,
    logger,
    invoice,
    request,
    filePath,
  };
};

describe('ProcessInvoiceUseCase (Strategy Pattern)', () => {
  const strategies: TestStrategy<ProcessInvoiceTestContext, IProcessInvoiceResponse>[] = [
    {
      name: 'processes invoice successfully and persists session data',
      act: (ctx) => ctx.useCase.execute(ctx.request),
      assert: (result, ctx) => {
        expect(result.success).toBe(true);
        expect(result.invoice).toEqual(ctx.invoice);
        expect(result.totalInvoices).toBe(1);
        expect(ctx.invoiceRepository.getInvoiceCount(ctx.request.userId)).toBe(1);
        expect(ctx.documentIngestor.deleteFile).toHaveBeenCalledWith(ctx.filePath);
        expect(ctx.visionProcessor.processInvoiceImage).toHaveBeenCalledTimes(1);
        expect(ctx.logger.success).toHaveBeenCalled();
      },
    },
    {
      name: 'handles download failure and avoids processing',
      arrange: (ctx) => {
        ctx.documentIngestor.downloadAndStore.mockResolvedValueOnce({
          success: false,
          error: 'network error',
        });
      },
      act: (ctx) => ctx.useCase.execute(ctx.request),
      assert: (result, ctx) => {
        expect(result.success).toBe(false);
        expect(result.error).toBe('network error');
        expect(ctx.visionProcessor.processInvoiceImage).not.toHaveBeenCalled();
        expect(ctx.documentIngestor.deleteFile).not.toHaveBeenCalled();
        expect(ctx.invoiceRepository.getInvoiceCount(ctx.request.userId)).toBe(0);
      },
    },
    {
      name: 'handles vision processing failure and preserves repository state',
      arrange: (ctx) => {
        ctx.visionProcessor.processInvoiceImage.mockResolvedValueOnce({
          success: false,
          error: 'vision failed',
          userId: ctx.request.userId,
          messageId: ctx.request.messageId,
        });
      },
      act: (ctx) => ctx.useCase.execute(ctx.request),
      assert: (result, ctx) => {
        expect(result.success).toBe(false);
        expect(result.error).toBe('vision failed');
        expect(ctx.documentIngestor.deleteFile).toHaveBeenCalledWith(ctx.filePath);
        expect(ctx.invoiceRepository.getInvoiceCount(ctx.request.userId)).toBe(0);
      },
    },
    {
      name: 'skips temp deletion when retention hours are configured',
      arrange: (ctx) => {
        ctx.useCase = new ProcessInvoiceUseCase(
          ctx.documentIngestor,
          ctx.visionProcessor,
          ctx.invoiceRepository,
          ctx.logger,
          2,
        );
      },
      act: (ctx) => ctx.useCase.execute(ctx.request),
      assert: (result, ctx) => {
        expect(result.success).toBe(true);
        expect(ctx.documentIngestor.deleteFile).not.toHaveBeenCalled();
      },
    },
    {
      name: 'captures unexpected exceptions and surfaces error message',
      arrange: (ctx) => {
        ctx.visionProcessor.processInvoiceImage.mockRejectedValueOnce(new Error('model timeout'));
      },
      act: (ctx) => ctx.useCase.execute(ctx.request),
      assert: (result, ctx) => {
        expect(result.success).toBe(false);
        expect(result.error).toBe('model timeout');
        expect(ctx.logger.error).toHaveBeenCalled();
      },
    },
  ];

  runStrategies(() => createContext(), strategies);
});
