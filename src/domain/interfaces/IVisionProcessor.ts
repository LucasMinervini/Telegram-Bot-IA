/**
 * IVisionProcessor.ts
 * Interface for vision processing services
 * Follows Dependency Inversion Principle
 */

import { Invoice } from '../entities/Invoice.entity';

export interface IImageProcessingOptions {
  imagePath: string;
  userId: number;
  messageId: number;
  detail?: 'low' | 'high' | 'auto';
}

/**
 * PROVIDER_UNAVAILABLE: the AI provider rejects every request regardless of the
 * document (no credit, invalid/revoked API key, missing permissions). Retrying
 * other documents is pointless and only wastes time.
 */
export type ProcessingErrorCode = 'PROVIDER_UNAVAILABLE';

export interface IProcessingResult {
  success: boolean;
  invoice?: Invoice;
  error?: string;
  errorCode?: ProcessingErrorCode;
  userId: number;
  messageId: number;
}

/**
 * Vision Processor Interface
 * Any AI vision service must implement this
 */
export interface IVisionProcessor {
  /**
   * Process invoice image and extract data
   */
  processInvoiceImage(options: IImageProcessingOptions): Promise<IProcessingResult>;

  /**
   * Get the model name being used
   */
  getModelName(): string;
}

