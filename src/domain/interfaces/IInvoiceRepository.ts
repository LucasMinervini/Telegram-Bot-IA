/**
 * IInvoiceRepository.ts
 * Repository interface for invoice persistence
 * Follows Repository Pattern
 */

import { Invoice } from '../entities/Invoice.entity';

export interface ISession {
  userId: number;
  invoices: Invoice[];
  lastActivity: Date;
}

/**
 * Invoice Repository Interface
 * Abstracts persistence layer (in-memory, Redis, PostgreSQL, etc.)
 */
export interface IInvoiceRepository {
  /**
   * Add invoice to user session
   */
  addInvoice(userId: number, invoice: Invoice): void;

  /**
   * Get all invoices for a user
   */
  getInvoices(userId: number): Invoice[];

  /**
   * Get invoice count for a user
   */
  getInvoiceCount(userId: number): number;

  /**
   * Clear all invoices for a user
   */
  clearInvoices(userId: number): void;

  /**
   * Delete entire session
   */
  deleteSession(userId: number): void;

  /**
   * Get session info
   */
  getSession(userId: number): ISession | undefined;

  /**
   * Check if session exists
   */
  hasSession(userId: number): boolean;

  /**
   * Get active session count
   */
  getActiveSessionCount(): number;

  /**
   * Clean expired sessions
   */
  cleanExpiredSessions(): number;
}

