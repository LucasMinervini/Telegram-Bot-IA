/**
 * ProcessArchiveUseCase.ts
 * Use case for processing compressed archives (e.g. ZIP) containing several receipts
 * Orchestrates business logic without infrastructure details
 */

import { IVisionProcessor, ProcessingErrorCode } from '../../domain/interfaces/IVisionProcessor';
import { IDocumentIngestor } from '../../domain/interfaces/IDocumentIngestor';
import { IArchiveExtractor, IExtractedEntry, ISkippedEntry } from '../../domain/interfaces/IArchiveExtractor';
import { IInvoiceRepository } from '../../domain/interfaces/IInvoiceRepository';
import { ILogger } from '../../domain/interfaces/ILogger';
import { Invoice } from '../../domain/entities/Invoice.entity';

export interface IProcessArchiveRequest {
  fileUrl: string;
  userId: number;
  messageId: number;
  detail?: 'low' | 'high' | 'auto';
  /** Optional progress notification, called after each document finishes */
  onProgress?: (processed: number, total: number) => void | Promise<void>;
}

export interface IArchiveItemResult {
  fileName: string;
  success: boolean;
  invoice?: Invoice;
  error?: string;
  errorCode?: ProcessingErrorCode;
}

export interface IProcessArchiveResponse {
  success: boolean;
  items: IArchiveItemResult[];
  skipped: ISkippedEntry[];
  processedCount: number;
  failedCount: number;
  totalInvoices: number;
  error?: string;
  errorCode?: ProcessingErrorCode;
}

/**
 * Use Case: Process Archive
 *
 * Responsibilities:
 * 1. Download and validate the archive
 * 2. Extract supported documents
 * 3. Process each document with vision AI (bounded concurrency)
 * 4. Store invoices in session preserving archive order
 * 5. Clean up temporary files
 */
export class ProcessArchiveUseCase {
  constructor(
    private archiveIngestor: IDocumentIngestor,
    private archiveExtractor: IArchiveExtractor,
    private visionProcessor: IVisionProcessor,
    private invoiceRepository: IInvoiceRepository,
    private logger: ILogger,
    private retentionHours: number = 0,
    private concurrency: number = 3
  ) {}

  isArchive(fileName: string): boolean {
    return this.archiveExtractor.supports(fileName);
  }

  async execute(request: IProcessArchiveRequest): Promise<IProcessArchiveResponse> {
    const { fileUrl, userId, messageId, detail = 'high', onProgress } = request;
    let extractedEntries: IExtractedEntry[] = [];

    try {
      this.logger.info(`Processing archive for user ${userId}`);

      // Step 1: Download and store archive
      const storageResult = await this.archiveIngestor.downloadAndStore(fileUrl, userId, messageId);
      if (!storageResult.success || !storageResult.filePath) {
        return this.failure(userId, storageResult.error || 'Failed to download archive');
      }

      // Step 2: Extract documents
      const extraction = await this.archiveExtractor.extract(storageResult.filePath, userId, messageId);

      if (this.retentionHours === 0) {
        await this.archiveIngestor.deleteFile(storageResult.filePath);
      }

      if (!extraction.success) {
        return this.failure(userId, extraction.error || 'Failed to extract archive', extraction.skipped);
      }

      extractedEntries = extraction.entries;
      if (extractedEntries.length === 0) {
        return this.failure(
          userId,
          'El archivo comprimido no contiene comprobantes en formatos soportados',
          extraction.skipped
        );
      }

      // Step 3: Process documents with vision AI
      const items = await this.processEntries(extractedEntries, userId, messageId, detail, onProgress);

      // Step 4: Store successful invoices in archive order
      items
        .filter((item) => item.success && item.invoice)
        .forEach((item) => this.invoiceRepository.addInvoice(userId, item.invoice as Invoice));

      const processedCount = items.filter((item) => item.success).length;
      const totalInvoices = this.invoiceRepository.getInvoiceCount(userId);

      if (items.some((item) => item.errorCode === 'PROVIDER_UNAVAILABLE')) {
        this.logger.error(
          `AI provider unavailable while processing archive for user ${userId}: ` +
            `${processedCount}/${extractedEntries.length} processed before aborting`
        );
        return {
          success: false,
          items,
          skipped: extraction.skipped,
          processedCount,
          failedCount: extractedEntries.length - processedCount,
          totalInvoices,
          error: 'Servicio de IA no disponible',
          errorCode: 'PROVIDER_UNAVAILABLE',
        };
      }

      this.logger.success(
        `Archive processed for user ${userId}: ${processedCount}/${items.length} succeeded. Total: ${totalInvoices}`
      );

      return {
        success: processedCount > 0,
        items,
        skipped: extraction.skipped,
        processedCount,
        failedCount: items.length - processedCount,
        totalInvoices,
        error: processedCount > 0 ? undefined : 'No se pudo procesar ningún comprobante del archivo',
      };
    } catch (error: any) {
      this.logger.error(`Error in ProcessArchiveUseCase: ${error.message}`);
      return this.failure(userId, error.message);
    } finally {
      // Step 5: Extracted files are derived artifacts and are always removed
      await Promise.all(extractedEntries.map((entry) => this.archiveIngestor.deleteFile(entry.filePath)));
    }
  }

