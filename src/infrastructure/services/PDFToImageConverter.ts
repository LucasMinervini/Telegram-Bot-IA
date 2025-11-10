/**
 * PDFToImageConverter.ts -> PDFOCRExtractor.ts
 * Service to extract text from PDF files using Poppler + Tesseract.js OCR
 * Follows Single Responsibility Principle
 */

// @ts-ignore - pdf-poppler doesn't have TypeScript definitions
import { convert } from 'pdf-poppler';
import { createWorker } from 'tesseract.js';
import fs from 'fs-extra';
import path from 'path';

export interface IPDFToImageResult {
  success: boolean;
  imagePath?: string;
  extractedText?: string;
  error?: string;
}

/**
 * PDF OCR Extractor Service
 * Converts PDF to image using Poppler and extracts text using Tesseract OCR
 */
export class PDFToImageConverter {
  constructor() {}

  /**
   * Extract text from PDF using OCR
   * @param pdfPath Path to the PDF file
   * @param outputPath Not used, kept for compatibility
   * @returns Result with success status and extracted text
   */
  async convertFirstPage(pdfPath: string, outputPath?: string): Promise<IPDFToImageResult> {
    let worker: any = null;
    let tempImagePath: string | null = null;
    
    try {
      console.log(`[PDFOCRExtractor] Converting PDF to image: ${pdfPath}`);

      // Create temp directory if it doesn't exist
      const tempDir = path.join(process.cwd(), 'temp', 'pdf-ocr');
      await fs.ensureDir(tempDir);

      // Convert PDF to image using pdf-poppler with maximum quality
      const options = {
        format: 'png',
        out_dir: tempDir,
        out_prefix: path.basename(pdfPath, '.pdf'),
        page: 1, // Only first page
        scale: 4096, // Maximum resolution for best OCR accuracy (4K)
        single_file: true, // Single file output
      };

      const result = await convert(pdfPath, options);
      
      // pdf-poppler creates files like "filename-1.png"
      tempImagePath = path.join(tempDir, `${options.out_prefix}-1.png`);
      
      // Verify image was created
      if (!await fs.pathExists(tempImagePath)) {
        throw new Error('Failed to convert PDF to image');
      }
      
      console.log(`[PDFOCRExtractor] ✅ PDF converted to image: ${tempImagePath}`);
      console.log(`[PDFOCRExtractor] Running OCR with enhanced settings...`);
      
      // Initialize Tesseract worker with Spanish + English for better accuracy
      worker = await createWorker(['spa', 'eng'], 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            console.log(`[PDFOCRExtractor] OCR progress: ${Math.round(m.progress * 100)}%`);
          }
        }
      });
      
      // Set OCR parameters for better accuracy
      await worker.setParameters({
        tessedit_pageseg_mode: '1', // Automatic page segmentation with OSD
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzáéíóúñÁÉÍÓÚÑ$.,/-: ',
      });
      
      // Perform OCR with high quality settings
      const { data: { text, confidence } } = await worker.recognize(tempImagePath);
      
      console.log(`[PDFOCRExtractor] OCR confidence: ${confidence?.toFixed(2)}%`);
      
      // Terminate worker
      await worker.terminate();
      worker = null;
      
      // Clean up temporary image
      await fs.remove(tempImagePath);
      tempImagePath = null;
      
      const extractedText = text.trim();
      
      if (!extractedText) {
        console.warn('[PDFOCRExtractor] ⚠️ No text extracted via OCR');
        return {
          success: false,
          error: 'No se pudo extraer texto del PDF. Por favor, envía una imagen más clara del documento.',
        };
      }
      
      // Warn if confidence is low
      if (confidence && confidence < 60) {
        console.warn(`[PDFOCRExtractor] ⚠️ Low OCR confidence (${confidence.toFixed(2)}%). Results may be inaccurate.`);
      }
      
      console.log(`[PDFOCRExtractor] ✅ Text extracted successfully via OCR (${extractedText.length} characters)`);
      
      return {
        success: true,
        extractedText: extractedText,
      };
      
    } catch (error: any) {
      console.error('[PDFOCRExtractor] ❌ Error during PDF OCR:', error);
      
      // Cleanup on error
      if (worker) {
        try {
          await worker.terminate();
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      
      if (tempImagePath) {
        try {
          await fs.remove(tempImagePath);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      
      return {
        success: false,
        error: `Failed to extract text from PDF: ${error.message}`,
      };
    }
  }

  /**
   * Check if a file is a PDF based on extension
   * @param filePath Path to check
   * @returns true if file has .pdf extension
   */
  isPDF(filePath: string): boolean {
    return path.extname(filePath).toLowerCase() === '.pdf';
  }
}
