import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { URLSearchParams } from 'node:url';

import { ProcessInvoiceUseCase } from '../../../src/application/use-cases/ProcessInvoiceUseCase';
import { GenerateExcelUseCase } from '../../../src/application/use-cases/GenerateExcelUseCase';
import { ManageSessionUseCase } from '../../../src/application/use-cases/ManageSessionUseCase';
import { Invoice } from '../../../src/domain/entities/Invoice.entity';
import type { IDocumentIngestor } from '../../../src/domain/interfaces/IDocumentIngestor';
import type { IExcelGenerator } from '../../../src/domain/interfaces/IExcelGenerator';
import type { ILogger } from '../../../src/domain/interfaces/ILogger';
import type { IVisionProcessor } from '../../../src/domain/interfaces/IVisionProcessor';
import { InMemoryInvoiceRepository } from '../../../src/infrastructure/repositories/InMemoryInvoiceRepository';
import { AuthenticationService } from '../../../src/infrastructure/services/AuthenticationService';
import { RateLimiterService } from '../../../src/infrastructure/services/RateLimiterService';
import { TelegramBotController } from '../../../src/presentation/TelegramBotController';

export interface BotEvent {
  id: number;
  type: 'message' | 'edit' | 'document' | 'delete';
  chatId: number;
  text?: string;
  messageId?: number;
  caption?: string;
  filename?: string;
}

export interface UpdateResponse {
  events: BotEvent[];
}

export interface MockBotServerOptions {
  allowedUserIds?: number[];
  rateLimitConfig?: {
    maxRequestsPerMinute: number;
    maxRequestsPerHour: number;
  };
  settleDelayMs?: number;
}

class SilentLogger implements ILogger {
  info(): void {}
  success(): void {}
  error(): void {}
  warn(): void {}
  debug(): void {}
  audit(): void {}
}

class FakeDocumentIngestor implements IDocumentIngestor {
  async downloadAndStore(): Promise<{ success: boolean; filePath: string; fileName: string }> {
    return { success: true, filePath: '/tmp/mock-invoice.pdf', fileName: 'mock-invoice.pdf' };
  }

  async deleteFile(): Promise<void> {}

  async getStorageStats(): Promise<{ totalFiles: number; totalSizeMB: number; oldestFileAgeHours: number }> {
    return { totalFiles: 1, totalSizeMB: 0.1, oldestFileAgeHours: 0.1 };
  }

  async cleanupExpiredFiles(): Promise<number> {
    return 0;
  }
}

class FakeVisionProcessor implements IVisionProcessor {
  async processInvoiceImage(options: { userId: number; messageId: number }): Promise<{
    success: boolean;
    invoice: Invoice;
    userId: number;
    messageId: number;
  }> {
    return {
      success: true,
      invoice: Invoice.create({
        invoiceNumber: `INV-${options.messageId}`,
        date: '2026-02-11',
        vendor: {
          name: 'Acme Supplies',
          taxId: '30-12345678-9',
        },
        totalAmount: 1000,
        currency: 'ARS',
        items: [
          {
            description: 'Office supplies',
            quantity: 1,
            unitPrice: 1000,
            subtotal: 1000,
          },
        ],
        metadata: {
          processedAt: new Date().toISOString(),
          processingTimeMs: 50,
          confidence: 'high',
        },
      }),
      userId: options.userId,
      messageId: options.messageId,
    };
  }

  getModelName(): string {
    return 'mock-vision';
  }
}

class FakeExcelGenerator implements IExcelGenerator {
  async generateExcel(): Promise<Buffer> {
    return Buffer.from('mock-excel-content');
  }

  async generateAndSaveExcel(): Promise<void> {}
}

function parseJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(JSON.parse(raw) as T);
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(payload));
}

function readRawBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function parseTelegramPayload(req: IncomingMessage): Promise<Record<string, string>> {
  const raw = await readRawBody(req);
  const contentType = String(req.headers['content-type'] ?? '');

  if (contentType.includes('application/json')) {
    return JSON.parse(raw) as Record<string, string>;
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw).entries());
  }

  if (contentType.includes('multipart/form-data')) {
    const payload: Record<string, string> = {};
    const fieldRegex = /name="([^"]+)"(?:; filename="([^"]+)")?\r\n(?:.*)\r\n\r\n([\s\S]*?)\r\n/gi;
    let match: RegExpExecArray | null = null;
    while ((match = fieldRegex.exec(raw)) !== null) {
      const key = match[1];
      if (match[2]) {
        payload.filename = match[2];
        continue;
      }
      payload[key] = match[3];
    }
    return payload;
  }

  return {};
}

