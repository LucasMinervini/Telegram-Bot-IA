/**
 * TelegramBotController.ts
 * Presentation layer controller for Telegram Bot
 * Follows Clean Architecture - orchestrates use cases without business logic
 * Implements Single Responsibility Principle
 */

import { Telegraf, Context, Markup } from 'telegraf';
import { message } from 'telegraf/filters';

import { ProcessInvoiceUseCase } from '../application/use-cases/ProcessInvoiceUseCase';
import { GenerateExcelUseCase } from '../application/use-cases/GenerateExcelUseCase';
import { ManageSessionUseCase } from '../application/use-cases/ManageSessionUseCase';
import { IDocumentIngestor } from '../domain/interfaces/IDocumentIngestor';
import { ILogger } from '../domain/interfaces/ILogger';

import { InvoiceFormatter } from './formatters/InvoiceFormatter';
import { MessageFormatter } from './formatters/MessageFormatter';

/**
 * Telegram Bot Controller
 * Responsibility: Handle Telegram interactions and delegate to use cases
 */
export class TelegramBotController {
  private bot: Telegraf;
  private controlMessages: Map<number, number>;
  private controlPanelUpdateQueue: Map<number, NodeJS.Timeout>;
  private pendingUpdates: Map<number, { chatId: number; totalInvoices: number }>;

  constructor(
    token: string,
    private processInvoiceUseCase: ProcessInvoiceUseCase,
    private generateExcelUseCase: GenerateExcelUseCase,
    private manageSessionUseCase: ManageSessionUseCase,
    private documentIngestor: IDocumentIngestor,
    private logger: ILogger
  ) {
    this.bot = new Telegraf(token);
    this.controlMessages = new Map();
    this.controlPanelUpdateQueue = new Map();
    this.pendingUpdates = new Map();

    this.setupCommands();
    this.setupHandlers();
  }

  // ========================================
  // Command Handlers
  // ========================================

  private setupCommands(): void {
    this.bot.command('start', (ctx) => {
      this.logger.info(`User ${ctx.from.id} executed /start`);
      ctx.reply(MessageFormatter.welcomeMessage(), { parse_mode: 'Markdown' });
    });

    this.bot.command('help', (ctx) => {
      this.logger.info(`User ${ctx.from.id} executed /help`);
      ctx.reply(MessageFormatter.helpMessage(), { parse_mode: 'Markdown' });
    });

    this.bot.command('stats', async (ctx) => {
      try {
        const stats = await this.documentIngestor.getStorageStats();
        const message = MessageFormatter.storageStatsMessage(
          stats.totalFiles,
          stats.totalSizeMB,
          stats.oldestFileAgeHours
        );
        ctx.reply(message, { parse_mode: 'Markdown' });
      } catch (error: any) {
        ctx.reply('❌ Error obteniendo estadísticas');
      }
    });

    this.bot.command('facturas', async (ctx) => {
      if (!ctx.from) return;
      
      const count = this.manageSessionUseCase.getInvoiceCount(ctx.from.id);

      if (count === 0) {
        ctx.reply(MessageFormatter.noInvoicesMessage());
        return;
      }

      const sessionInfo = this.manageSessionUseCase.getSessionInfo({ userId: ctx.from.id });
      const message = InvoiceFormatter.formatSessionSummary(
        sessionInfo.invoiceCount,
        sessionInfo.totalAmount,
        sessionInfo.currencies,
        sessionInfo.vendorSummary
      );

      ctx.reply(message, { parse_mode: 'Markdown' });
    });

    this.bot.command('limpiar', async (ctx) => {
      if (!ctx.from) return;
      
      const result = this.manageSessionUseCase.clearSession({ userId: ctx.from.id });
      
      if (result.clearedCount === 0) {
        ctx.reply('✅ No hay facturas para limpiar.');
        return;
      }

      ctx.reply(MessageFormatter.sessionClearedMessage(result.clearedCount));
    });
  }

  // ========================================
  // Message Handlers
  // ========================================

