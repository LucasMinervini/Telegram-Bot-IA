/**
 * Test suite para VisionProcessor.ts
 * Valida procesamiento de imágenes con GPT-4 Vision (mocked)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenAIVisionProcessor } from '../src/infrastructure/services/OpenAIVisionProcessor';
import type { IVisionProcessorConfig, IIImageProcessingOptions } from '../src/domain/interfaces/IVisionProcessor';
import fs from 'fs-extra';
import path from 'path';
import OpenAI from 'openai';

// Mock de OpenAI
vi.mock('openai');

describe('VisionProcessor', () => {
  let processor: OpenAIVisionProcessor;
  let config: IVisionProcessorConfig;
  let mockOpenAI: any;
  const testTempPath = path.join(process.cwd(), 'test', 'temp-vision-test');
  const testImagePath = path.join(testTempPath, 'test-image.jpg');

  beforeEach(async () => {
    config = {
      apiKey: 'test-api-key',
      model: 'gpt-4o-mini',
      maxTokens: 2000,
      temperature: 0.1,
    };

    // Crear directorio y archivo de prueba
    await fs.ensureDir(testTempPath);
    await fs.writeFile(testImagePath, Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]));

    // Mock de OpenAI
    mockOpenAI = {
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
    };

    (OpenAI as any).mockImplementation(() => mockOpenAI);

    // Desactivar modo demo
    delete process.env.DEMO_MODE;
  });

  afterEach(async () => {
    // Limpiar archivos de prueba
    if (await fs.pathExists(testTempPath)) {
      await fs.remove(testTempPath);
    }
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('debería crear instancia con configuración válida', () => {
      processor = new OpenAIVisionProcessor(config);
      expect(processor).toBeInstanceOf(VisionProcessor);
    });

    it('debería usar configuración por defecto para campos opcionales', () => {
      const minimalConfig = {
        apiKey: 'test-key',
        model: 'gpt-4o-mini',
      };
      processor = new OpenAIVisionProcessor(minimalConfig);
      expect(processor).toBeInstanceOf(VisionProcessor);
    });

    it('debería activar modo demo cuando DEMO_MODE=true', () => {
      process.env.DEMO_MODE = 'true';
      processor = new OpenAIVisionProcessor(config);
      expect(processor).toBeInstanceOf(VisionProcessor);
    });

    it('debería activar modo demo cuando DEMO_MODE=1', () => {
      process.env.DEMO_MODE = '1';
      processor = new OpenAIVisionProcessor(config);
      expect(processor).toBeInstanceOf(VisionProcessor);
    });
  });

  describe('processInvoiceImage', () => {
    beforeEach(() => {
      processor = new OpenAIVisionProcessor(config);

      // Mock de respuesta exitosa de OpenAI
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                invoiceNumber: '001-00001234',
                date: '2025-11-03',
                operationType: 'Transferencia',
                vendor: {
                  name: 'Banco Test',
                  taxId: '30-12345678-9',
                  cvu: '0000003100010123456789',
                },
                totalAmount: 15750.00,
                currency: 'ARS',
                receiverBank: 'Banco Test',
                items: [
                  {
                    description: 'Transferencia',
                    quantity: 1,
                    unitPrice: 15750.00,
                    subtotal: 15750.00,
                  },
                ],
                metadata: {
                  processedAt: new Date().toISOString(),
                  processingTimeMs: 5000,
                  confidence: 'high',
                  model: 'gpt-4o-mini',
                },
              }),
            },
          },
        ],
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
    });

    it('debería procesar imagen exitosamente', async () => {
      const options: IImageProcessingOptions = {
        imagePath: testImagePath,
        userId: 12345,
        messageId: 67890,
      };

      const result = await processor.processInvoiceImage(options);

      expect(result.success).toBe(true);
      expect(result.invoice).toBeDefined();
      expect(result.invoice?.invoiceNumber).toBe('001-00001234');
    });

    it('debería llamar a OpenAI con los parámetros correctos', async () => {
      const options: IImageProcessingOptions = {
        imagePath: testImagePath,
        userId: 12345,
        messageId: 67890,
      };

      await processor.processInvoiceImage(options);

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o-mini',
          max_tokens: 2000,
          temperature: 0.1,
        })
      );
    });

    it('debería incluir sistema prompt correcto', async () => {
      const options: IImageProcessingOptions = {
        imagePath: testImagePath,
        userId: 12345,
        messageId: 67890,
      };

      await processor.processInvoiceImage(options);

      const call = mockOpenAI.chat.completions.create.mock.calls[0][0];
      expect(call.messages[0].role).toBe('system');
      expect(call.messages[0].content).toContain('experto en análisis de documentos');
    });

    it('debería incluir imagen en base64', async () => {
      const options: IImageProcessingOptions = {
        imagePath: testImagePath,
        userId: 12345,
        messageId: 67890,
      };

      await processor.processInvoiceImage(options);

      const call = mockOpenAI.chat.completions.create.mock.calls[0][0];
      const userMessage = call.messages[1];

      expect(userMessage.role).toBe('user');
      expect(userMessage.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'text' }),
          expect.objectContaining({ type: 'image_url' }),
        ])
      );
    });

    it('debería retornar error si imagen no existe', async () => {
      const options: IImageProcessingOptions = {
        imagePath: path.join(testTempPath, 'nonexistent.jpg'),
        userId: 12345,
        messageId: 67890,
      };

      const result = await processor.processInvoiceImage(options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('no existe');
    });

    it('debería manejar error de OpenAI API', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(
        new Error('API Error')
      );

      const options: IImageProcessingOptions = {
        imagePath: testImagePath,
        userId: 12345,
        messageId: 67890,
      };

      const result = await processor.processInvoiceImage(options);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('debería manejar respuesta JSON inválida de OpenAI', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: 'Invalid JSON content',
            },
          },
        ],
      });

      const options: IImageProcessingOptions = {
        imagePath: testImagePath,
        userId: 12345,
        messageId: 67890,
      };

      const result = await processor.processInvoiceImage(options);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('debería validar datos con Zod schema', async () => {
      // Mock con datos inválidos (sin campos requeridos)
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                // Sin invoiceNumber ni otros campos requeridos
                someInvalidField: 'value',
              }),
            },
          },
        ],
      });

      const options: IImageProcessingOptions = {
        imagePath: testImagePath,
        userId: 12345,
        messageId: 67890,
      };

      const result = await processor.processInvoiceImage(options);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('debería incluir userId y messageId en el resultado', async () => {
      const options: IImageProcessingOptions = {
        imagePath: testImagePath,
        userId: 99999,
        messageId: 11111,
      };

      const result = await processor.processInvoiceImage(options);

      expect(result.userId).toBe(99999);
      expect(result.messageId).toBe(11111);
    });

    it('debería soportar diferentes formatos de imagen', async () => {
      const formats = [
        { ext: '.jpg', mime: 'image/jpeg' },
        { ext: '.png', mime: 'image/png' },
        { ext: '.webp', mime: 'image/webp' },
        { ext: '.gif', mime: 'image/gif' },
      ];

      for (const { ext, mime } of formats) {
        const filePath = path.join(testTempPath, `test${ext}`);
        await fs.writeFile(filePath, Buffer.from([0x00, 0x01, 0x02]));

        const options: IImageProcessingOptions = {
          imagePath: filePath,
          userId: 12345,
          messageId: 67890,
        };

        const result = await processor.processInvoiceImage(options);

        // Debería intentar procesar (puede fallar en validación pero no en tipo MIME)
        expect(result).toBeDefined();
      }
    });

    it('debería incluir detail level cuando está especificado', async () => {
      const options: IImageProcessingOptions = {
        imagePath: testImagePath,
        userId: 12345,
        messageId: 67890,
        detail: 'high',
      };

      await processor.processInvoiceImage(options);

      const call = mockOpenAI.chat.completions.create.mock.calls[0][0];
      const userMessage = call.messages[1];
      const imageContent = userMessage.content.find((c: any) => c.type === 'image_url');

      expect(imageContent.image_url.detail).toBe('high');
    });
  });

  describe('Modo Demo', () => {
    it('debería retornar datos simulados en modo demo', async () => {
      process.env.DEMO_MODE = 'true';
      processor = new OpenAIVisionProcessor(config);

      const options: IImageProcessingOptions = {
        imagePath: testImagePath,
        userId: 12345,
        messageId: 67890,
      };

      const result = await processor.processInvoiceImage(options);

      expect(result.success).toBe(true);
      expect(result.invoice).toBeDefined();
      expect(result.invoice?.invoiceNumber).toContain('DEMO');
    });

    it('no debería llamar a OpenAI API en modo demo', async () => {
      process.env.DEMO_MODE = 'true';
      processor = new OpenAIVisionProcessor(config);

      const options: IImageProcessingOptions = {
        imagePath: testImagePath,
        userId: 12345,
        messageId: 67890,
      };

      await processor.processInvoiceImage(options);

      expect(mockOpenAI.chat.completions.create).not.toHaveBeenCalled();
    });

    it('debería generar diferentes datos simulados para diferentes usuarios', async () => {
      process.env.DEMO_MODE = 'true';
      processor = new OpenAIVisionProcessor(config);

      const options1: IImageProcessingOptions = {
        imagePath: testImagePath,
        userId: 11111,
        messageId: 1,
      };

      const options2: IImageProcessingOptions = {
        imagePath: testImagePath,
        userId: 22222,
        messageId: 2,
      };

      const result1 = await processor.processInvoiceImage(options1);
      const result2 = await processor.processInvoiceImage(options2);

      expect(result1.invoice?.totalAmount).not.toBe(result2.invoice?.totalAmount);
    });
  });

  describe('Manejo de errores', () => {
    beforeEach(() => {
      processor = new OpenAIVisionProcessor(config);
    });

    it('debería manejar error de rate limit', async () => {
      const error: any = new Error('Rate limit exceeded');
      error.status = 429;
      mockOpenAI.chat.completions.create.mockRejectedValue(error);

      const options: IImageProcessingOptions = {
        imagePath: testImagePath,
        userId: 12345,
        messageId: 67890,
      };

      const result = await processor.processInvoiceImage(options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit');
    });

    it('debería manejar error de API key inválida', async () => {
      const error: any = new Error('Invalid API key');
      error.status = 401;
      mockOpenAI.chat.completions.create.mockRejectedValue(error);

      const options: IImageProcessingOptions = {
        imagePath: testImagePath,
        userId: 12345,
        messageId: 67890,
      };

      const result = await processor.processInvoiceImage(options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('API key');
    });

    it('debería manejar timeout', async () => {
      const error: any = new Error('Request timeout');
      error.code = 'ETIMEDOUT';
      mockOpenAI.chat.completions.create.mockRejectedValue(error);

      const options: IImageProcessingOptions = {
        imagePath: testImagePath,
        userId: 12345,
        messageId: 67890,
      };

      const result = await processor.processInvoiceImage(options);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('debería manejar respuesta vacía de OpenAI', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [],
      });

      const options: IImageProcessingOptions = {
        imagePath: testImagePath,
        userId: 12345,
        messageId: 67890,
      };

      const result = await processor.processInvoiceImage(options);

      expect(result.success).toBe(false);
    });

    it('debería manejar respuesta sin content', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {},
          },
        ],
      });

      const options: IImageProcessingOptions = {
        imagePath: testImagePath,
        userId: 12345,
        messageId: 67890,
      };

      const result = await processor.processInvoiceImage(options);

      expect(result.success).toBe(false);
    });
  });

  describe('Validación de schema Zod', () => {
    beforeEach(() => {
      processor = new OpenAIVisionProcessor(config);
    });

    it('debería rechazar fecha con formato inválido', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                invoiceNumber: '001-001',
                date: '03/11/2025', // Formato inválido
                vendor: { name: 'Test' },
                totalAmount: 1000,
                currency: 'ARS',
                items: [
                  {
                    description: 'Item',
                    quantity: 1,
                    unitPrice: 1000,
                    subtotal: 1000,
                  },
                ],
                metadata: {
                  processedAt: new Date().toISOString(),
                  processingTimeMs: 1000,
                },
              }),
            },
          },
        ],
      });

      const options: IImageProcessingOptions = {
        imagePath: testImagePath,
        userId: 12345,
        messageId: 67890,
      };

      const result = await processor.processInvoiceImage(options);

      expect(result.success).toBe(false);
    });

    it('debería rechazar monto negativo', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                invoiceNumber: '001-001',
                date: '2025-11-03',
                vendor: { name: 'Test' },
                totalAmount: -1000, // Negativo
                currency: 'ARS',
                items: [
                  {
                    description: 'Item',
                    quantity: 1,
                    unitPrice: 1000,
                    subtotal: 1000,
                  },
                ],
                metadata: {
                  processedAt: new Date().toISOString(),
                  processingTimeMs: 1000,
                },
              }),
            },
          },
        ],
      });

      const options: IImageProcessingOptions = {
        imagePath: testImagePath,
        userId: 12345,
        messageId: 67890,
      };

      const result = await processor.processInvoiceImage(options);

      expect(result.success).toBe(false);
    });

    it('debería rechazar factura sin items', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                invoiceNumber: '001-001',
                date: '2025-11-03',
                vendor: { name: 'Test' },
                totalAmount: 1000,
                currency: 'ARS',
                items: [], // Array vacío
                metadata: {
                  processedAt: new Date().toISOString(),
                  processingTimeMs: 1000,
                },
              }),
            },
          },
        ],
      });

      const options: IImageProcessingOptions = {
        imagePath: testImagePath,
        userId: 12345,
        messageId: 67890,
      };

      const result = await processor.processInvoiceImage(options);

      expect(result.success).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      processor = new OpenAIVisionProcessor(config);

      // Mock de respuesta válida por defecto
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                invoiceNumber: '001-001',
                date: '2025-11-03',
                vendor: { name: 'Test' },
                totalAmount: 1000,
                currency: 'ARS',
                items: [
                  {
                    description: 'Item',
                    quantity: 1,
                    unitPrice: 1000,
                    subtotal: 1000,
                  },
                ],
                metadata: {
                  processedAt: new Date().toISOString(),
                  processingTimeMs: 1000,
                },
              }),
            },
          },
        ],
      });
    });

    it('debería manejar archivo muy grande', async () => {
      const largePath = path.join(testTempPath, 'large.jpg');
      const largeBuffer = Buffer.alloc(10 * 1024 * 1024); // 10MB
      await fs.writeFile(largePath, largeBuffer);

      const options: IImageProcessingOptions = {
        imagePath: largePath,
        userId: 12345,
        messageId: 67890,
      };

      const result = await processor.processInvoiceImage(options);

      // Debería procesar o dar error específico, pero no crash
      expect(result).toBeDefined();
    });

    it('debería manejar caracteres especiales en path', async () => {
      const specialPath = path.join(testTempPath, 'test (special).jpg');
      await fs.writeFile(specialPath, Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]));

      const options: IImageProcessingOptions = {
        imagePath: specialPath,
        userId: 12345,
        messageId: 67890,
      };

      const result = await processor.processInvoiceImage(options);

      expect(result.success).toBe(true);
    });
  });
});