export class MockTelegramBotServer {
  private readonly settleDelayMs: number;
  private readonly events: BotEvent[] = [];
  private readonly logger: ILogger;
  private readonly auditLogger: ILogger;
  private readonly rateLimiter: RateLimiterService;
  private readonly authService: AuthenticationService;
  private readonly controller: TelegramBotController;
  private readonly server: Server;
  private eventSequence = 0;
  private messageSequence = 100;

  constructor(options: MockBotServerOptions = {}) {
    this.settleDelayMs = options.settleDelayMs ?? 2300;
    this.logger = new SilentLogger();
    this.auditLogger = new SilentLogger();

    this.rateLimiter = options.rateLimitConfig
      ? new RateLimiterService(options.rateLimitConfig)
      : new RateLimiterService();

    this.authService = new AuthenticationService(options.allowedUserIds);

    const repository = new InMemoryInvoiceRepository(30);
    const processInvoiceUseCase = new ProcessInvoiceUseCase(
      new FakeDocumentIngestor(),
      new FakeVisionProcessor(),
      repository,
      this.logger,
      0
    );

    const generateExcelUseCase = new GenerateExcelUseCase(
      repository,
      new FakeExcelGenerator(),
      this.logger
    );

    const manageSessionUseCase = new ManageSessionUseCase(repository, this.logger);

    this.controller = new TelegramBotController(
      'mock-token',
      processInvoiceUseCase,
      generateExcelUseCase,
      manageSessionUseCase,
      new FakeDocumentIngestor(),
      this.logger,
      this.auditLogger,
      this.rateLimiter,
      this.authService
    );

    this.stubTelegramApi();

    this.server = createServer(async (req, res) => {
      try {
        if (req.method === 'POST' && req.url === '/telegram/update') {
          const startIndex = this.events.length;
          const update = await parseJsonBody<Record<string, unknown>>(req);

          await this.controller.getBot().handleUpdate(update as never);
          await this.waitForSettledAsyncTasks();

          sendJson(res, 200, { events: this.events.slice(startIndex) } satisfies UpdateResponse);
          return;
        }

        if (req.method === 'POST' && req.url?.startsWith('/botmock-token/')) {
          const method = req.url.replace('/botmock-token/', '');
          const payload = await parseTelegramPayload(req);

          if (method === 'sendMessage') {
            const messageId = this.nextMessageId();
            this.pushEvent({
              type: 'message',
              chatId: Number(payload.chat_id ?? 0),
              text: payload.text ?? '',
              messageId,
            });
            sendJson(res, 200, {
              ok: true,
              result: { message_id: messageId, chat: { id: Number(payload.chat_id ?? 0) } },
            });
            return;
          }

          if (method === 'editMessageText') {
            this.pushEvent({
              type: 'edit',
              chatId: Number(payload.chat_id ?? 0),
              text: payload.text ?? '',
              messageId: Number(payload.message_id ?? 0),
            });
            sendJson(res, 200, { ok: true, result: true });
            return;
          }

          if (method === 'deleteMessage') {
            this.pushEvent({
              type: 'delete',
              chatId: Number(payload.chat_id ?? 0),
              messageId: Number(payload.message_id ?? 0),
            });
            sendJson(res, 200, { ok: true, result: true });
            return;
          }

          if (method === 'sendDocument') {
            const messageId = this.nextMessageId();
            this.pushEvent({
              type: 'document',
              chatId: Number(payload.chat_id ?? 0),
              caption: payload.caption ?? '',
              filename: payload.filename ?? 'facturas.xlsx',
              messageId,
            });
            sendJson(res, 200, {
              ok: true,
              result: { message_id: messageId, chat: { id: Number(payload.chat_id ?? 0) } },
            });
            return;
          }

          if (method === 'answerCallbackQuery') {
            sendJson(res, 200, { ok: true, result: true });
            return;
          }

          if (method === 'getFile') {
            sendJson(res, 200, {
              ok: true,
              result: {
                file_id: payload.file_id ?? 'doc-mock',
                file_path: 'documents/mock-invoice.pdf',
              },
            });
            return;
          }

          sendJson(res, 200, { ok: true, result: {} });
          return;
        }

        if (req.method === 'GET' && req.url === '/health') {
          sendJson(res, 200, { ok: true });
          return;
        }

        sendJson(res, 404, { error: 'Not found' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        sendJson(res, 500, { error: message });
      }
    });
  }

  async start(): Promise<string> {
    await new Promise<void>((resolve) => {
      this.server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = this.server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const telegram = this.controller.getBot().telegram as unknown as {
      options: { apiRoot: string };
    };
    telegram.options.apiRoot = baseUrl;
    return baseUrl;
  }

  async stop(): Promise<void> {
    this.rateLimiter.stop();
    this.controller.stop().catch(() => undefined);

    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private stubTelegramApi(): void {
    const bot = this.controller.getBot();
    const telegram = bot.telegram as unknown as {
      getFile: (fileId: string) => Promise<{ file_id: string; file_path: string }>;
      sendMessage: (
        chatId: number,
        text: string,
        extra?: Record<string, unknown>
      ) => Promise<{ message_id: number; chat: { id: number }; text: string }>;
      editMessageText: (
        chatId: number,
        messageId: number,
        inlineMessageId: string | undefined,
        text: string
      ) => Promise<{ message_id: number; chat: { id: number }; text: string }>;
      deleteMessage: (chatId: number, messageId: number) => Promise<boolean>;
      sendDocument: (
        chatId: number,
        document: { filename?: string } | Buffer,
        extra?: Record<string, unknown>
      ) => Promise<{ message_id: number; chat: { id: number } }>;
      answerCbQuery: (callbackQueryId: string) => Promise<boolean>;
    };

    telegram.getFile = async (fileId: string) => ({
      file_id: fileId,
      file_path: 'documents/mock-invoice.pdf',
    });

    telegram.sendMessage = async (chatId: number, text: string) => {
      const messageId = this.nextMessageId();
      this.pushEvent({
        type: 'message',
        chatId,
        text,
        messageId,
      });

      return {
        message_id: messageId,
        chat: { id: chatId },
        text,
      };
    };

    telegram.editMessageText = async (
      chatId: number,
      messageId: number,
      _inlineMessageId: string | undefined,
      text: string
    ) => {
      this.pushEvent({
        type: 'edit',
        chatId,
        text,
        messageId,
      });

      return {
        message_id: messageId,
        chat: { id: chatId },
        text,
      };
    };

    telegram.deleteMessage = async (chatId: number, messageId: number) => {
      this.pushEvent({
        type: 'delete',
        chatId,
        messageId,
      });
      return true;
    };

    telegram.sendDocument = async (
      chatId: number,
      document: { filename?: string } | Buffer,
      extra?: Record<string, unknown>
    ) => {
      const messageId = this.nextMessageId();
      this.pushEvent({
        type: 'document',
        chatId,
        caption: String(extra?.caption ?? ''),
        filename: (document as { filename?: string })?.filename ?? 'unknown.xlsx',
        messageId,
      });

      return {
        message_id: messageId,
        chat: { id: chatId },
      };
    };

    telegram.answerCbQuery = async () => true;

    // Some Telegraf context helpers call callApi directly.
    Object.defineProperty(telegram, 'callApi', {
      configurable: true,
      value: async (method: string, payload: Record<string, unknown>) => {
        if (method === 'sendMessage') {
          return telegram.sendMessage(Number(payload.chat_id), String(payload.text ?? ''));
        }

        if (method === 'editMessageText') {
          return telegram.editMessageText(
            Number(payload.chat_id),
            Number(payload.message_id),
            undefined,
            String(payload.text ?? '')
          );
        }

        if (method === 'deleteMessage') {
          return telegram.deleteMessage(Number(payload.chat_id), Number(payload.message_id));
        }

        if (method === 'sendDocument') {
          return telegram.sendDocument(
            Number(payload.chat_id),
            (payload.document as { filename?: string }) ?? Buffer.from('mock'),
            payload
          );
        }

        if (method === 'answerCallbackQuery') {
          return telegram.answerCbQuery(String(payload.callback_query_id ?? ''));
        }

        return {};
      },
    });
  }

  private pushEvent(event: Omit<BotEvent, 'id'>): void {
    this.events.push({ id: ++this.eventSequence, ...event });
  }

  private nextMessageId(): number {
    this.messageSequence += 1;
    return this.messageSequence;
  }

  private async waitForSettledAsyncTasks(): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, this.settleDelayMs));
  }
}

