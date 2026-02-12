import { vi } from 'vitest';
import { IInvoiceRepository, ISession } from '@/domain/interfaces/IInvoiceRepository';
import { Invoice } from '@/domain/entities/Invoice.entity';

export interface InvoiceRepositoryDouble extends IInvoiceRepository {
  getStore(): Map<number, Invoice[]>;
}

export const createInvoiceRepositoryDouble = (): InvoiceRepositoryDouble => {
  const store = new Map<number, Invoice[]>();

  const getInvoicesInternal = (userId: number): Invoice[] => store.get(userId) ?? [];

  return {
    addInvoice: vi.fn((userId: number, invoice: Invoice) => {
      const current = getInvoicesInternal(userId);
      store.set(userId, [...current, invoice]);
    }),
    getInvoices: vi.fn((userId: number) => getInvoicesInternal(userId)),
    getInvoiceCount: vi.fn((userId: number) => getInvoicesInternal(userId).length),
    clearInvoices: vi.fn((userId: number) => {
      store.set(userId, []);
    }),
    deleteSession: vi.fn((userId: number) => {
      store.delete(userId);
    }),
    getSession: vi.fn((userId: number): ISession | undefined => {
      const invoices = getInvoicesInternal(userId);
      if (invoices.length === 0) {
        return undefined;
      }
      return {
        userId,
        invoices,
        lastActivity: new Date(),
      };
    }),
    hasSession: vi.fn((userId: number) => getInvoicesInternal(userId).length > 0),
    getActiveSessionCount: vi.fn(() => store.size),
    cleanExpiredSessions: vi.fn(() => 0),
    getStore: () => store,
  };
};
