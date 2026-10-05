/**
 * IArchiveExtractor.ts
 * Interface for compressed archive extraction services
 * Follows Dependency Inversion Principle
 */

export interface IExtractedEntry {
  /** Name of the entry inside the archive (display only, never used as a path) */
  originalName: string;
  /** Absolute path of the extracted file in temp storage */
  filePath: string;
  sizeBytes: number;
}

export interface ISkippedEntry {
  originalName: string;
  reason: string;
}

export interface IArchiveExtractionResult {
  success: boolean;
  entries: IExtractedEntry[];
  skipped: ISkippedEntry[];
  error?: string;
}

/**
 * Archive Extractor Interface
 * Any archive format (zip, rar, 7z...) must implement this
 */
export interface IArchiveExtractor {
  /**
   * Whether the given file name corresponds to an archive this extractor handles
   */
  supports(fileName: string): boolean;

  /**
   * Extract supported documents from an archive stored on disk
   */
  extract(archivePath: string, userId: number, messageId: number): Promise<IArchiveExtractionResult>;
}
