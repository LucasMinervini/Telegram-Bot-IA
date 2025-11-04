/**
 * ProcessInvoiceUseCase.ts
 * Use case for processing invoice images
 * Orchestrates business logic without infrastructure details
 */

import { IVisionProcessor, IImageProcessingOptions, IProcessingResult } from '../../domain/interfaces/IVisionProcessor';
import { IDocumentIngestor, IStorageResult } from '../../domain/interfaces/IDocumentIngestor';
import { IInvoiceRepository } from '../../domain/interfaces/IInvoiceRepository';
import { ILogger } from '../../domain/interfaces/ILogger';
import { Invoice } from '../../domain/entities/Invoice.entity';

export interface IProcessInvoiceRequest {
  fileUrl: string;
  userId: number;
  messageId: number;
  detail?: 'low' | 'high' | 'auto';
}

export interface IProcessInvoiceResponse {
  success: boolean;
  invoice?: Invoice;
  error?: string;
  totalInvoices: number;
}

/**
 * Use Case: Process Invoice Image
 * 
 * Responsibilities:
 * 1. Download and validate file
 * 2. Process with vision AI
 * 3. Store in session
 * 4. Clean up temporary files
 */
export class ProcessInvoiceUseCase {
  constructor(
    private documentIngestor: IDocumentIngestor,
    private visionProcessor: IVisionProcessor,
    private invoiceRepository: IInvoiceRepository,
    private logger: ILogger,
    private retentionHours: number = 0
  ) {}

  async execute(request: IProcessInvoiceRequest): Promise<IProcessInvoiceResponse> {
    const { fileUrl, userId, messageId, detail = 'high' } = request;

    try {
      this.logger.info(`Processing invoice for user ${userId}`);

      // Step 1: Download and store file
      const storageResult: IStorageResult = await this.documentIngestor.downloadAndStore(
        fileUrl,
        userId,
        messageId
      );

      if (!storageResult.success || !storageResult.filePath) {
        return {
          success: false,
          error: storageResult.error || 'Failed to download file',
          totalInvoices: this.invoiceRepository.getInvoiceCount(userId),
        };
      }

      // Step 2: Process with vision AI
      const processingOptions: IImageProcessingOptions = {
        imagePath: storageResult.filePath,
        userId,
        messageId,
        detail,
      };

      const processingResult: IProcessingResult = await this.visionProcessor.processInvoiceImage(
        processingOptions
      );

      // Step 3: Clean up temporary file if configured
      if (this.retentionHours === 0) {
        await this.documentIngestor.deleteFile(storageResult.filePath);
        this.logger.debug(`Deleted temporary file: ${storageResult.filePath}`);
      }

      // Step 4: If successful, store in repository
      if (processingResult.success && processingResult.invoice) {
        this.invoiceRepository.addInvoice(userId, processingResult.invoice);
        const totalInvoices = this.invoiceRepository.getInvoiceCount(userId);

        this.logger.success(`Invoice processed successfully for user ${userId}. Total: ${totalInvoices}`);

        return {
          success: true,
          invoice: processingResult.invoice,
          totalInvoices,
        };
      }

      // Processing failed
      return {
        success: false,
        error: processingResult.error || 'Unknown processing error',
        totalInvoices: this.invoiceRepository.getInvoiceCount(userId),
      };

    } catch (error: any) {
      this.logger.error(`Error in ProcessInvoiceUseCase: ${error.message}`);
      return {
        success: false,
        error: error.message,
        totalInvoices: this.invoiceRepository.getInvoiceCount(userId),
      };
    }
  }
}

