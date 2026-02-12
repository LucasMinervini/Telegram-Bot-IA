import { describe, expect } from 'vitest';
import {
  IClearSessionResponse,
  IGetSessionInfoResponse,
  ManageSessionUseCase,
} from '@/application/use-cases/ManageSessionUseCase';
import { createInvoice } from './fixtures/invoiceFactory';
import { createInvoiceRepositoryDouble, InvoiceRepositoryDouble } from './fixtures/repositoryDouble';
import { createLoggerMock } from './fixtures/loggerMock';
import { runStrategies, TestStrategy } from './strategies/StrategyRunner';

interface ManageSessionContext {
  useCase: ManageSessionUseCase;
  repository: InvoiceRepositoryDouble;
  logger: ReturnType<typeof createLoggerMock>;
  userId: number;
}

const createContext = (): ManageSessionContext => {
  const repository = createInvoiceRepositoryDouble();
  const logger = createLoggerMock();
  const useCase = new ManageSessionUseCase(repository, logger);

  return {
    useCase,
    repository,
    logger,
    userId: 101,
  };
};

describe('ManageSessionUseCase (Strategy Pattern) - getSessionInfo', () => {
  const strategies: TestStrategy<ManageSessionContext, IGetSessionInfoResponse>[] = [
    {
      name: 'returns empty summary when session does not exist',
      act: (ctx) => ctx.useCase.getSessionInfo({ userId: ctx.userId }),
      assert: (result, ctx) => {
        expect(result.hasSession).toBe(false);
        expect(result.invoiceCount).toBe(0);
        expect(result.totalAmount).toBe(0);
        expect(result.currencies).toEqual([]);
        expect(result.vendorSummary.size).toBe(0);
        expect(ctx.repository.getInvoiceCount(ctx.userId)).toBe(0);
      },
    },
    {
      name: 'aggregates totals by vendor and currency',
      arrange: (ctx) => {
        ctx.repository.addInvoice(
          ctx.userId,
          createInvoice({
            totalAmount: 1500,
            vendor: { name: 'Vendor A', taxId: '30-00000000-0' },
            currency: 'ARS',
          }),
        );
        ctx.repository.addInvoice(
          ctx.userId,
          createInvoice({
            totalAmount: 500,
            vendor: { name: 'Vendor B', taxId: '30-11111111-1' },
            currency: 'USD',
          }),
        );
      },
      act: (ctx) => ctx.useCase.getSessionInfo({ userId: ctx.userId }),
      assert: (result) => {
        expect(result.hasSession).toBe(true);
        expect(result.invoiceCount).toBe(2);
        expect(result.totalAmount).toBe(2000);
        expect(result.currencies.sort()).toEqual(['ARS', 'USD']);
        expect(result.vendorSummary.get('Vendor A')).toBe(1500);
        expect(result.vendorSummary.get('Vendor B')).toBe(500);
      },
    },
  ];

  runStrategies(createContext, strategies);
});

describe('ManageSessionUseCase (Strategy Pattern) - clearSession', () => {
  const strategies: TestStrategy<ManageSessionContext, IClearSessionResponse>[] = [
    {
      name: 'returns zero cleared count when session is empty',
      act: (ctx) => ctx.useCase.clearSession({ userId: ctx.userId }),
      assert: (result, ctx) => {
        expect(result.success).toBe(true);
        expect(result.clearedCount).toBe(0);
        expect(ctx.repository.getInvoiceCount(ctx.userId)).toBe(0);
      },
    },
    {
      name: 'clears existing invoices and logs the action',
      arrange: (ctx) => {
        ctx.repository.addInvoice(ctx.userId, createInvoice({ totalAmount: 200 }));
        ctx.repository.addInvoice(ctx.userId, createInvoice({ totalAmount: 300 }));
      },
      act: (ctx) => ctx.useCase.clearSession({ userId: ctx.userId }),
      assert: (result, ctx) => {
        expect(result.success).toBe(true);
        expect(result.clearedCount).toBe(2);
        expect(ctx.repository.getInvoiceCount(ctx.userId)).toBe(0);
        expect(ctx.logger.info).toHaveBeenCalled();
      },
    },
  ];

  runStrategies(createContext, strategies);
});

describe('ManageSessionUseCase (Strategy Pattern) - getInvoiceCount', () => {
  const strategies: TestStrategy<ManageSessionContext, number>[] = [
    {
      name: 'reflects live count after adding invoices',
      arrange: (ctx) => {
        ctx.repository.addInvoice(ctx.userId, createInvoice());
        ctx.repository.addInvoice(ctx.userId, createInvoice());
      },
      act: (ctx) => ctx.useCase.getInvoiceCount(ctx.userId),
      assert: (result) => {
        expect(result).toBe(2);
      },
    },
  ];

  runStrategies(createContext, strategies);
});
