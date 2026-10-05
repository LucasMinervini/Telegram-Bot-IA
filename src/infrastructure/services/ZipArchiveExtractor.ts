/**
 * ZipArchiveExtractor.ts
 * ZIP implementation of IArchiveExtractor built on Node's native zlib (no third-party parser)
 *
 * Security measures:
 * - Zip Slip: entry names are NEVER used as paths; files are written with generated names
 * - Zip bombs: declared sizes are checked before inflating and zlib's maxOutputLength
 *   caps real output, so a lying header cannot allocate more than the configured limit
 * - Integrity: CRC32 of every extracted entry is verified
 * - Content validation: entries are accepted only if their magic bytes match an allowed format
 * - Encrypted, ZIP64 and nested archives are rejected
 */

import fs from 'fs-extra';
import * as path from 'path';
import * as zlib from 'zlib';
import {
  IArchiveExtractor,
  IArchiveExtractionResult,
  IExtractedEntry,
  ISkippedEntry,
} from '../../domain/interfaces/IArchiveExtractor';
import { ILogger } from '../../domain/interfaces/ILogger';
import { FileSignatureDetector } from './FileSignatureDetector';

export interface IZipArchiveExtractorConfig {
  tempStoragePath: string;
  /** Maximum number of documents extracted from a single archive */
  maxEntries: number;
  maxEntrySizeMB: number;
  maxTotalUncompressedMB: number;
  /** Formats allowed inside the archive (without dot), e.g. ['jpg', 'png', 'pdf'] */
  allowedFormats: string[];
}

