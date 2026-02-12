import { describe, expect, vi } from 'vitest';
import {
  GenerateExcelUseCase,
  IGenerateExcelRequest,
  IGenerateExcelResponse,
} from '@/application/use-cases/GenerateExcelUseCase';
import { IExcelGenerator } from '@/domain/interfaces/IExcelGenerator';
import { createInvoice } from './fixtures/invoiceFactory';
import { createInvoiceRepositoryDouble, InvoiceRepositoryDouble } from './fixtures/repositoryDouble';
import { createLoggerMock } from './fixtures/loggerMock';
import { runStrategies, TestStrategy } from './strategies/StrategyRunner';

interface GenerateExcelTestContext {
  useCase: GenerateExcelUseCase;
  invoiceRepository: InvoiceRepositoryDouble;
  excelGenerator: IExcelGenerator & { generateExcel: ReturnType<typeof vi.fn> };
  logger: ReturnType<typeof createLoggerMock>;
  request: IGenerateExcelRequest;
}

const createContext = (): GenerateExcelTestContext => {
  const invoiceRepository = createInvoiceRepositoryDouble();
  const excelGenerator = {
    generateExcel: vi.fn(),
    generateAndSaveExcel: vi.fn(),
  } as unknown as IExcelGenerator & { generateExcel: ReturnType<typeof vi.fn> };
  const logger = createLoggerMock();

  const useCase = new GenerateExcelUseCase(invoiceRepository, excelGenerator, logger);
  const request: IGenerateExcelRequest = { userId: 7 };

  return {
    useCase,
    invoiceRepository,
    excelGenerator,
    logger,
    request,
  };
};

describe('GenerateExcelUseCase (Strategy Pattern)', () => {
  const strategies: TestStrategy<GenerateExcelTestContext, IGenerateExcelResponse>[] = [
    {
      name: 'fails gracefully when user has no invoices',
      act: (ctx) => ctx.useCase.execute(ctx.request),
      assert: (result, ctx) => {
        expect(result.success).toBe(false);
        expect(result.error).toBe('No invoices to generate Excel');
        expect(result.invoiceCount).toBe(0);
        expect(ctx.excelGenerator.generateExcel).not.toHaveBeenCalled();
        expect(ctx.logger.warn).toHaveBeenCalled();
      },
    },
    {
      name: 'returns Excel buffer when invoices exist',
      arrange: (ctx) => {
        ctx.invoiceRepository.addInvoice(ctx.request.userId, createInvoice());
        ctx.excelGenerator.generateExcel.mockResolvedValueOnce(Buffer.from('excel-buffer'));
      },
      act: (ctx) => ctx.useCase.execute(ctx.request),
      assert: (result, ctx) => {
        expect(result.success).toBe(true);
        expect(result.invoiceCount).toBe(1);
        expect(result.excelBuffer?.toString()).toBe('excel-buffer');
        expect(ctx.excelGenerator.generateExcel).toHaveBeenCalledWith(
          ctx.invoiceRepository.getInvoices(ctx.request.userId),
        );
        expect(ctx.logger.success).toHaveBeenCalled();
      },
    },
    {
      name: 'propagates generator errors with safe response',
      arrange: (ctx) => {
        ctx.invoiceRepository.addInvoice(ctx.request.userId, createInvoice());
        ctx.excelGenerator.generateExcel.mockRejectedValueOnce(new Error('disk full'));
      },
      act: (ctx) => ctx.useCase.execute(ctx.request),
      assert: (result, ctx) => {
        expect(result.success).toBe(false);
        expect(result.invoiceCount).toBe(0);
        expect(result.error).toBe('disk full');
        expect(ctx.logger.error).toHaveBeenCalled();
      },
    },
  ];

  runStrategies(createContext, strategies);
});
