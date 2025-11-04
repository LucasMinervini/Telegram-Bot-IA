/**
 * InMemoryInvoiceRepository.ts
 * In-memory implementation of invoice repository
 * Can be easily swapped with Redis or PostgreSQL implementation
 */

import { IInvoiceRepository, ISession } from '../../domain/interfaces/IInvoiceRepository';
import { Invoice } from '../../domain/entities/Invoice.entity';

/**
 * In-Memory Invoice Repository
 * Stores sessions in a Map with automatic cleanup
 */
export class InMemoryInvoiceRepository implements IInvoiceRepository {
  private sessions: Map<number, ISession>;
  private sessionTimeoutMs: number;
  private cleanupInterval: NodeJS.Timeout | null;

  constructor(sessionTimeoutMinutes: number = 30) {
    this.sessions = new Map();
    this.sessionTimeoutMs = sessionTimeoutMinutes * 60 * 1000;
    this.cleanupInterval = null;
    this.startCleanupTask();
  }

  addInvoice(userId: number, invoice: Invoice): void {
    let session = this.sessions.get(userId);

    if (!session) {
      session = {
        userId,
        invoices: [],
        lastActivity: new Date(),
      };
      this.sessions.set(userId, session);
    }

    session.invoices.push(invoice);
    session.lastActivity = new Date();
  }

  getInvoices(userId: number): Invoice[] {
    const session = this.sessions.get(userId);
    return session ? [...session.invoices] : [];
  }

  getInvoiceCount(userId: number): number {
    const session = this.sessions.get(userId);
    return session ? session.invoices.length : 0;
  }

  clearInvoices(userId: number): void {
    const session = this.sessions.get(userId);
    if (session) {
      session.invoices = [];
      session.lastActivity = new Date();
    }
  }

  deleteSession(userId: number): void {
    this.sessions.delete(userId);
  }

  getSession(userId: number): ISession | undefined {
    return this.sessions.get(userId);
  }

  hasSession(userId: number): boolean {
    return this.sessions.has(userId);
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  cleanExpiredSessions(): number {
    const now = new Date().getTime();
    let cleanedCount = 0;

    for (const [userId, session] of this.sessions.entries()) {
      const age = now - session.lastActivity.getTime();
      
      if (age > this.sessionTimeoutMs) {
        this.sessions.delete(userId);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Start automatic cleanup task
   */
  private startCleanupTask(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      const cleaned = this.cleanExpiredSessions();
      if (cleaned > 0) {
        console.log(`[InMemoryInvoiceRepository] Cleaned ${cleaned} expired session(s)`);
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Stop cleanup task (for graceful shutdown)
   */
  stopCleanupTask(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

