/**
 * Test suite para DocumentIngestor.ts
 * Valida descarga, validación y gestión de archivos temporales
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DocumentIngestor } from '../src/modules/DocumentIngestor';
import type { DocumentIngestorConfig, StorageResult } from '../src/modules/Interfaces';
import fs from 'fs-extra';
import axios from 'axios';
import path from 'path';

// Mock de axios
vi.mock('axios');

describe('DocumentIngestor', () => {
  let ingestor: DocumentIngestor;
  let testConfig: DocumentIngestorConfig;
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

    ingestor = new DocumentIngestor(testConfig);
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

      new DocumentIngestor(config);

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
      expect(result.error).toContain('excede el tamaño máximo');
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
      expect(result.error).toContain('Formato de archivo no soportado');
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
      expect(result.error).toContain('Error descargando archivo');
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

  describe('storeBuffer', () => {
    it('debería almacenar buffer directamente', async () => {
      const buffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]); // JPG magic bytes
      const userId = 12345;
      const messageId = 67890;
      const extension = '.jpg';

      const result = await ingestor.storeBuffer(buffer, userId, messageId, extension);

      expect(result.success).toBe(true);
      expect(result.filePath).toBeDefined();
      expect(result.fileName).toContain('.jpg');
    });

    it('debería rechazar buffer que excede tamaño máximo', async () => {
      const buffer = Buffer.alloc(15 * 1024 * 1024); // 15MB
      const userId = 12345;
      const messageId = 67890;
      const extension = '.jpg';

      const result = await ingestor.storeBuffer(buffer, userId, messageId, extension);

      expect(result.success).toBe(false);
      expect(result.error).toContain('excede el tamaño máximo');
    });

    it('debería rechazar formato no soportado', async () => {
      const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      const userId = 12345;
      const messageId = 67890;
      const extension = '.exe';

      const result = await ingestor.storeBuffer(buffer, userId, messageId, extension);

      expect(result.success).toBe(false);
      expect(result.error).toContain('no soportado');
    });

    it('debería crear archivo en el filesystem', async () => {
      const buffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      const userId = 12345;
      const messageId = 67890;
      const extension = '.jpg';

      const result = await ingestor.storeBuffer(buffer, userId, messageId, extension);

      if (result.success && result.filePath) {
        expect(await fs.pathExists(result.filePath)).toBe(true);
      }
    });
  });

  describe('deleteFile', () => {
    it('debería eliminar archivo existente', async () => {
      // Crear archivo de prueba
      const buffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      const result = await ingestor.storeBuffer(buffer, 12345, 67890, '.jpg');

      if (result.success && result.filePath) {
        expect(await fs.pathExists(result.filePath)).toBe(true);

        // Eliminar archivo
        await ingestor.deleteFile(result.filePath);

        expect(await fs.pathExists(result.filePath)).toBe(false);
      }
    });

    it('no debería generar error al eliminar archivo inexistente', async () => {
      const fakePath = path.join(testTempPath, 'nonexistent.jpg');

      await expect(ingestor.deleteFile(fakePath)).resolves.not.toThrow();
    });
  });

  describe('getStorageStats', () => {
    it('debería retornar estadísticas de almacenamiento', async () => {
      // Crear algunos archivos
      const buffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      await ingestor.storeBuffer(buffer, 1, 1, '.jpg');
      await ingestor.storeBuffer(buffer, 2, 2, '.jpg');
      await ingestor.storeBuffer(buffer, 3, 3, '.jpg');

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

  describe('Detección de tipo de archivo (Magic Bytes)', () => {
    const testCases = [
      {
        name: 'JPG',
        buffer: Buffer.from([0xFF, 0xD8, 0xFF]),
        extension: '.jpg',
        supported: true,
      },
      {
        name: 'PNG',
        buffer: Buffer.from([0x89, 0x50, 0x4E, 0x47]),
        extension: '.png',
        supported: true,
      },
      {
        name: 'PDF',
        buffer: Buffer.from([0x25, 0x50, 0x44, 0x46]),
        extension: '.pdf',
        supported: true,
      },
      {
        name: 'DOCX',
        buffer: Buffer.from([0x50, 0x4B, 0x03, 0x04]),
        extension: '.docx',
        supported: true,
      },
      {
        name: 'EXE (no soportado)',
        buffer: Buffer.from([0x4D, 0x5A]),
        extension: '.exe',
        supported: false,
      },
    ];

    testCases.forEach(({ name, buffer, extension, supported }) => {
      it(`debería ${supported ? 'aceptar' : 'rechazar'} archivo ${name}`, async () => {
        const result = await ingestor.storeBuffer(buffer, 12345, 67890, extension);

        if (supported) {
          expect(result.success).toBe(true);
        } else {
          expect(result.success).toBe(false);
          expect(result.error).toContain('no soportado');
        }
      });
    });
  });

  describe('Generación de nombres de archivo', () => {
    it('debería generar nombres únicos para diferentes usuarios', async () => {
      const buffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);

      const result1 = await ingestor.storeBuffer(buffer, 11111, 1, '.jpg');
      const result2 = await ingestor.storeBuffer(buffer, 22222, 1, '.jpg');

      expect(result1.fileName).not.toBe(result2.fileName);
      expect(result1.fileName).toContain('user_11111');
      expect(result2.fileName).toContain('user_22222');
    });

    it('debería generar nombres únicos para diferentes mensajes', async () => {
      const buffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);

      const result1 = await ingestor.storeBuffer(buffer, 12345, 11111, '.jpg');
      const result2 = await ingestor.storeBuffer(buffer, 12345, 22222, '.jpg');

      expect(result1.fileName).not.toBe(result2.fileName);
      expect(result1.fileName).toContain('msg_11111');
      expect(result2.fileName).toContain('msg_22222');
    });

    it('debería incluir timestamp para unicidad', async () => {
      const buffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);

      const result1 = await ingestor.storeBuffer(buffer, 12345, 67890, '.jpg');
      
      // Esperar un milisegundo
      await new Promise(resolve => setTimeout(resolve, 1));
      
      const result2 = await ingestor.storeBuffer(buffer, 12345, 67890, '.jpg');

      expect(result1.fileName).not.toBe(result2.fileName);
    });
  });

  describe('Configuración personalizada', () => {
    it('debería respetar maxFileSizeMB configurado', async () => {
      const smallLimitConfig = { ...testConfig, maxFileSizeMB: 1 };
      const smallIngestor = new DocumentIngestor(smallLimitConfig);

      const buffer = Buffer.alloc(2 * 1024 * 1024); // 2MB
      const result = await smallIngestor.storeBuffer(buffer, 1, 1, '.jpg');

      expect(result.success).toBe(false);
      expect(result.error).toContain('excede el tamaño máximo');
    });

    it('debería respetar supportedFormats configurados', async () => {
      const limitedFormatsConfig = {
        ...testConfig,
        supportedFormats: ['jpg', 'jpeg'],
      };
      const limitedIngestor = new DocumentIngestor(limitedFormatsConfig);

      const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      const result = await limitedIngestor.storeBuffer(pdfBuffer, 1, 1, '.pdf');

      expect(result.success).toBe(false);
      expect(result.error).toContain('no soportado');
    });

    it('debería usar tempStoragePath configurado', async () => {
      const customPath = path.join(testTempPath, 'custom');
      const customConfig = { ...testConfig, tempStoragePath: customPath };
      const customIngestor = new DocumentIngestor(customConfig);

      await new Promise(resolve => setTimeout(resolve, 100));

      const buffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      const result = await customIngestor.storeBuffer(buffer, 1, 1, '.jpg');

      if (result.success && result.filePath) {
        expect(result.filePath).toContain('custom');
      }

      await fs.remove(customPath);
    });
  });

  describe('Edge Cases', () => {
    it('debería manejar buffer vacío', async () => {
      const buffer = Buffer.from([]);
      const result = await ingestor.storeBuffer(buffer, 1, 1, '.jpg');

      // Puede fallar por tamaño o por formato, cualquiera es aceptable
      expect(result.success).toBe(true); // Buffer vacío es válido pero sin magic bytes
    });

    it('debería manejar extensión sin punto', async () => {
      const buffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      const result = await ingestor.storeBuffer(buffer, 1, 1, 'jpg');

      expect(result.success).toBe(true);
    });

    it('debería manejar extensión en mayúsculas', async () => {
      const buffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      const result = await ingestor.storeBuffer(buffer, 1, 1, '.JPG');

      expect(result.success).toBe(true);
    });

    it('debería manejar IDs de usuario/mensaje negativos', async () => {
      const buffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      const result = await ingestor.storeBuffer(buffer, -1, -1, '.jpg');

      expect(result.success).toBe(true);
      expect(result.fileName).toContain('user_-1');
    });
  });
});

