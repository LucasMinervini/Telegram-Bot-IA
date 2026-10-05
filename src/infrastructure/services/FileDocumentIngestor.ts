/**
 * FileDocumentIngestor.ts
 * Clean implementation of document ingestion and file management
 * Implements IDocumentIngestor interface without legacy dependencies
 * Follows Clean Architecture and SOLID principles
 */

import fs from 'fs-extra';
import * as path from 'path';
import axios from 'axios';
import { IDocumentIngestor, IStorageResult, IStorageStats } from '../../domain/interfaces/IDocumentIngestor';
import { FileSignatureDetector } from './FileSignatureDetector';

export interface IDocumentIngestorConfig {
  tempStoragePath: string;
  maxFileSizeMB: number;
  supportedFormats: string[];
  retentionHours: number;
}

/**
 * File-based Document Ingestor Implementation
 * Direct implementation without wrappers - Clean Architecture compliant
 */
export class FileDocumentIngestor implements IDocumentIngestor {
  private config: IDocumentIngestorConfig;

  constructor(
    config: IDocumentIngestorConfig,
    private signatureDetector: FileSignatureDetector = new FileSignatureDetector()
  ) {
    this.config = config;
    this.ensureTempDirectory();
  }

  /**
   * Ensure temp directory exists
   */
  private async ensureTempDirectory(): Promise<void> {
    try {
      await fs.ensureDir(this.config.tempStoragePath);
      console.log(`[FileDocumentIngestor] Temp directory verified: ${this.config.tempStoragePath}`);
    } catch (error: any) {
      console.error(`[FileDocumentIngestor] Error creating temp directory: ${error.message}`);
    }
  }

