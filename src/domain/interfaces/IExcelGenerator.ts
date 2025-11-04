/**
 * IExcelGenerator.ts
 * Interface for Excel generation
 * Follows Dependency Inversion Principle
 */

import { Invoice } from '../entities/Invoice.entity';

/**
 * Excel Generator Interface
 * Any Excel generation service must implement this
 */
export interface IExcelGenerator {
  /**
   * Generate Excel file from invoices
   * Returns buffer ready to send
   */
  generateExcel(invoices: Invoice[]): Promise<Buffer>;

  /**
   * Generate and save Excel file to disk
   */
  generateAndSaveExcel(invoices: Invoice[], outputPath: string): Promise<void>;
}

