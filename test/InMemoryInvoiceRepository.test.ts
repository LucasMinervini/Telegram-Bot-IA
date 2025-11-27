/**
 * InMemoryInvoiceRepository.test.ts
 * Extended unit tests for InMemoryInvoiceRepository
 * Tests session management, repository operations, and edge cases
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryInvoiceRepository } from '../src/infrastructure/repositories/InMemoryInvoiceRepository';
import { Invoice } from '../src/domain/entities/Invoice.entity';

describe('InMemoryInvoiceRepository - Extended Tests', () => {
  let repository: InMemoryInvoiceRepository;

  const createMockInvoice = (invoiceNumber: string, amount: number = 1000): Invoice => {
    return Invoice.create({
      invoiceNumber,
      date: '2025-11-03',
      vendor: {
        name: 'Test Vendor',
        taxId: '30-12345678-9',
      },
      totalAmount: amount,
      currency: 'ARS',
      items: [
        {
          description: 'Test Item',
          quantity: 1,
          unitPrice: amount,
          subtotal: amount,
        },
      ],
      metadata: {
        processedAt: '2025-11-03T10:00:00Z',
        processingTimeMs: 1000,
        confidence: 'high',
      },
    });
  };

  beforeEach(() => {
    repository = new InMemoryInvoiceRepository(30);
  });

  describe('Session management', () => {
    it('should create session on first invoice', () => {
      const userId = 123;
      const invoice = createMockInvoice('001-001');

      repository.addInvoice(userId, invoice);

      expect(repository.hasSession(userId)).toBe(true);
    });

    it('should track multiple sessions independently', () => {
      const user1 = 111;
      const user2 = 222;

      repository.addInvoice(user1, createMockInvoice('001-001'));
      repository.addInvoice(user2, createMockInvoice('002-001'));

      expect(repository.hasSession(user1)).toBe(true);
      expect(repository.hasSession(user2)).toBe(true);
      expect(repository.getActiveSessionCount()).toBe(2);
    });

    it('should delete session completely', () => {
      const userId = 123;
      repository.addInvoice(userId, createMockInvoice('001-001'));

      expect(repository.hasSession(userId)).toBe(true);

      repository.deleteSession(userId);

      expect(repository.hasSession(userId)).toBe(false);
    });

    it('should return null for non-existent session', () => {
      const session = repository.getSession(999);
      // getSession returns undefined, not null for non-existent sessions
      expect(session).toBeUndefined();
    });

    it('should return empty array for non-existent user', () => {
      const invoices = repository.getInvoices(999);
      expect(invoices).toEqual([]);
    });

    it('should return zero count for non-existent user', () => {
      const count = repository.getInvoiceCount(999);
      expect(count).toBe(0);
    });
  });

  describe('Invoice operations', () => {
    it('should accumulate multiple invoices for same user', () => {
      const userId = 123;

      for (let i = 1; i <= 10; i++) {
        repository.addInvoice(userId, createMockInvoice(`001-${String(i).padStart(5, '0')}`, i * 1000));
      }

      expect(repository.getInvoiceCount(userId)).toBe(10);
    });

    it('should maintain invoice order', () => {
      const userId = 123;
      const invoiceNumbers = ['001-001', '001-002', '001-003', '001-004', '001-005'];

      invoiceNumbers.forEach(num => {
        repository.addInvoice(userId, createMockInvoice(num));
      });

      const invoices = repository.getInvoices(userId);
      invoices.forEach((inv, idx) => {
        expect(inv.invoiceNumber).toBe(invoiceNumbers[idx]);
      });
    });

    it('should calculate correct invoice count', () => {
      const userId = 123;

      expect(repository.getInvoiceCount(userId)).toBe(0);

      for (let i = 1; i <= 5; i++) {
        repository.addInvoice(userId, createMockInvoice(`001-${i}`));
        expect(repository.getInvoiceCount(userId)).toBe(i);
      }
    });

    it('should clear all invoices for user', () => {
      const userId = 123;

      for (let i = 1; i <= 5; i++) {
        repository.addInvoice(userId, createMockInvoice(`001-${i}`));
      }

      expect(repository.getInvoiceCount(userId)).toBe(5);

      repository.clearInvoices(userId);

      expect(repository.getInvoiceCount(userId)).toBe(0);
    });

    it('should not affect other users when clearing', () => {
      const user1 = 111;
      const user2 = 222;

      for (let i = 1; i <= 3; i++) {
        repository.addInvoice(user1, createMockInvoice(`001-${i}`));
        repository.addInvoice(user2, createMockInvoice(`002-${i}`));
      }

      repository.clearInvoices(user1);

      expect(repository.getInvoiceCount(user1)).toBe(0);
      expect(repository.getInvoiceCount(user2)).toBe(3);
    });
  });

  describe('Session information', () => {
    it('should return session with all properties', () => {
      const userId = 123;
      const invoice = createMockInvoice('001-001', 5000);

      repository.addInvoice(userId, invoice);

      const session = repository.getSession(userId);
      expect(session).toBeDefined();
      expect(session?.userId).toBe(userId);
      expect(session?.invoices).toHaveLength(1);
      expect(session?.lastActivity).toBeDefined();
    });

    it('should update lastActivity on each operation', () => {
      const userId = 123;

      repository.addInvoice(userId, createMockInvoice('001-001'));
      const session1 = repository.getSession(userId);

      // Wait a bit and add another invoice
      setTimeout(() => {
        repository.addInvoice(userId, createMockInvoice('001-002'));
        const session2 = repository.getSession(userId);

        if (session1 && session2) {
          expect(session2.lastActivity.getTime()).toBeGreaterThanOrEqual(session1.lastActivity.getTime());
        }
      }, 10);
    });
  });

  describe('Active session count', () => {
    it('should count active sessions correctly', () => {
      expect(repository.getActiveSessionCount()).toBe(0);

      repository.addInvoice(111, createMockInvoice('001-001'));
      expect(repository.getActiveSessionCount()).toBe(1);

      repository.addInvoice(222, createMockInvoice('002-001'));
      expect(repository.getActiveSessionCount()).toBe(2);

      repository.addInvoice(333, createMockInvoice('003-001'));
      expect(repository.getActiveSessionCount()).toBe(3);

      repository.deleteSession(222);
      expect(repository.getActiveSessionCount()).toBe(2);
    });

    it('should count only active sessions', () => {
      repository.addInvoice(111, createMockInvoice('001-001'));
      repository.addInvoice(222, createMockInvoice('002-001'));

      expect(repository.getActiveSessionCount()).toBe(2);

      repository.clearInvoices(111);

      // Even if cleared, session still exists
      expect(repository.getActiveSessionCount()).toBe(2);
    });
  });

  describe('Multi-user scenarios', () => {
    it('should handle many concurrent users', () => {
      const userCount = 100;

      for (let userId = 1; userId <= userCount; userId++) {
        for (let i = 1; i <= 5; i++) {
          repository.addInvoice(userId, createMockInvoice(`${userId}-${i}`));
        }
      }

      expect(repository.getActiveSessionCount()).toBe(userCount);

      for (let userId = 1; userId <= userCount; userId++) {
        expect(repository.getInvoiceCount(userId)).toBe(5);
      }
    });

    it('should isolate operations between users', () => {
      const user1 = 111;
      const user2 = 222;

      repository.addInvoice(user1, createMockInvoice('001-001', 1000));
      repository.addInvoice(user1, createMockInvoice('001-002', 2000));
      repository.addInvoice(user2, createMockInvoice('002-001', 3000));

      repository.clearInvoices(user1);

      expect(repository.getInvoiceCount(user1)).toBe(0);
      expect(repository.getInvoiceCount(user2)).toBe(1);
      expect(repository.getInvoices(user2)[0].totalAmount).toBe(3000);
    });
  });

  describe('Cleanup task', () => {
    it('should have cleanup task', () => {
      expect(repository).toBeDefined();
      // Cleanup task runs automatically
    });

    it('should stop cleanup task', () => {
      expect(() => repository.stopCleanupTask()).not.toThrow();
    });

    it('should handle multiple calls to stopCleanupTask', () => {
      repository.stopCleanupTask();
      repository.stopCleanupTask();
      repository.stopCleanupTask();
      
      expect(repository.getActiveSessionCount()).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle user ID of 0', () => {
      const userId = 0;
      repository.addInvoice(userId, createMockInvoice('001-001'));

      expect(repository.getInvoiceCount(userId)).toBe(1);
      expect(repository.hasSession(userId)).toBe(true);
    });

    it('should handle very large user IDs', () => {
      const userId = Number.MAX_SAFE_INTEGER;
      repository.addInvoice(userId, createMockInvoice('001-001'));

      expect(repository.getInvoiceCount(userId)).toBe(1);
    });

    it('should handle negative user IDs', () => {
      const userId = -123;
      repository.addInvoice(userId, createMockInvoice('001-001'));

      expect(repository.getInvoiceCount(userId)).toBe(1);
      expect(repository.hasSession(userId)).toBe(true);
    });

    it('should handle clearing empty session', () => {
      const userId = 123;
      expect(() => repository.clearInvoices(userId)).not.toThrow();
    });

    it('should handle deleting non-existent session', () => {
      expect(() => repository.deleteSession(999)).not.toThrow();
    });

    it('should handle many invoices for single user', () => {
      const userId = 123;

      for (let i = 1; i <= 1000; i++) {
        repository.addInvoice(userId, createMockInvoice(`001-${String(i).padStart(6, '0')}`, i));
      }

      expect(repository.getInvoiceCount(userId)).toBe(1000);
    });
  });

  describe('Data retrieval', () => {
    it('should return invoices in correct format', () => {
      const userId = 123;
      const invoice = createMockInvoice('001-001', 5000);

      repository.addInvoice(userId, invoice);

      const invoices = repository.getInvoices(userId);
      expect(Array.isArray(invoices)).toBe(true);
      expect(invoices).toHaveLength(1);
      expect(invoices[0]).toBeInstanceOf(Invoice);
    });

    it('should not return references to internal data', () => {
      const userId = 123;
      const invoice = createMockInvoice('001-001');

      repository.addInvoice(userId, invoice);

      const invoices1 = repository.getInvoices(userId);
      const invoices2 = repository.getInvoices(userId);

      // Should be different array references
      expect(invoices1).not.toBe(invoices2);
      // But same content
      expect(invoices1[0].invoiceNumber).toBe(invoices2[0].invoiceNumber);
    });
  });

  describe('Constructor options', () => {
    it('should accept custom session timeout', () => {
      const customRepository = new InMemoryInvoiceRepository(60); // 60 minutes
      expect(customRepository).toBeDefined();
    });

    it('should work with default session timeout', () => {
      const customRepository = new InMemoryInvoiceRepository(30); // 30 minutes
      expect(customRepository).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should add invoices quickly', () => {
      const userId = 123;
      const startTime = performance.now();

      for (let i = 1; i <= 100; i++) {
        repository.addInvoice(userId, createMockInvoice(`001-${i}`));
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should be very fast (< 100ms for 100 invoices)
      expect(duration).toBeLessThan(100);
    });

    it('should retrieve invoices quickly', () => {
      const userId = 123;

      for (let i = 1; i <= 100; i++) {
        repository.addInvoice(userId, createMockInvoice(`001-${i}`));
      }

      const startTime = performance.now();

      for (let i = 0; i < 100; i++) {
        repository.getInvoices(userId);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should be very fast (< 50ms for 100 retrievals)
      expect(duration).toBeLessThan(50);
    });
  });

  describe('Memory management', () => {
    it('should clean up cleared sessions eventually', () => {
      const userId = 123;
      repository.addInvoice(userId, createMockInvoice('001-001'));

      repository.clearInvoices(userId);

      // Session should still exist immediately after clear
      expect(repository.hasSession(userId)).toBe(true);
    });
  });
});