  /**
   * Process entries with a bounded worker pool, keeping results in input order
   */
  private async processEntries(
    entries: IExtractedEntry[],
    userId: number,
    messageId: number,
    detail: 'low' | 'high' | 'auto',
    onProgress?: (processed: number, total: number) => void | Promise<void>
  ): Promise<IArchiveItemResult[]> {
    const results: IArchiveItemResult[] = new Array(entries.length);
    let nextIndex = 0;
    let completed = 0;
    let providerUnavailable = false;

    const worker = async (): Promise<void> => {
      // Stop scheduling new documents once the provider rejects the account:
      // every remaining call would fail the same way
      while (nextIndex < entries.length && !providerUnavailable) {
        const index = nextIndex++;
        results[index] = await this.processEntry(entries[index], userId, messageId, detail);
        if (results[index].errorCode === 'PROVIDER_UNAVAILABLE') {
          providerUnavailable = true;
        }
        completed++;
        await this.notifyProgress(onProgress, completed, entries.length);
      }
    };

    const workerCount = Math.max(1, Math.min(this.concurrency, entries.length));
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    // Entries never attempted leave holes in the array
    return results.filter((result): result is IArchiveItemResult => result !== undefined);
  }

  private async processEntry(
    entry: IExtractedEntry,
    userId: number,
    messageId: number,
    detail: 'low' | 'high' | 'auto'
  ): Promise<IArchiveItemResult> {
    try {
      const result = await this.visionProcessor.processInvoiceImage({
        imagePath: entry.filePath,
        userId,
        messageId,
        detail,
      });

      if (result.success && result.invoice) {
        return { fileName: entry.originalName, success: true, invoice: result.invoice };
      }
      return {
        fileName: entry.originalName,
        success: false,
        error: result.error || 'Unknown processing error',
        errorCode: result.errorCode,
      };
    } catch (error: any) {
      this.logger.error(`Error processing archive entry ${entry.originalName}: ${error.message}`);
      return { fileName: entry.originalName, success: false, error: error.message };
    }
  }

  private async notifyProgress(
    onProgress: ((processed: number, total: number) => void | Promise<void>) | undefined,
    processed: number,
    total: number
  ): Promise<void> {
    if (!onProgress) return;
    try {
      await onProgress(processed, total);
    } catch (error: any) {
      // Progress is cosmetic; never break processing because of it
      this.logger.debug(`Progress callback failed: ${error.message}`);
    }
  }

  private failure(userId: number, error: string, skipped: ISkippedEntry[] = []): IProcessArchiveResponse {
    return {
      success: false,
      items: [],
      skipped,
      processedCount: 0,
      failedCount: 0,
      totalInvoices: this.invoiceRepository.getInvoiceCount(userId),
      error,
    };
  }
}
