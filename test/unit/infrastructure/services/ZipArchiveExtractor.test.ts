/**
 * Test suite for ZipArchiveExtractor.ts
 * Validates extraction, ordering and the security controls (zip slip, zip bombs, magic bytes)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { ZipArchiveExtractor, IZipArchiveExtractorConfig } from '@/infrastructure/services/ZipArchiveExtractor';
import { createLoggerMock } from '../../application/use-cases/fixtures/loggerMock';
import { buildZip, JPEG_BYTES, PNG_BYTES, PDF_BYTES } from './fixtures/zipBuilder';

describe('ZipArchiveExtractor', () => {
  const tempPath = path.join(process.cwd(), 'test', 'temp-zip-files');
  const archivePath = path.join(tempPath, 'input.zip');
  let config: IZipArchiveExtractorConfig;
  let extractor: ZipArchiveExtractor;

  const writeArchive = async (buffer: Buffer): Promise<void> => {
    await fs.writeFile(archivePath, buffer);
  };

  beforeEach(async () => {
    await fs.ensureDir(tempPath);
    config = {
      tempStoragePath: tempPath,
      maxEntries: 30,
      maxEntrySizeMB: 10,
      maxTotalUncompressedMB: 100,
      allowedFormats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'],
    };
    extractor = new ZipArchiveExtractor(config, createLoggerMock());
  });

  afterEach(async () => {
    await fs.remove(tempPath);
  });

  describe('supports()', () => {
    it('accepts .zip regardless of case', () => {
      expect(extractor.supports('Comprobantes.ZIP')).toBe(true);
      expect(extractor.supports('comprobantes.zip')).toBe(true);
    });

    it('rejects non archive names', () => {
      expect(extractor.supports('factura.pdf')).toBe(false);
      expect(extractor.supports('')).toBe(false);
    });
  });

  describe('extract()', () => {
    it('extracts supported documents in natural order with content-based extensions', async () => {
      await writeArchive(
        buildZip([
          { name: '10_last.jpeg', data: JPEG_BYTES },
          { name: '02_second.png', data: PNG_BYTES, method: 'store' },
          { name: '01_first.pdf', data: PDF_BYTES },
        ])
      );

      const result = await extractor.extract(archivePath, 42, 7);

      expect(result.success).toBe(true);
      expect(result.entries.map((e) => e.originalName)).toEqual(['01_first.pdf', '02_second.png', '10_last.jpeg']);
      expect(path.extname(result.entries[0].filePath)).toBe('.pdf');
      expect(path.extname(result.entries[1].filePath)).toBe('.png');
      expect(await fs.readFile(result.entries[2].filePath)).toEqual(JPEG_BYTES);
    });

    it('never uses entry names as paths (zip slip)', async () => {
      await writeArchive(buildZip([{ name: '../../evil.jpg', data: JPEG_BYTES }]));

      const result = await extractor.extract(archivePath, 42, 7);

      expect(result.entries).toHaveLength(1);
      const resolved = path.resolve(result.entries[0].filePath);
      expect(resolved.startsWith(path.resolve(tempPath))).toBe(true);
      expect(path.basename(resolved)).toMatch(/^user_42_msg_7_\d+_entry_0\.jpg$/);
      expect(await fs.pathExists(path.resolve(tempPath, '..', '..', 'evil.jpg'))).toBe(false);
    });

    it('ignores OS metadata and directories, and skips unsupported content', async () => {
      await writeArchive(
        buildZip([
          { name: 'folder/', data: Buffer.alloc(0), method: 'store' },
          { name: '__MACOSX/._receipt.jpg', data: JPEG_BYTES },
          { name: '.DS_Store', data: Buffer.from('x') },
          { name: 'notes.txt', data: Buffer.from('hello') },
          { name: 'inner.zip', data: buildZip([{ name: 'a.jpg', data: JPEG_BYTES }]) },
          { name: 'fake.jpg', data: Buffer.from('MZ this is an executable') },
          { name: 'folder/receipt.jpg', data: JPEG_BYTES },
        ])
      );

      const result = await extractor.extract(archivePath, 1, 1);

      expect(result.success).toBe(true);
      expect(result.entries.map((e) => e.originalName)).toEqual(['receipt.jpg']);
      expect(result.skipped.map((s) => s.originalName).sort()).toEqual(['fake.jpg', 'inner.zip', 'notes.txt']);
    });

    it('skips password protected entries', async () => {
      await writeArchive(buildZip([{ name: 'secret.jpg', data: JPEG_BYTES, encrypted: true }]));

      const result = await extractor.extract(archivePath, 1, 1);

      expect(result.entries).toHaveLength(0);
      expect(result.skipped[0].reason).toContain('contraseña');
    });

    it('enforces the maximum number of extracted files', async () => {
      extractor = new ZipArchiveExtractor({ ...config, maxEntries: 2 }, createLoggerMock());
      await writeArchive(
        buildZip([
          { name: '1.jpg', data: JPEG_BYTES },
          { name: '2.jpg', data: JPEG_BYTES },
          { name: '3.jpg', data: JPEG_BYTES },
        ])
      );

      const result = await extractor.extract(archivePath, 1, 1);

      expect(result.entries).toHaveLength(2);
      expect(result.skipped).toEqual([expect.objectContaining({ originalName: '3.jpg' })]);
    });

    it('rejects entries whose declared size exceeds the limit before inflating', async () => {
      extractor = new ZipArchiveExtractor({ ...config, maxEntrySizeMB: 1 }, createLoggerMock());
      await writeArchive(
        buildZip([{ name: 'huge.jpg', data: Buffer.concat([JPEG_BYTES, Buffer.alloc(2 * 1024 * 1024)]) }])
      );

      const result = await extractor.extract(archivePath, 1, 1);

      expect(result.entries).toHaveLength(0);
      expect(result.skipped[0].reason).toContain('tamaño máximo');
    });

    it('caps real output when headers lie about size (zip bomb)', async () => {
      const bomb = Buffer.concat([JPEG_BYTES, Buffer.alloc(5 * 1024 * 1024)]);
      await writeArchive(buildZip([{ name: 'bomb.jpg', data: bomb, declaredSize: 100 }]));

      const result = await extractor.extract(archivePath, 1, 1);

      expect(result.entries).toHaveLength(0);
      expect(result.skipped[0].reason).toContain('dañado');
    });

    it('skips entries with a CRC mismatch', async () => {
      await writeArchive(buildZip([{ name: 'corrupt.jpg', data: JPEG_BYTES, declaredCrc: 0x1234 }]));

      const result = await extractor.extract(archivePath, 1, 1);

      expect(result.entries).toHaveLength(0);
      expect(result.skipped[0].reason).toContain('dañado');
    });

    it('fails gracefully for content that is not a ZIP', async () => {
      await writeArchive(Buffer.from('definitely not a zip archive at all'));

      const result = await extractor.extract(archivePath, 1, 1);

      expect(result.success).toBe(false);
      expect(result.error).toContain('ZIP inválido');
    });
  });
});
