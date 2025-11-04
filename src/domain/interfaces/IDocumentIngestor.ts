/**
 * IDocumentIngestor.ts
 * Interface for document download and validation
 * Follows Dependency Inversion Principle
 */

export interface IStorageResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  error?: string;
}

export interface IStorageStats {
  totalFiles: number;
  totalSizeMB: number;
  oldestFileAgeHours: number;
}

/**
 * Document Ingestor Interface
 * Any file management service must implement this
 */
export interface IDocumentIngestor {
  /**
   * Download and store file from URL
   */
  downloadAndStore(fileUrl: string, userId: number, messageId: number): Promise<IStorageResult>;

  /**
   * Delete a file from storage
   */
  deleteFile(filePath: string): Promise<void>;

  /**
   * Get storage statistics
   */
  getStorageStats(): Promise<IStorageStats>;

  /**
   * Clean up expired files
   */
  cleanupExpiredFiles(): Promise<number>;
}

