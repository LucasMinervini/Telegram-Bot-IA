/**
 * ManageSessionUseCase.ts
 * Use case for managing user sessions
 * Orchestrates business logic without infrastructure details
 */

import { IInvoiceRepository } from '../../domain/interfaces/IInvoiceRepository';
import { ILogger } from '../../domain/interfaces/ILogger';

export interface IGetSessionInfoRequest {
  userId: number;
}

export interface IGetSessionInfoResponse {
  hasSession: boolean;
  invoiceCount: number;
  totalAmount: number;
  currencies: string[];
  vendorSummary: Map<string, number>;
}

export interface IClearSessionRequest {
  userId: number;
}

export interface IClearSessionResponse {
  success: boolean;
  clearedCount: number;
}

/**
 * Use Case: Manage User Sessions
 * 
 * Responsibilities:
 * 1. Get session information
 * 2. Clear sessions
 * 3. Calculate summaries
 */
export class ManageSessionUseCase {
  constructor(
    private invoiceRepository: IInvoiceRepository,
    private logger: ILogger
  ) {}

  /**
   * Get session information with calculated summaries
   */
  getSessionInfo(request: IGetSessionInfoRequest): IGetSessionInfoResponse {
    const { userId } = request;

    const hasSession = this.invoiceRepository.hasSession(userId);
    
    if (!hasSession) {
      return {
        hasSession: false,
        invoiceCount: 0,
        totalAmount: 0,
        currencies: [],
        vendorSummary: new Map(),
      };
    }

    const invoices = this.invoiceRepository.getInvoices(userId);
    
    // Calculate total amount
    const totalAmount = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    
    // Get unique currencies
    const currencies = [...new Set(invoices.map(inv => inv.currency))];
    
    // Calculate vendor summary
    const vendorSummary = new Map<string, number>();
    invoices.forEach(inv => {
      const vendorName = inv.vendor.name;
      const current = vendorSummary.get(vendorName) || 0;
      vendorSummary.set(vendorName, current + inv.totalAmount);
    });

    return {
      hasSession: true,
      invoiceCount: invoices.length,
      totalAmount,
      currencies,
      vendorSummary,
    };
  }

  /**
   * Clear user session
   */
  clearSession(request: IClearSessionRequest): IClearSessionResponse {
    const { userId } = request;

    const count = this.invoiceRepository.getInvoiceCount(userId);
    
    if (count === 0) {
      return {
        success: true,
        clearedCount: 0,
      };
    }

    this.invoiceRepository.clearInvoices(userId);
    this.logger.info(`Session cleared for user ${userId}. ${count} invoice(s) removed`);

    return {
      success: true,
      clearedCount: count,
    };
  }

  /**
   * Get invoice count for a user
   */
  getInvoiceCount(userId: number): number {
    return this.invoiceRepository.getInvoiceCount(userId);
  }
}

