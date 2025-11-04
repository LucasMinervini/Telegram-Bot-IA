/**
 * Test suite para DocumentIngestor.ts
 * Valida descarga, validación y gestión de archivos temporales
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileDocumentIngestor } from '../src/infrastructure/services/FileDocumentIngestor';
import type { IDocumentIngestorConfig, IStorageResult } from '../src/domain/interfaces/IDocumentIngestor';
import fs from 'fs-extra';
import axios from 'axios';
import path from 'path';

// Mock de axios
vi.mock('axios');

describe('DocumentIngestor', () => {
  let ingestor: FileDocumentIngestor;
  let testConfig: IDocumentIngestorConfig;
  const testTempPath = path.join(process.cwd(), 'test', 'temp-test-files');

  beforeEach(async () => {
    testConfig = {
      tempStoragePath: testTempPath,
      maxFileSizeMB: 10,
      supportedFormats: ['jpg', 'jpeg', 'png', 'pdf', 'docx'],
      retentionHours: 0,
    };

    // Asegurar que el directorio de prueba existe
    await fs.ensureDir(testTempPath);

    ingestor = new FileDocumentIngestor(testConfig);
  });

  afterEach(async () => {
    // Limpiar archivos de prueba
    if (await fs.pathExists(testTempPath)) {
      await fs.remove(testTempPath);
    }
    vi.clearAllMocks();
  });

  describe('Constructor y ensureTempDirectory', () => {
    it('debería crear el directorio temporal si no existe', async () => {
      const newPath = path.join(testTempPath, 'new-dir');
      const config = { ...testConfig, tempStoragePath: newPath };

      new FileDocumentIngestor(config);

      // Esperar un momento para que se ejecute el ensure
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(await fs.pathExists(newPath)).toBe(true);

      await fs.remove(newPath);
    });
  });

  describe('downloadAndStore', () => {
    const mockImageBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]); // JPG magic bytes

    beforeEach(() => {
      // Mock de axios por defecto
      (axios as any).mockResolvedValue({
        data: mockImageBuffer,
      });
    });

    it('debería descargar y almacenar archivo correctamente', async () => {
      const fileUrl = 'https://example.com/test.jpg';
      const userId = 12345;
      const messageId = 67890;

      const result = await ingestor.downloadAndStore(fileUrl, userId, messageId);

      expect(result.success).toBe(true);
      expect(result.filePath).toBeDefined();
      expect(result.fileName).toBeDefined();
      expect(result.fileName).toContain(`user_${userId}`);
      expect(result.fileName).toContain(`msg_${messageId}`);
    });

    it('debería crear archivo en el filesystem', async () => {
      const fileUrl = 'https://example.com/test.jpg';
      const userId = 12345;
      const messageId = 67890;

      const result = await ingestor.downloadAndStore(fileUrl, userId, messageId);

      if (result.success && result.filePath) {
        expect(await fs.pathExists(result.filePath)).toBe(true);
      }
    });

    it('debería extraer extensión de la URL', async () => {
      const fileUrl = 'https://example.com/test.pdf';
      const userId = 12345;
      const messageId = 67890;

      // Mock para PDF
      const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46]); // PDF magic bytes
      (axios as any).mockResolvedValue({ data: pdfBuffer });

      const result = await ingestor.downloadAndStore(fileUrl, userId, messageId);

      expect(result.success).toBe(true);
      expect(result.fileName).toContain('.pdf');
    });

    it('debería rechazar archivo que excede tamaño máximo', async () => {
      const fileUrl = 'https://example.com/large.jpg';
      const userId = 12345;
      const messageId = 67890;

      // Mock de archivo muy grande
      const largeBuffer = Buffer.alloc(15 * 1024 * 1024); // 15MB (excede el límite de 10MB)
      (axios as any).mockResolvedValue({ data: largeBuffer });

      const result = await ingestor.downloadAndStore(fileUrl, userId, messageId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maximum size');
    });

    it('debería rechazar formato no soportado', async () => {
      const fileUrl = 'https://example.com/test.exe';
      const userId = 12345;
      const messageId = 67890;

      // Mock de archivo con magic bytes no soportados
      const exeBuffer = Buffer.from([0x4D, 0x5A]); // EXE magic bytes
      (axios as any).mockResolvedValue({ data: exeBuffer });

      const result = await ingestor.downloadAndStore(fileUrl, userId, messageId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported file format');
    });

    it('debería manejar timeout en la descarga', async () => {
      const fileUrl = 'https://example.com/test.jpg';
      const userId = 12345;
      const messageId = 67890;

      // Mock de timeout
      const error: any = new Error('timeout');
      error.code = 'ECONNABORTED';
      (axios as any).mockRejectedValue(error);

      const result = await ingestor.downloadAndStore(fileUrl, userId, messageId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Timeout');
    });

    it('debería manejar error de red genérico', async () => {
      const fileUrl = 'https://example.com/test.jpg';
      const userId = 12345;
      const messageId = 67890;

      (axios as any).mockRejectedValue(new Error('Network error'));

      const result = await ingestor.downloadAndStore(fileUrl, userId, messageId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Error downloading file');
    });

    it('debería llamar a axios con configuración correcta', async () => {
      const fileUrl = 'https://example.com/test.jpg';
      const userId = 12345;
      const messageId = 67890;

      await ingestor.downloadAndStore(fileUrl, userId, messageId);

      expect(axios).toHaveBeenCalledWith({
        method: 'GET',
        url: fileUrl,
        responseType: 'arraybuffer',
        timeout: 30000,
        maxContentLength: 10 * 1024 * 1024,
      });
    });
  });

  // Nota: storeBuffer() no existe en la implementación actual
  // La funcionalidad se maneja dentro de downloadAndStore()
  // Tests removidos para coincidir con la API real

  describe('deleteFile', () => {
    it('debería eliminar archivo existente', async () => {
      // Crear archivo de prueba directamente
      const testFilePath = path.join(testTempPath, 'test-file.jpg');
      await fs.writeFile(testFilePath, Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]));

      expect(await fs.pathExists(testFilePath)).toBe(true);

      // Eliminar archivo
      await ingestor.deleteFile(testFilePath);

      expect(await fs.pathExists(testFilePath)).toBe(false);
    });

    it('no debería generar error al eliminar archivo inexistente', async () => {
      const fakePath = path.join(testTempPath, 'nonexistent.jpg');

      await expect(ingestor.deleteFile(fakePath)).resolves.not.toThrow();
    });
  });

  describe('getStorageStats', () => {
    it('debería retornar estadísticas de almacenamiento', async () => {
      // Crear algunos archivos directamente
      const buffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      await fs.writeFile(path.join(testTempPath, 'test1.jpg'), buffer);
      await fs.writeFile(path.join(testTempPath, 'test2.jpg'), buffer);
      await fs.writeFile(path.join(testTempPath, 'test3.jpg'), buffer);

      const stats = await ingestor.getStorageStats();

      expect(stats.totalFiles).toBeGreaterThanOrEqual(3);
      expect(stats.totalSizeMB).toBeGreaterThan(0);
    });

    it('debería retornar ceros para directorio vacío', async () => {
      // Limpiar directorio
      await fs.emptyDir(testTempPath);

      const stats = await ingestor.getStorageStats();

      expect(stats.totalFiles).toBe(0);
      expect(stats.totalSizeMB).toBe(0);
    });
  });

  // Nota: Tests de detección de tipo se realizan a través de downloadAndStore()
  // Los tests anteriores ya cubren esta funcionalidad

  describe('Generación de nombres de archivo', () => {
    it('debería generar nombres únicos en downloadAndStore', async () => {
      const buffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      (axios as any).mockResolvedValue({ data: buffer });

      const result1 = await ingestor.downloadAndStore('https://example.com/test1.jpg', 11111, 1);
      const result2 = await ingestor.downloadAndStore('https://example.com/test2.jpg', 22222, 1);

      expect(result1.fileName).not.toBe(result2.fileName);
      expect(result1.fileName).toContain('user_11111');
      expect(result2.fileName).toContain('user_22222');
    });
  });

  describe('Configuración personalizada', () => {
    it('debería respetar maxFileSizeMB configurado', async () => {
      const smallLimitConfig = { ...testConfig, maxFileSizeMB: 1 };
      const smallIngestor = new FileDocumentIngestor(smallLimitConfig);

      const buffer = Buffer.alloc(2 * 1024 * 1024); // 2MB
      (axios as any).mockResolvedValue({ data: buffer });

      const result = await smallIngestor.downloadAndStore('https://example.com/large.jpg', 1, 1);

      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maximum size');
    });

    it('debería respetar supportedFormats configurados', async () => {
      const limitedFormatsConfig = {
        ...testConfig,
        supportedFormats: ['jpg', 'jpeg'],
      };
      const limitedIngestor = new FileDocumentIngestor(limitedFormatsConfig);

      const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      (axios as any).mockResolvedValue({ data: pdfBuffer });

      const result = await limitedIngestor.downloadAndStore('https://example.com/file.pdf', 1, 1);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported file format');
    });
  });

  describe('Edge Cases', () => {
    it('debería manejar IDs de usuario/mensaje negativos', async () => {
      const buffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      (axios as any).mockResolvedValue({ data: buffer });

      const result = await ingestor.downloadAndStore('https://example.com/test.jpg', -1, -1);

      expect(result.success).toBe(true);
      expect(result.fileName).toContain('user_-1');
    });
  });
});

