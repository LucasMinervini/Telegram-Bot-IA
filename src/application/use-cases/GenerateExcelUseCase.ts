/**
 * GenerateExcelUseCase.ts
 * Use case for generating Excel files from invoices
 * Orchestrates business logic without infrastructure details
 */

import { IExcelGenerator } from '../../domain/interfaces/IExcelGenerator';
import { IInvoiceRepository } from '../../domain/interfaces/IInvoiceRepository';
import { ILogger } from '../../domain/interfaces/ILogger';

export interface IGenerateExcelRequest {
  userId: number;
}

export interface IGenerateExcelResponse {
  success: boolean;
  excelBuffer?: Buffer;
  invoiceCount: number;
  error?: string;
}

/**
 * Use Case: Generate Excel from User Invoices
 * 
 * Responsibilities:
 * 1. Retrieve invoices from repository
 * 2. Generate Excel file
 * 3. Return buffer for sending
 */
export class GenerateExcelUseCase {
  constructor(
    private invoiceRepository: IInvoiceRepository,
    private excelGenerator: IExcelGenerator,
    private logger: ILogger
  ) {}

  async execute(request: IGenerateExcelRequest): Promise<IGenerateExcelResponse> {
    const { userId } = request;

    try {
      this.logger.info(`Generating Excel for user ${userId}`);

      // Step 1: Get invoices from repository
      const invoices = this.invoiceRepository.getInvoices(userId);

      if (invoices.length === 0) {
        this.logger.warn(`No invoices found for user ${userId}`);
        return {
          success: false,
          invoiceCount: 0,
          error: 'No invoices to generate Excel',
        };
      }

      // Step 2: Generate Excel
      const excelBuffer = await this.excelGenerator.generateExcel(invoices);

      this.logger.success(`Excel generated successfully for user ${userId} with ${invoices.length} invoice(s)`);

      return {
        success: true,
        excelBuffer,
        invoiceCount: invoices.length,
      };

    } catch (error: any) {
      this.logger.error(`Error in GenerateExcelUseCase: ${error.message}`);
      return {
        success: false,
        invoiceCount: 0,
        error: error.message,
      };
    }
  }
}