  async downloadAndStore(fileUrl: string, userId: number, messageId: number): Promise<IStorageResult> {
    try {
      // Validate and sanitize fileUrl
      if (!fileUrl || typeof fileUrl !== 'string' || fileUrl.length > 2048) {
        return {
          success: false,
          error: 'Invalid file URL provided',
        };
      }

      // Generate unique filename with sanitization
      const timestamp = Date.now();
      const extension = this.extractExtension(fileUrl);
      // Sanitize userId and messageId to prevent path injection
      const sanitizedUserId = String(userId).replace(/[^0-9]/g, '');
      const sanitizedMessageId = String(messageId).replace(/[^0-9]/g, '');
      const fileName = `user_${sanitizedUserId}_msg_${sanitizedMessageId}_${timestamp}${extension}`;
      
      // Ensure filename doesn't contain path traversal
      const safeFileName = path.basename(fileName);
      const filePath = path.join(this.config.tempStoragePath, safeFileName);
      
      // Additional security: ensure filePath is within tempStoragePath
      const resolvedFilePath = path.resolve(filePath);
      const resolvedStoragePath = path.resolve(this.config.tempStoragePath);
      if (!resolvedFilePath.startsWith(resolvedStoragePath)) {
        return {
          success: false,
          error: 'Invalid file path detected',
        };
      }

      console.log(`[FileDocumentIngestor] Downloading file from: ${fileUrl.substring(0, 50)}...`);

      // Download file with axios (optimized timeout)
      const response = await axios({
        method: 'GET',
        url: fileUrl,
        responseType: 'arraybuffer',
        timeout: parseInt(process.env.FILE_DOWNLOAD_TIMEOUT_MS || '30000'),
        maxContentLength: this.config.maxFileSizeMB * 1024 * 1024,
      });

      // Validate size
      const fileSizeMB = response.data.length / (1024 * 1024);
      if (fileSizeMB > this.config.maxFileSizeMB) {
        return {
          success: false,
          error: `File exceeds maximum size allowed (${this.config.maxFileSizeMB}MB)`,
        };
      }

      // Validate format
      const detectedExtensions = this.signatureDetector.detect(Buffer.from(response.data));
      if (!this.isFormatSupported(detectedExtensions)) {
        return {
          success: false,
          error: `Unsupported file format. Allowed formats: ${this.config.supportedFormats.join(', ')}`,
        };
      }

      // Save file
      await fs.writeFile(filePath, response.data);

      console.log(`[FileDocumentIngestor] ✅ File stored: ${fileName} (${fileSizeMB.toFixed(2)}MB)`);

      // Schedule cleanup if retention > 0
      if (this.config.retentionHours > 0) {
        this.scheduleCleanup(filePath, this.config.retentionHours);
      }

      return {
        success: true,
        filePath,
        fileName,
      };

    } catch (error: any) {
      console.error('[FileDocumentIngestor] Error downloading file:', error.message);

      if (error.code === 'ECONNABORTED') {
        return {
          success: false,
          error: 'Timeout downloading file. File may be too large.',
        };
      }

      return {
        success: false,
        error: `Error downloading file: ${error.message}`,
      };
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
        console.log(`[FileDocumentIngestor] File deleted: ${path.basename(filePath)}`);
      }
    } catch (error: any) {
      console.error(`[FileDocumentIngestor] Error deleting file ${filePath}: ${error.message}`);
    }
  }

  async getStorageStats(): Promise<IStorageStats> {
    try {
      const files = await fs.readdir(this.config.tempStoragePath);
      let totalSize = 0;
      let oldestFileAge = 0;

      for (const file of files) {
        const filePath = path.join(this.config.tempStoragePath, file);
        const stats = await fs.stat(filePath);
        totalSize += stats.size;

        const fileAgeHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
        if (fileAgeHours > oldestFileAge) {
          oldestFileAge = fileAgeHours;
        }
      }

      return {
        totalFiles: files.length,
        totalSizeMB: totalSize / (1024 * 1024),
        oldestFileAgeHours: oldestFileAge,
      };
    } catch (error: any) {
      console.error('[FileDocumentIngestor] Error getting storage stats:', error.message);
      return {
        totalFiles: 0,
        totalSizeMB: 0,
        oldestFileAgeHours: 0,
      };
    }
  }

  async cleanupExpiredFiles(): Promise<number> {
    try {
      const files = await fs.readdir(this.config.tempStoragePath);
      const now = Date.now();
      const maxAgeMs = this.config.retentionHours * 60 * 60 * 1000;
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.config.tempStoragePath, file);
        const stats = await fs.stat(filePath);
        const fileAgeMs = now - stats.mtimeMs;

        if (fileAgeMs > maxAgeMs) {
          await fs.remove(filePath);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        console.log(`[FileDocumentIngestor] Cleanup completed: ${deletedCount} files deleted`);
      }

      return deletedCount;
    } catch (error: any) {
      console.error('[FileDocumentIngestor] Error cleaning up files:', error.message);
      return 0;
    }
  }

  /**
   * Extract extension from URL
   */
  private extractExtension(url: string): string {
    const match = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
    if (match) {
      return `.${match[1].toLowerCase()}`;
    }
    return '.jpg'; // Default
  }

  /**
   * Check if any of the extensions detected by magic bytes is supported
   */
  private isFormatSupported(candidateExtensions: string[]): boolean {
    return candidateExtensions.some((extension) =>
      this.config.supportedFormats.includes(extension.replace('.', '').toLowerCase())
    );
  }

  /**
   * Schedule file cleanup
   */
  private scheduleCleanup(filePath: string, hours: number): void {
    const delayMs = hours * 60 * 60 * 1000;
    
    setTimeout(async () => {
      await this.deleteFile(filePath);
    }, delayMs);

    console.log(`[FileDocumentIngestor] Cleanup scheduled for ${path.basename(filePath)} in ${hours} hours`);
  }

  /**
   * Factory method to create from environment variables
   */
  static fromEnv(): FileDocumentIngestor {
    const config: IDocumentIngestorConfig = {
      tempStoragePath: path.resolve(process.env.TEMP_STORAGE_PATH || './temp'),
      maxFileSizeMB: parseInt(process.env.MAX_IMAGE_SIZE_MB || '10'),
      supportedFormats: (process.env.SUPPORTED_FORMATS || 'jpg,jpeg,png,gif,webp,bmp,tiff,pdf,docx,doc,xlsx,xls,pptx,ppt').split(','),
      retentionHours: parseInt(process.env.IMAGE_RETENTION_HOURS || '0'),
    };

    return new FileDocumentIngestor(config);
  }
}

