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

  constructor(config: IDocumentIngestorConfig) {
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
      // Generate unique filename
      const timestamp = Date.now();
      const extension = this.extractExtension(fileUrl);
      const fileName = `user_${userId}_msg_${messageId}_${timestamp}${extension}`;
      const filePath = path.join(this.config.tempStoragePath, fileName);

      console.log(`[FileDocumentIngestor] Downloading file from: ${fileUrl.substring(0, 50)}...`);

      // Download file with axios
      const response = await axios({
        method: 'GET',
        url: fileUrl,
        responseType: 'arraybuffer',
        timeout: 30000,
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
      const detectedExtension = this.detectFileExtension(response.data);
      if (!this.isFormatSupported(detectedExtension)) {
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
   * Detect file extension by magic bytes
   */
  private detectFileExtension(buffer: Buffer): string {
    if (!buffer || buffer.length < 4) return '';

    // Magic bytes signatures
    const signatures: Record<string, number[][]> = {
      '.jpg': [[0xFF, 0xD8, 0xFF]],
      '.jpeg': [[0xFF, 0xD8, 0xFF]],
      '.png': [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
      '.gif': [[0x47, 0x49, 0x46, 0x38]],
      '.webp': [[0x52, 0x49, 0x46, 0x46]],
      '.bmp': [[0x42, 0x4D]],
      '.tiff': [[0x49, 0x49, 0x2A, 0x00], [0x4D, 0x4D, 0x00, 0x2A]],
      '.pdf': [[0x25, 0x50, 0x44, 0x46]],
      '.docx': [[0x50, 0x4B, 0x03, 0x04]],
      '.xlsx': [[0x50, 0x4B, 0x03, 0x04]],
      '.pptx': [[0x50, 0x4B, 0x03, 0x04]],
      '.doc': [[0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]],
      '.xls': [[0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]],
      '.ppt': [[0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]],
    };

    for (const [ext, sigs] of Object.entries(signatures)) {
      for (const sig of sigs) {
        if (this.matchesSignature(buffer, sig)) {
          return ext;
        }
      }
    }

    return '';
  }

  /**
   * Check if buffer matches signature
   */
  private matchesSignature(buffer: Buffer, signature: number[]): boolean {
    if (buffer.length < signature.length) return false;

    for (let i = 0; i < signature.length; i++) {
      if (buffer[i] !== signature[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if format is supported
   */
  private isFormatSupported(extension: string): boolean {
    if (!extension) return false;
    const ext = extension.replace('.', '').toLowerCase();
    return this.config.supportedFormats.includes(ext);
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

