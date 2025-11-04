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

export interface IProcessingResult {
  success: boolean;
  invoice?: Invoice;
  error?: string;
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