  private setupHandlers(): void {
    this.bot.on(message('photo'), async (ctx) => {
      await this.handlePhotoMessage(ctx);
    });

    this.bot.on(message('document'), async (ctx) => {
      await this.handleDocumentMessage(ctx);
    });

    this.bot.on(message('text'), (ctx) => {
      ctx.reply(
        '📸 Por favor, envíame una imagen de un comprobante o factura.\n\n' +
        'Usa /help para más información.',
        { parse_mode: 'Markdown' }
      );
    });

    this.bot.on('callback_query', async (ctx) => {
      await this.handleCallbackQuery(ctx);
    });

    this.bot.catch((err, ctx) => {
      this.logger.error(`Error for user ${ctx.from?.id}:`, err);
      ctx.reply(
        '❌ Ocurrió un error inesperado. Por favor, intenta nuevamente.\n\n' +
        'Si el problema persiste, usa /help para más información.'
      );
    });
  }

  // ========================================
  // Photo Handler
  // ========================================

  private async handlePhotoMessage(ctx: Context & { message: any }): Promise<void> {
    if (!ctx.from || !ctx.chat) return;
    
    const userId = ctx.from.id;
    const messageId = ctx.message.message_id;

    try {
      const processingMsg = await ctx.reply(MessageFormatter.processingMessage());

      this.logger.info(`Processing photo for user ${userId}`);

      // Get highest resolution photo
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const file = await ctx.telegram.getFile(photo.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

      // Execute use case
      const result = await this.processInvoiceUseCase.execute({
        fileUrl,
        userId,
        messageId,
        detail: 'high',
      });

      // Update processing message
      if (result.success && result.invoice) {
        const invoice = result.invoice as any; // Type assertion for legacy compatibility
        const summary = InvoiceFormatter.toCompactSummary(invoice);
        
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMsg.message_id,
          undefined,
          `✅ ${summary}`,
          { parse_mode: 'Markdown' }
        );

        // Update control panel
        await this.updateControlPanel(ctx, userId, result.totalInvoices);

        this.logger.success(`Invoice processed for user ${userId}. Total: ${result.totalInvoices}`);
      } else {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMsg.message_id,
          undefined,
          MessageFormatter.formatError(result.error || 'Unknown error'),
          { parse_mode: 'Markdown' }
        );

        this.logger.error(`Error processing invoice: ${result.error}`);
      }

    } catch (error: any) {
      this.logger.error('Error in handlePhotoMessage:', error);
      ctx.reply(MessageFormatter.formatError(error.message), { parse_mode: 'Markdown' });
    }
  }

  // ========================================
  // Document Handler
  // ========================================

  private async handleDocumentMessage(ctx: Context & { message: any }): Promise<void> {
    if (!ctx.from || !ctx.chat) return;
    
    const document = ctx.message.document;
    const supportedFormats = (process.env.SUPPORTED_FORMATS || 'jpg,jpeg,png,gif,webp,bmp,tiff,pdf,docx,doc,xlsx,xls,pptx,ppt').split(',');
    const fileExtension = document.file_name?.split('.').pop()?.toLowerCase();

    if (!fileExtension || !supportedFormats.includes(fileExtension)) {
      await ctx.reply(
        `⚠️ Formato de archivo no soportado.\n\n` +
        `**Formatos permitidos:**\n` +
        `📷 Imágenes: JPG, PNG, GIF, WEBP, BMP, TIFF\n` +
        `📄 Documentos: PDF, DOCX, DOC, XLSX, XLS, PPTX, PPT\n\n` +
        `Tu archivo: ${fileExtension?.toUpperCase() || 'desconocido'}`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const maxSizeMB = parseInt(process.env.MAX_IMAGE_SIZE_MB || '10');
    const fileSizeMB = document.file_size / (1024 * 1024);

    if (fileSizeMB > maxSizeMB) {
      await ctx.reply(
        `⚠️ Archivo muy grande.\n\n` +
        `Tamaño máximo: ${maxSizeMB} MB\n` +
        `Tu archivo: ${fileSizeMB.toFixed(2)} MB`
      );
      return;
    }

    const userId = ctx.from.id;
    const messageId = ctx.message.message_id;

    try {
      const processingMsg = await ctx.reply(MessageFormatter.processingMessage());

      const file = await ctx.telegram.getFile(document.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

      // Execute use case
      const result = await this.processInvoiceUseCase.execute({
        fileUrl,
        userId,
        messageId,
        detail: 'high',
      });

      if (result.success && result.invoice) {
        const summary = InvoiceFormatter.toCompactSummary(result.invoice);
        
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMsg.message_id,
          undefined,
          `✅ ${summary}`,
          { parse_mode: 'Markdown' }
        );

        await this.updateControlPanel(ctx, userId, result.totalInvoices);

        this.logger.success(`Document processed for user ${userId}. Total: ${result.totalInvoices}`);
      } else {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMsg.message_id,
          undefined,
          MessageFormatter.formatError(result.error || 'Unknown error'),
          { parse_mode: 'Markdown' }
        );
      }

    } catch (error: any) {
      this.logger.error('Error in handleDocumentMessage:', error);
      ctx.reply(MessageFormatter.formatError(error.message), { parse_mode: 'Markdown' });
    }
  }

  // ========================================
  // Callback Query Handler
  // ========================================

  private async handleCallbackQuery(ctx: any): Promise<void> {
    if (!ctx.from || !ctx.callbackQuery) return;

    const userId = ctx.from.id;
    const action = ctx.callbackQuery.data;

    try {
      await ctx.answerCbQuery();

      switch (action) {
        case 'download_excel':
          await this.handleDownloadExcel(ctx, userId);
          break;

        case 'clear_session':
          await this.handleClearSession(ctx, userId);
          break;

        case 'show_summary':
          await this.handleShowSummary(ctx, userId);
          break;

        default:
          await ctx.reply('⚠️ Acción desconocida.');
      }
    } catch (error: any) {
      this.logger.error('Error in handleCallbackQuery:', error);
      await ctx.reply('❌ Error al procesar la acción.');
    }
  }

  // ========================================
  // Callback Actions
  // ========================================

  private async handleDownloadExcel(ctx: any, userId: number): Promise<void> {
    try {
      const generatingMsg = await ctx.reply(MessageFormatter.generatingExcelMessage());

      const result = await this.generateExcelUseCase.execute({ userId });

      await ctx.telegram.deleteMessage(ctx.chat.id, generatingMsg.message_id);

      if (result.success && result.excelBuffer) {
        const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
        const filename = `facturas_${userId}_${timestamp}.xlsx`;

        await ctx.replyWithDocument(
          {
            source: result.excelBuffer,
            filename: filename,
          },
          {
            caption: MessageFormatter.excelSentMessage(result.invoiceCount),
          }
        );

        this.logger.success(`Excel generated and sent to user ${userId}`);
      } else {
        await ctx.reply('❌ Error al generar el archivo Excel. Por favor, intenta nuevamente.');
      }
    } catch (error: any) {
      this.logger.error('Error generating Excel:', error);
      await ctx.reply('❌ Error al generar el archivo Excel. Por favor, intenta nuevamente.');
    }
  }

  private async handleClearSession(ctx: any, userId: number): Promise<void> {
    const result = this.manageSessionUseCase.clearSession({ userId });

    if (result.clearedCount === 0) {
      await ctx.reply('✅ No hay facturas para limpiar.');
      return;
    }

    const controlMessageId = this.controlMessages.get(userId);
    if (controlMessageId && ctx.chat) {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, controlMessageId);
      } catch (error) {
        // Ignore if message already deleted
      }
    }
    
    this.controlMessages.delete(userId);
    
    await ctx.reply(MessageFormatter.sessionClearedMessage(result.clearedCount));
    
    this.logger.info(`Session cleared for user ${userId}`);
  }

  private async handleShowSummary(ctx: any, userId: number): Promise<void> {
    const sessionInfo = this.manageSessionUseCase.getSessionInfo({ userId });

    if (!sessionInfo.hasSession) {
      await ctx.reply(MessageFormatter.noInvoicesMessage());
      return;
    }

    const summaryText = InvoiceFormatter.formatSessionSummary(
      sessionInfo.invoiceCount,
      sessionInfo.totalAmount,
      sessionInfo.currencies,
      sessionInfo.vendorSummary
    );

    await ctx.reply(summaryText, { parse_mode: 'Markdown' });
  }

  // ========================================
  // Control Panel Management
  // ========================================

  private async updateControlPanel(ctx: Context, userId: number, totalInvoices: number): Promise<void> {
    if (!ctx.chat) return;

    this.pendingUpdates.set(userId, { 
      chatId: ctx.chat.id, 
      totalInvoices 
    });

    const existingTimeout = this.controlPanelUpdateQueue.get(userId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeout = setTimeout(async () => {
      const updateInfo = this.pendingUpdates.get(userId);
      if (updateInfo) {
        await this.performControlPanelUpdate(updateInfo.chatId, userId, updateInfo.totalInvoices);
        this.pendingUpdates.delete(userId);
      }
      this.controlPanelUpdateQueue.delete(userId);
    }, 500);

    this.controlPanelUpdateQueue.set(userId, timeout);
  }

  private async performControlPanelUpdate(chatId: number, userId: number, totalInvoices: number): Promise<void> {
    const messageText = MessageFormatter.controlPanelMessage(totalInvoices);

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(`📥 Descargar Excel (${totalInvoices})`, 'download_excel')],
      [
        Markup.button.callback('🗑️ Limpiar Sesión', 'clear_session'),
        Markup.button.callback('📊 Ver Resumen', 'show_summary')
      ]
    ]);

    const existingMessageId = this.controlMessages.get(userId);

    try {
      if (existingMessageId) {
        await this.bot.telegram.editMessageText(
          chatId,
          existingMessageId,
          undefined,
          messageText,
          { 
            parse_mode: 'Markdown',
            reply_markup: keyboard.reply_markup
          }
        );
        this.logger.info(`Control panel updated for user ${userId} (${totalInvoices} invoices)`);
      } else {
        const sentMessage = await this.bot.telegram.sendMessage(
          chatId,
          messageText,
          keyboard
        );
        this.controlMessages.set(userId, sentMessage.message_id);
        this.logger.info(`Control panel created for user ${userId} (${totalInvoices} invoices)`);
      }
    } catch (error: any) {
      this.logger.error(`Error in control panel: ${error.message}`);
      
      if (error.response?.error_code === 400 || error.response?.error_code === 429) {
        try {
          await new Promise(resolve => setTimeout(resolve, 1000));
          const sentMessage = await this.bot.telegram.sendMessage(
            chatId,
            messageText,
            keyboard
          );
          this.controlMessages.set(userId, sentMessage.message_id);
          this.logger.info(`Control panel recreated for user ${userId}`);
        } catch (retryError: any) {
          this.logger.error('Error creating control panel:', retryError.message);
        }
      }
    }
  }

  // ========================================
  // Bot Lifecycle
  // ========================================

  async launch(): Promise<void> {
    try {
      this.logger.info('Starting Telegram bot...');
      
      const botInfo = await this.bot.telegram.getMe();
      this.logger.success(`Bot started: @${botInfo.username}`);
      
      await this.bot.launch();
      
      this.logger.success('Bot is active and listening for messages');
      
      process.once('SIGINT', () => this.stop('SIGINT'));
      process.once('SIGTERM', () => this.stop('SIGTERM'));
      
    } catch (error: any) {
      this.logger.error('Error starting bot:', error);
      throw error;
    }
  }

  async stop(signal?: string): Promise<void> {
    this.logger.info(`Stopping bot${signal ? ` (${signal})` : ''}...`);
    await this.bot.stop(signal);
    this.logger.success('Bot stopped');
  }

  getBot(): Telegraf {
    return this.bot;
  }
}