interface ICentralDirectoryEntry {
  name: string;
  flags: number;
  method: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT_SIZE = 0xffff;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;
const FLAG_ENCRYPTED = 0x1;
const FLAG_UTF8 = 0x800;
/** Hard cap on central directory records, regardless of maxEntries, to bound parsing work */
const MAX_CENTRAL_DIRECTORY_RECORDS = 1000;
const ARCHIVE_EXTENSIONS = ['.zip'];
const NESTED_ARCHIVE_EXTENSIONS = ['.zip', '.rar', '.7z', '.tar', '.gz', '.tgz', '.bz2', '.xz'];

const CRC32_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC32_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export class ZipArchiveExtractor implements IArchiveExtractor {
  constructor(
    private config: IZipArchiveExtractorConfig,
    private logger: ILogger,
    private signatureDetector: FileSignatureDetector = new FileSignatureDetector()
  ) {}

  supports(fileName: string): boolean {
    return ARCHIVE_EXTENSIONS.includes(path.extname(fileName || '').toLowerCase());
  }

  async extract(archivePath: string, userId: number, messageId: number): Promise<IArchiveExtractionResult> {
    const written: IExtractedEntry[] = [];
    const skipped: ISkippedEntry[] = [];

    try {
      await fs.ensureDir(this.config.tempStoragePath);
      const archive = await fs.readFile(archivePath);
      const centralDirectory = this.readCentralDirectory(archive);

      const candidates = centralDirectory
        .filter((entry) => !this.isIgnorable(entry.name))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

      const maxEntryBytes = this.config.maxEntrySizeMB * 1024 * 1024;
      const maxTotalBytes = this.config.maxTotalUncompressedMB * 1024 * 1024;
      let totalBytes = 0;

      for (const entry of candidates) {
        const displayName = path.posix.basename(entry.name);

        const rejection = this.validateEntryMetadata(entry, maxEntryBytes);
        if (rejection) {
          skipped.push({ originalName: displayName, reason: rejection });
          continue;
        }

        if (written.length >= this.config.maxEntries) {
          skipped.push({
            originalName: displayName,
            reason: `Límite de ${this.config.maxEntries} archivos por comprimido alcanzado`,
          });
          continue;
        }

        if (totalBytes + entry.uncompressedSize > maxTotalBytes) {
          skipped.push({
            originalName: displayName,
            reason: `Tamaño total descomprimido supera ${this.config.maxTotalUncompressedMB} MB`,
          });
          continue;
        }

        let data: Buffer;
        try {
          data = this.readEntryData(archive, entry);
        } catch (error: unknown) {
          this.logger.warn(`[ZipArchiveExtractor] Corrupted entry skipped: ${(error as Error).message}`);
          skipped.push({ originalName: displayName, reason: 'Archivo dañado dentro del comprimido' });
          continue;
        }

        const extension = this.resolveContentExtension(data);
        if (!extension) {
          skipped.push({ originalName: displayName, reason: 'El contenido no coincide con un formato soportado' });
          continue;
        }

        const filePath = this.buildOutputPath(userId, messageId, written.length, extension);
        await fs.writeFile(filePath, data);
        totalBytes += data.length;
        written.push({ originalName: displayName, filePath, sizeBytes: data.length });
      }

      this.logger.info(
        `[ZipArchiveExtractor] Extracted ${written.length} file(s), skipped ${skipped.length} for user ${userId}`
      );

      return { success: true, entries: written, skipped };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[ZipArchiveExtractor] Extraction failed: ${message}`);
      await Promise.all(written.map((entry) => fs.remove(entry.filePath).catch(() => undefined)));
      return { success: false, entries: [], skipped, error: `Archivo ZIP inválido o corrupto: ${message}` };
    }
  }

  // ---------------------------------------------------------------------------
  // ZIP structure parsing
  // ---------------------------------------------------------------------------

  private readCentralDirectory(archive: Buffer): ICentralDirectoryEntry[] {
    const eocdOffset = this.findEndOfCentralDirectory(archive);
    const totalRecords = archive.readUInt16LE(eocdOffset + 10);
    const directorySize = archive.readUInt32LE(eocdOffset + 12);
    const directoryOffset = archive.readUInt32LE(eocdOffset + 16);

    if (totalRecords === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
      throw new Error('ZIP64 no soportado');
    }
    if (totalRecords > MAX_CENTRAL_DIRECTORY_RECORDS) {
      throw new Error(`demasiadas entradas (${totalRecords})`);
    }
    if (directoryOffset + directorySize > eocdOffset) {
      throw new Error('directorio central fuera de rango');
    }

    const entries: ICentralDirectoryEntry[] = [];
    let offset = directoryOffset;

    for (let i = 0; i < totalRecords; i++) {
      if (offset + 46 > eocdOffset || archive.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
        throw new Error('registro del directorio central inválido');
      }

      const flags = archive.readUInt16LE(offset + 8);
      const nameLength = archive.readUInt16LE(offset + 28);
      const extraLength = archive.readUInt16LE(offset + 30);
      const commentLength = archive.readUInt16LE(offset + 32);
      const nameBytes = archive.subarray(offset + 46, offset + 46 + nameLength);

      entries.push({
        name: nameBytes.toString(flags & FLAG_UTF8 ? 'utf8' : 'latin1'),
        flags,
        method: archive.readUInt16LE(offset + 10),
        crc32: archive.readUInt32LE(offset + 16),
        compressedSize: archive.readUInt32LE(offset + 20),
        uncompressedSize: archive.readUInt32LE(offset + 24),
        localHeaderOffset: archive.readUInt32LE(offset + 42),
      });

      offset += 46 + nameLength + extraLength + commentLength;
    }

    return entries;
  }

  private findEndOfCentralDirectory(archive: Buffer): number {
    if (archive.length < EOCD_MIN_SIZE) {
      throw new Error('archivo demasiado pequeño');
    }
    const lowerBound = Math.max(0, archive.length - EOCD_MIN_SIZE - MAX_COMMENT_SIZE);
    for (let offset = archive.length - EOCD_MIN_SIZE; offset >= lowerBound; offset--) {
      if (archive.readUInt32LE(offset) === EOCD_SIGNATURE) {
        return offset;
      }
    }
    throw new Error('no se encontró el directorio central');
  }

  private readEntryData(archive: Buffer, entry: ICentralDirectoryEntry): Buffer {
    const headerOffset = entry.localHeaderOffset;
    if (headerOffset + 30 > archive.length || archive.readUInt32LE(headerOffset) !== LOCAL_HEADER_SIGNATURE) {
      throw new Error(`cabecera local inválida en "${entry.name}"`);
    }

    const nameLength = archive.readUInt16LE(headerOffset + 26);
    const extraLength = archive.readUInt16LE(headerOffset + 28);
    const dataStart = headerOffset + 30 + nameLength + extraLength;
    const dataEnd = dataStart + entry.compressedSize;
    if (dataEnd > archive.length) {
      throw new Error(`datos truncados en "${entry.name}"`);
    }

    const compressed = archive.subarray(dataStart, dataEnd);
    const data =
      entry.method === METHOD_STORED
        ? Buffer.from(compressed)
        : zlib.inflateRawSync(compressed, { maxOutputLength: Math.max(entry.uncompressedSize, 1) });

    if (data.length !== entry.uncompressedSize || crc32(data) !== entry.crc32) {
      throw new Error(`verificación de integridad fallida en "${entry.name}"`);
    }

    return data;
  }

  // ---------------------------------------------------------------------------
  // Entry validation
  // ---------------------------------------------------------------------------

  /** Directories and OS metadata files that are silently ignored */
  private isIgnorable(name: string): boolean {
    const baseName = path.posix.basename(name);
    return (
      name.endsWith('/') ||
      name.startsWith('__MACOSX/') ||
      baseName.startsWith('.') ||
      baseName.toLowerCase() === 'thumbs.db'
    );
  }

  /** Returns a rejection reason, or null when the entry can be extracted */
  private validateEntryMetadata(entry: ICentralDirectoryEntry, maxEntryBytes: number): string | null {
    const extension = path.posix.extname(entry.name).toLowerCase();

    if (NESTED_ARCHIVE_EXTENSIONS.includes(extension)) {
      return 'Archivos comprimidos anidados no soportados';
    }
    if (!this.config.allowedFormats.includes(extension.replace('.', ''))) {
      return `Formato no soportado (${extension || 'sin extensión'})`;
    }
    if (entry.flags & FLAG_ENCRYPTED) {
      return 'Archivo protegido con contraseña';
    }
    if (entry.method !== METHOD_STORED && entry.method !== METHOD_DEFLATE) {
      return 'Método de compresión no soportado';
    }
    if (entry.uncompressedSize === 0) {
      return 'Archivo vacío';
    }
    if (entry.uncompressedSize > maxEntryBytes) {
      return `Supera el tamaño máximo de ${this.config.maxEntrySizeMB} MB`;
    }
    return null;
  }

  /** Extension derived from the real content (magic bytes), restricted to allowed formats */
  private resolveContentExtension(data: Buffer): string | null {
    const detected = this.signatureDetector.detect(data);
    return detected.find((ext) => this.config.allowedFormats.includes(ext.replace('.', ''))) ?? null;
  }

  private buildOutputPath(userId: number, messageId: number, index: number, extension: string): string {
    const sanitizedUserId = String(userId).replace(/[^0-9]/g, '');
    const sanitizedMessageId = String(messageId).replace(/[^0-9]/g, '');
    const fileName = `user_${sanitizedUserId}_msg_${sanitizedMessageId}_${Date.now()}_entry_${index}${extension}`;
    return path.join(this.config.tempStoragePath, fileName);
  }

  /**
   * Factory method to create from environment variables
   */
  static fromEnv(logger: ILogger): ZipArchiveExtractor {
    return new ZipArchiveExtractor(
      {
        tempStoragePath: path.resolve(process.env.TEMP_STORAGE_PATH || './temp'),
        maxEntries: parseInt(process.env.ARCHIVE_MAX_FILES || '30'),
        maxEntrySizeMB: parseInt(process.env.MAX_IMAGE_SIZE_MB || '10'),
        maxTotalUncompressedMB: parseInt(process.env.ARCHIVE_MAX_TOTAL_UNCOMPRESSED_MB || '100'),
        allowedFormats: (process.env.ARCHIVE_ALLOWED_FORMATS || 'jpg,jpeg,png,gif,webp,pdf')
          .split(',')
          .map((format) => format.trim().toLowerCase()),
      },
      logger
    );
  }
}
