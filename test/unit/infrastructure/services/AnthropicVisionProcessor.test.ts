/**
 * Test suite for AnthropicVisionProcessor
 * The Anthropic SDK is mocked: no network calls are made.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import {
  AnthropicVisionProcessor,
  IAnthropicConfig,
  INVOICE_EXTRACTION_TOOL,
  SYSTEM_PROMPT,
} from '@/infrastructure/services/AnthropicVisionProcessor';
import type { ILogger } from '@/domain/interfaces/ILogger';

const { createMock, constructorMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  constructorMock: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  }
  class RateLimitError extends APIError {
    constructor(message = 'rate limited') {
      super(429, message);
    }
  }
  class Anthropic {
    static APIError = APIError;
    static RateLimitError = RateLimitError;
    messages = { create: createMock };
    constructor(options: unknown) {
      constructorMock(options);
    }
  }
  return { default: Anthropic };
});

// Imported after vi.mock so the mocked error classes are used
import Anthropic from '@anthropic-ai/sdk';

const MockAPIError = (Anthropic as any).APIError as new (status: number, message: string) => Error;
const MockRateLimitError = (Anthropic as any).RateLimitError as new (message?: string) => Error;

const validExtraction = {
  invoiceNumber: 'PDX4OGNYG08EQG5QN0L6EY',
  date: '2026-05-08',
  operationType: 'Transferencia inmediata',
  vendor: { name: 'BOUCHE12 SA', taxId: '30-71234567-8', cvu: '0000031000000012345678', address: 'Calle 1' },
  totalAmount: 475500,
  currency: 'ARS',
  receiverBank: 'BANCO COINAG S.A.',
  paymentMethod: 'Transferencia bancaria',
  items: [{ description: 'Transferencia a BOUCHE12 SA', quantity: 1, unitPrice: 475500, subtotal: 475500 }],
  taxes: { iva: 0, otherTaxes: 0 },
};

const toolResponse = (input: Record<string, unknown>, usage: Record<string, number> = {}) => ({
  content: [{ type: 'tool_use', name: 'extract_invoice', input }],
  usage: { input_tokens: 100, output_tokens: 50, ...usage },
});

const createLogger = (): ILogger => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  success: vi.fn(),
  debug: vi.fn(),
  audit: vi.fn(),
});

describe('AnthropicVisionProcessor', () => {
  const testTempPath = path.join(process.cwd(), 'test', 'temp-anthropic-test');
  const imagePath = path.join(testTempPath, 'receipt.jpg');
  const pdfPath = path.join(testTempPath, 'receipt.pdf');
  const config: IAnthropicConfig = { apiKey: 'test-key', model: 'claude-haiku-4-5-20251001' };
  const envKeys = [
    'DEMO_MODE',
    'ANTHROPIC_CONCURRENCY',
    'ANTHROPIC_RETRY_MAX',
    'ANTHROPIC_RETRY_BASE_DELAY_MS',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_MODEL',
    'ANTHROPIC_MAX_TOKENS',
    'ANTHROPIC_FALLBACK_MODEL',
    'ANTHROPIC_FALLBACK_ENABLED',
    'ANTHROPIC_WORKSPACE_ID',
  ];
  const savedEnv: Record<string, string | undefined> = {};

  const process$ = (processor: AnthropicVisionProcessor, filePath = imagePath) =>
    processor.processInvoiceImage({ imagePath: filePath, userId: 10, messageId: 20 });

  beforeEach(async () => {
    envKeys.forEach((key) => {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    });
    process.env.ANTHROPIC_RETRY_BASE_DELAY_MS = '1';

    await fs.ensureDir(testTempPath);
    await fs.writeFile(imagePath, Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    await fs.writeFile(pdfPath, Buffer.from('%PDF-1.4'));

    createMock.mockReset();
    constructorMock.mockReset();
  });

  afterEach(async () => {
    envKeys.forEach((key) => {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    });
    await fs.remove(testTempPath);
  });

  describe('constructor and configuration', () => {
    it('exposes the configured model name', () => {
      expect(new AnthropicVisionProcessor(config).getModelName()).toBe('claude-haiku-4-5-20251001');
    });

    it('sends the workspace header only when a workspace id is configured', () => {
      new AnthropicVisionProcessor({ ...config, workspaceId: 'wrkspc_123' });
      new AnthropicVisionProcessor(config);

      expect(constructorMock.mock.calls[0][0]).toEqual({
        apiKey: 'test-key',
        defaultHeaders: { 'anthropic-workspace-id': 'wrkspc_123' },
      });
      expect(constructorMock.mock.calls[1][0].defaultHeaders).toBeUndefined();
    });

    it('builds its configuration from environment variables', async () => {
      process.env.ANTHROPIC_API_KEY = 'env-key';
      process.env.ANTHROPIC_MODEL = 'env-model';
      process.env.ANTHROPIC_MAX_TOKENS = '512';
      process.env.ANTHROPIC_FALLBACK_ENABLED = '1';
      process.env.ANTHROPIC_FALLBACK_MODEL = 'env-fallback';
      process.env.ANTHROPIC_WORKSPACE_ID = 'wrkspc_env';
      createMock.mockResolvedValue(toolResponse(validExtraction));

      const processor = AnthropicVisionProcessor.fromEnv();
      await process$(processor);

      expect(processor.getModelName()).toBe('env-model');
      expect(constructorMock).toHaveBeenCalledWith({
        apiKey: 'env-key',
        defaultHeaders: { 'anthropic-workspace-id': 'wrkspc_env' },
      });
      expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ model: 'env-model', max_tokens: 512 }));
    });

    it('falls back to default values when environment variables are missing', () => {
      const processor = AnthropicVisionProcessor.fromEnv(createLogger());
      expect(processor.getModelName()).toBe('claude-haiku-4-5-20251001');
      expect(constructorMock.mock.calls[0][0]).toEqual({ apiKey: '', defaultHeaders: undefined });
    });
  });

  describe('request building', () => {
    it('forces the extraction tool and caches the system prompt', async () => {
      createMock.mockResolvedValue(toolResponse(validExtraction));

      await process$(new AnthropicVisionProcessor(config));

      const params = createMock.mock.calls[0][0];
      expect(params.model).toBe(config.model);
      expect(params.max_tokens).toBe(1024);
      expect(params.tools).toEqual([INVOICE_EXTRACTION_TOOL]);
      expect(params.tool_choice).toEqual({ type: 'tool', name: 'extract_invoice' });
      expect(params.system[0].text).toBe(SYSTEM_PROMPT);
      expect(params.system[0].cache_control).toEqual({ type: 'ephemeral' });
    });

    it('sends images as base64 image blocks', async () => {
      createMock.mockResolvedValue(toolResponse(validExtraction));

      await process$(new AnthropicVisionProcessor(config));

      const [image, text] = createMock.mock.calls[0][0].messages[0].content;
      expect(image.type).toBe('image');
      expect(image.source).toEqual({ type: 'base64', media_type: 'image/jpeg', data: '/9j/4A==' });
      expect(text.type).toBe('text');
    });

    it('sends PDFs as native document blocks', async () => {
      createMock.mockResolvedValue(toolResponse(validExtraction));

      await process$(new AnthropicVisionProcessor(config), pdfPath);

      const [document] = createMock.mock.calls[0][0].messages[0].content;
      expect(document.type).toBe('document');
      expect(document.source.media_type).toBe('application/pdf');
    });

    it.each([
      ['.png', 'image/png'],
      ['.gif', 'image/gif'],
      ['.webp', 'image/webp'],
      ['.bmp', 'image/jpeg'],
      ['.heic', 'image/jpeg'],
    ])('maps %s files to %s', async (ext, mediaType) => {
      const filePath = path.join(testTempPath, `receipt${ext}`);
      await fs.writeFile(filePath, Buffer.from([0x01, 0x02]));
      createMock.mockResolvedValue(toolResponse(validExtraction));

      await process$(new AnthropicVisionProcessor(config), filePath);

      expect(createMock.mock.calls[0][0].messages[0].content[0].source.media_type).toBe(mediaType);
    });
  });

  describe('processInvoiceImage', () => {
    it('returns a valid invoice from the tool_use output', async () => {
      const logger = createLogger();
      createMock.mockResolvedValue(
        toolResponse(validExtraction, { cache_read_input_tokens: 4000, cache_creation_input_tokens: 10 })
      );

      const result = await process$(new AnthropicVisionProcessor(config, logger));

      expect(result.success).toBe(true);
      expect(result.userId).toBe(10);
      expect(result.messageId).toBe(20);
      expect(result.invoice?.invoiceNumber).toBe('PDX4OGNYG08EQG5QN0L6EY');
      expect(result.invoice?.vendor).toEqual(validExtraction.vendor);
      expect(result.invoice?.receiverBank).toBe('BANCO COINAG S.A.');
      expect(result.invoice?.metadata?.confidence).toBe('high');
      expect(logger.info).toHaveBeenCalledWith(
        '[Anthropic] Extraction complete',
        expect.objectContaining({ cacheRead: 4000, cacheCreation: 10 })
      );
    });

    it('returns an error when the file does not exist', async () => {
      const result = await process$(new AnthropicVisionProcessor(config), path.join(testTempPath, 'missing.jpg'));

      expect(result.success).toBe(false);
      expect(result.error).toBe('File does not exist');
      expect(createMock).not.toHaveBeenCalled();
    });

    it('returns an error when the response has no tool_use block', async () => {
      createMock.mockResolvedValue({ content: [{ type: 'text', text: 'hello' }], usage: {} });

      const result = await process$(new AnthropicVisionProcessor(config));

      expect(result.success).toBe(false);
      expect(result.error).toContain('no devolvió datos estructurados');
    });

    it('returns a demo invoice without calling the API in demo mode', async () => {
      process.env.DEMO_MODE = 'true';

      const result = await process$(new AnthropicVisionProcessor(config));

      expect(result.success).toBe(true);
      expect(result.invoice?.invoiceNumber).toBe('DEMO-1');
      expect(createMock).not.toHaveBeenCalled();
    });
  });

  describe('sanitization of model output', () => {
    const extract = async (input: Record<string, unknown>) => {
      createMock.mockResolvedValue(toolResponse(input));
      const result = await process$(new AnthropicVisionProcessor(config));
      expect(result.success).toBe(true);
      return result.invoice!;
    };

    it('normalizes DD/MM/YYYY and YYYY/MM/DD dates', async () => {
      expect((await extract({ ...validExtraction, date: '08/05/2026' })).date).toBe('2026-05-08');
      expect((await extract({ ...validExtraction, date: '2026/05/08' })).date).toBe('2026-05-08');
    });

    it("uses today's date when the date is missing or unreadable", async () => {
      const today = new Date().toISOString().slice(0, 10);
      expect((await extract({ ...validExtraction, date: 'ayer' })).date).toBe(today);
      expect((await extract({ ...validExtraction, date: undefined })).date).toBe(today);
    });

    it('replaces invalid tax ids and missing vendor names', async () => {
      const invoice = await extract({ ...validExtraction, vendor: { taxId: 'Juan Perez' } });
      expect(invoice.vendor.name).toBe('Unknown Vendor');
      expect(invoice.vendor.taxId).toBe('No figura');

      const noVendor = await extract({ ...validExtraction, vendor: null });
      expect(noVendor.vendor.taxId).toBe('No figura');
    });

    it('never treats payment processors as the receiver bank', async () => {
      expect((await extract({ ...validExtraction, receiverBank: 'Mercado Pago' })).receiverBank).toBe('');
      expect((await extract({ ...validExtraction, receiverBank: '   ' })).receiverBank).toBe('');
      expect((await extract({ ...validExtraction, receiverBank: 42 })).receiverBank).toBe('');
    });

    it('defaults the currency to ARS and upper-cases valid codes', async () => {
      expect((await extract({ ...validExtraction, currency: 'usd' })).currency).toBe('USD');
      expect((await extract({ ...validExtraction, currency: 'pesos' })).currency).toBe('ARS');
    });

    it('creates a single item from the total when items are missing', async () => {
      const invoice = await extract({ ...validExtraction, items: [] });
      expect(invoice.items).toEqual([{ description: 'Comprobante', quantity: 1, unitPrice: 475500, subtotal: 475500 }]);
    });

    it('repairs invalid item fields', async () => {
      const invoice = await extract({
        ...validExtraction,
        items: [{ description: '', quantity: -1, unitPrice: 'x', subtotal: null }, { quantity: 2, unitPrice: 50 }],
      });
      expect(invoice.items).toEqual([
        { description: 'Item', quantity: 1, unitPrice: 0, subtotal: 0 },
        { description: 'Item', quantity: 2, unitPrice: 50, subtotal: 100 },
      ]);
    });

    it('computes the total from items when the total is missing', async () => {
      const invoice = await extract({
        ...validExtraction,
        totalAmount: 0,
        items: [{ description: 'A', quantity: 2, unitPrice: 10, subtotal: 20 }],
      });
      expect(invoice.totalAmount).toBe(20);
    });

    it('uses a minimal total when nothing can be computed', async () => {
      const invoice = await extract({ ...validExtraction, totalAmount: undefined, items: undefined });
      expect(invoice.totalAmount).toBe(0.01);
    });

    it('defaults missing tax values to zero and ignores non-object taxes', async () => {
      expect((await extract({ ...validExtraction, taxes: { iva: 21 } })).taxes).toEqual({ iva: 21, otherTaxes: 0 });
      expect((await extract({ ...validExtraction, taxes: 'none' })).taxes).toBeUndefined();
    });

    it('uses a default invoice number when it is missing', async () => {
      expect((await extract({ ...validExtraction, invoiceNumber: '  ' })).invoiceNumber).toBe('COMPROBANTE-001');
    });
  });

  describe('low-confidence fallback', () => {
    const lowConfidence = { invoiceNumber: '', date: 'x', vendor: {}, totalAmount: 0, currency: 'ARS', items: [] };
    const fallbackConfig: IAnthropicConfig = { ...config, fallbackEnabled: true, fallbackModel: 'claude-sonnet-4-6' };

    it('does not retry when the fallback is disabled', async () => {
      createMock.mockResolvedValue(toolResponse(lowConfidence));

      const processor = new AnthropicVisionProcessor(config);
      vi.spyOn(processor as any, 'calculateConfidence').mockReturnValue('low');
      const result = await process$(processor);

      expect(createMock).toHaveBeenCalledTimes(1);
      expect(result.invoice?.metadata?.confidence).toBe('low');
    });

    it('does not retry when the primary result is not low confidence', async () => {
      createMock.mockResolvedValue(toolResponse(lowConfidence));

      const processor = new AnthropicVisionProcessor(fallbackConfig);
      vi.spyOn(processor as any, 'calculateConfidence').mockReturnValue('medium');
      const result = await process$(processor);

      expect(createMock).toHaveBeenCalledTimes(1);
      expect(result.invoice?.metadata?.model).toBe(config.model);
    });

    it('keeps the fallback result when its confidence is at least as high', async () => {
      // Missing vendor name and total make the primary result 'low'
      const primary = { invoiceNumber: '', vendor: null, totalAmount: 0, items: undefined };
      createMock
        .mockResolvedValueOnce(toolResponse(primary))
        .mockResolvedValueOnce(toolResponse(validExtraction));
      const logger = createLogger();

      const processor = new AnthropicVisionProcessor(fallbackConfig, logger);
      const confidenceSpy = vi.spyOn(processor as any, 'calculateConfidence').mockReturnValueOnce('low');
      const result = await process$(processor);

      expect(createMock).toHaveBeenCalledTimes(2);
      expect(createMock.mock.calls[1][0].model).toBe('claude-sonnet-4-6');
      expect(result.invoice?.invoiceNumber).toBe('PDX4OGNYG08EQG5QN0L6EY');
      expect(result.invoice?.metadata?.model).toBe('claude-sonnet-4-6');
      expect(logger.warn).toHaveBeenCalled();
      confidenceSpy.mockRestore();
    });

    it('keeps the primary result when the fallback returns nothing usable', async () => {
      createMock
        .mockResolvedValueOnce(toolResponse(validExtraction))
        .mockResolvedValueOnce({ content: [], usage: {} });

      const processor = new AnthropicVisionProcessor(fallbackConfig);
      vi.spyOn(processor as any, 'calculateConfidence').mockReturnValueOnce('low');
      const result = await process$(processor);

      expect(createMock).toHaveBeenCalledTimes(2);
      expect(result.invoice?.metadata?.model).toBe(config.model);
    });

    it('does not retry when the fallback model equals the primary model', async () => {
      createMock.mockResolvedValue(toolResponse(validExtraction));

      const processor = new AnthropicVisionProcessor({ ...fallbackConfig, fallbackModel: config.model });
      vi.spyOn(processor as any, 'calculateConfidence').mockReturnValue('low');
      await process$(processor);

      expect(createMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('retries rate-limited requests with backoff and then succeeds', async () => {
      process.env.ANTHROPIC_RETRY_MAX = '2';
      const logger = createLogger();
      createMock
        .mockRejectedValueOnce(new MockRateLimitError())
        .mockRejectedValueOnce(new MockAPIError(429, 'too many requests'))
        .mockResolvedValueOnce(toolResponse(validExtraction));

      const result = await process$(new AnthropicVisionProcessor(config, logger));

      expect(result.success).toBe(true);
      expect(createMock).toHaveBeenCalledTimes(3);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('retry 1/2'));
    });

    it('gives up after the maximum number of retries', async () => {
      process.env.ANTHROPIC_RETRY_MAX = '1';
      createMock.mockRejectedValue(new MockRateLimitError('still limited'));

      const result = await process$(new AnthropicVisionProcessor(config));

      expect(createMock).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(false);
      expect(result.error).toContain('still limited');
      expect(result.errorCode).toBeUndefined();
    });

    it('does not retry errors other than rate limits', async () => {
      createMock.mockRejectedValue(new Error('network down'));

      const result = await process$(new AnthropicVisionProcessor(config));

      expect(createMock).toHaveBeenCalledTimes(1);
      expect(result.error).toBe('Error procesando documento: network down');
    });

    it('stringifies non-Error rejections', async () => {
      createMock.mockRejectedValue('boom');

      const result = await process$(new AnthropicVisionProcessor(config));

      expect(result.error).toBe('Error procesando documento: boom');
    });

    it.each([
      [401, 'invalid x-api-key'],
      [402, 'payment required'],
      [403, 'permission denied'],
      [400, 'Your credit balance is too low'],
      [400, 'anthropic-workspace-id header is required'],
    ])('flags %i "%s" as provider unavailable', async (status, message) => {
      createMock.mockRejectedValue(new MockAPIError(status, message));

      const result = await process$(new AnthropicVisionProcessor(config));

      expect(result.success).toBe(false);
      expect(result.error).toBe('Servicio de IA no disponible');
      expect(result.errorCode).toBe('PROVIDER_UNAVAILABLE');
    });

    it('treats other 400 errors as document errors', async () => {
      createMock.mockRejectedValue(new MockAPIError(400, 'Could not process image'));

      const result = await process$(new AnthropicVisionProcessor(config));

      expect(result.errorCode).toBeUndefined();
      expect(result.error).toContain('Could not process image');
    });
  });

  describe('concurrency limit', () => {
    it('never runs more API calls in parallel than ANTHROPIC_CONCURRENCY', async () => {
      process.env.ANTHROPIC_CONCURRENCY = '2';
      let active = 0;
      let maxActive = 0;
      createMock.mockImplementation(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active--;
        return toolResponse(validExtraction);
      });

      const processor = new AnthropicVisionProcessor(config);
      const results = await Promise.all(Array.from({ length: 5 }, () => process$(processor)));

      expect(results.every((r) => r.success)).toBe(true);
      expect(createMock).toHaveBeenCalledTimes(5);
      expect(maxActive).toBe(2);
    });
  });
});
