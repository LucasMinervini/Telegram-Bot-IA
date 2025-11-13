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

import { RateLimiterService } from '../infrastructure/services/RateLimiterService';
import { AuthenticationService } from '../infrastructure/services/AuthenticationService';

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
  private excelCache: Map<number, { buffer: Buffer; timestamp: number; invoiceCount: number }>;

  constructor(
    token: string,
    private processInvoiceUseCase: ProcessInvoiceUseCase,
    private generateExcelUseCase: GenerateExcelUseCase,
    private manageSessionUseCase: ManageSessionUseCase,
    private documentIngestor: IDocumentIngestor,
    private logger: ILogger,
    private auditLogger: ILogger,
    private rateLimiter: RateLimiterService,
    private authService: AuthenticationService
  ) {
    this.bot = new Telegraf(token);
    this.controlMessages = new Map();
    this.controlPanelUpdateQueue = new Map();
    this.pendingUpdates = new Map();
    this.excelCache = new Map();

    this.setupAuthentication();
    this.setupCommands();
    this.setupHandlers();
  }

  // ========================================
  // Authentication Middleware
  // ========================================

  private setupAuthentication(): void {
    // Global authentication middleware
    this.bot.use(async (ctx, next) => {
      if (!ctx.from) {
        return; // Skip if no user info
      }

      const userId = ctx.from.id;
      const authResult = this.authService.isAuthorized(userId);

      if (!authResult.authorized) {
        this.logger.warn(`Unauthorized access attempt by user ${userId}`);
        this.auditLogger.audit('UNAUTHORIZED_ACCESS_ATTEMPT', userId, {
          reason: authResult.reason,
          command: (ctx as any).message?.text || 'unknown',
        });
        
        await ctx.reply(
          '❌ No tienes permiso para usar este bot.\n\n' +
          'Contacta al administrador para obtener acceso.',
          { parse_mode: 'Markdown' }
        );
        return; // Stop processing
      }

      // Check rate limiting (only if enabled)
      if (this.rateLimiter.isEnabled()) {
        const rateLimitResult = this.rateLimiter.isAllowed(userId);
        
        if (!rateLimitResult.allowed) {
          this.logger.warn(`Rate limit exceeded for user ${userId}`);
          this.auditLogger.audit('RATE_LIMIT_EXCEEDED', userId, {
            retryAfterSeconds: rateLimitResult.retryAfterSeconds,
          });

          const retryAfter = rateLimitResult.retryAfterSeconds || 60;
          const config = this.rateLimiter.getConfig();
          await ctx.reply(
            `⏳ Has alcanzado el límite de peticiones.\n\n` +
            `Por favor espera ${retryAfter} segundo(s) antes de intentar nuevamente.\n\n` +
            `Límites:\n` +
            `• ${config.maxRequestsPerMinute} peticiones por minuto\n` +
            `• ${config.maxRequestsPerHour} peticiones por hora`,
            { parse_mode: 'Markdown' }
          );
          return; // Stop processing
        }
      }

      // Continue to next middleware/handler
      return next();
    });
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
      
      const userId = ctx.from.id;
      const result = this.manageSessionUseCase.clearSession({ userId });
      
      // Audit log: Session cleared
      this.auditLogger.audit('SESSION_CLEARED', userId, {
        clearedCount: result.clearedCount,
        command: '/limpiar',
        timestamp: new Date().toISOString(),
      });
      
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
      
      // Audit log: File upload started
      this.auditLogger.audit('FILE_UPLOAD_STARTED', userId, {
        fileType: 'photo',
        fileId: photo.file_id,
        messageId,
        fileUrl: fileUrl.substring(0, 100) + '...', // Truncate for security
        timestamp: new Date().toISOString(),
      });

      // Execute use case with auto detail level (optimized for performance)
      const result = await this.processInvoiceUseCase.execute({
        fileUrl,
        userId,
        messageId,
        detail: 'auto', // Auto-detect optimal detail level
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

        // Pre-generate Excel in background for faster download
        setImmediate(() => {
          this.preGenerateExcel(userId, result.totalInvoices)
            .catch((err) => this.logger.warn(`Excel pre-generation failed: ${err.message}`));
        });

        // Update control panel asynchronously (don't block response)
        setImmediate(() => {
          this.updateControlPanel(ctx, userId, result.totalInvoices)
            .catch((err) => this.logger.warn(`Control panel update failed: ${err.message}`));
        });

        // Audit log: File processed successfully
        this.auditLogger.audit('FILE_PROCESSED_SUCCESS', userId, {
          fileType: 'photo',
          fileId: photo.file_id,
          messageId,
          invoiceNumber: invoice.invoiceNumber || 'unknown',
          totalAmount: invoice.totalAmount || 0,
          currency: invoice.currency || 'unknown',
          totalInvoices: result.totalInvoices,
          timestamp: new Date().toISOString(),
        });

        this.logger.success(`Invoice processed for user ${userId}. Total: ${result.totalInvoices}`);
      } else {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMsg.message_id,
          undefined,
          MessageFormatter.formatError(result.error || 'Unknown error'),
          { parse_mode: 'Markdown' }
        );

        // Audit log: File processing failed
        this.auditLogger.audit('FILE_PROCESSED_FAILED', userId, {
          fileType: 'photo',
          fileId: photo.file_id,
          messageId,
          error: result.error || 'Unknown error',
          timestamp: new Date().toISOString(),
        });

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

      // Audit log: File upload started
      this.auditLogger.audit('FILE_UPLOAD_STARTED', userId, {
        fileType: 'document',
        fileName: document.file_name || 'unknown',
        fileExtension,
        fileSizeMB: fileSizeMB.toFixed(2),
        fileId: document.file_id,
        messageId,
        fileUrl: fileUrl.substring(0, 100) + '...', // Truncate for security
        timestamp: new Date().toISOString(),
      });

      // Execute use case with auto detail level (optimized for performance)
      const result = await this.processInvoiceUseCase.execute({
        fileUrl,
        userId,
        messageId,
        detail: 'auto', // Auto-detect optimal detail level
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

        // Pre-generate Excel in background for faster download
        setImmediate(() => {
          this.preGenerateExcel(userId, result.totalInvoices)
            .catch((err) => this.logger.warn(`Excel pre-generation failed: ${err.message}`));
        });

        // Update control panel asynchronously (don't block response)
        setImmediate(() => {
          this.updateControlPanel(ctx, userId, result.totalInvoices)
            .catch((err) => this.logger.warn(`Control panel update failed: ${err.message}`));
        });

        // Audit log: File processed successfully
        this.auditLogger.audit('FILE_PROCESSED_SUCCESS', userId, {
          fileType: 'document',
          fileName: document.file_name || 'unknown',
          fileExtension,
          fileId: document.file_id,
          messageId,
          invoiceNumber: result.invoice.invoiceNumber || 'unknown',
          totalAmount: result.invoice.totalAmount || 0,
          currency: result.invoice.currency || 'unknown',
          totalInvoices: result.totalInvoices,
          timestamp: new Date().toISOString(),
        });

        this.logger.success(`Document processed for user ${userId}. Total: ${result.totalInvoices}`);
      } else {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMsg.message_id,
          undefined,
          MessageFormatter.formatError(result.error || 'Unknown error'),
          { parse_mode: 'Markdown' }
        );

        // Audit log: File processing failed
        this.auditLogger.audit('FILE_PROCESSED_FAILED', userId, {
          fileType: 'document',
          fileName: document.file_name || 'unknown',
          fileExtension,
          fileId: document.file_id,
          messageId,
          error: result.error || 'Unknown error',
          timestamp: new Date().toISOString(),
        });
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
      // Check cache first
      const cached = this.excelCache.get(userId);
      if (cached) {
        // Verify cache is still valid (same invoice count)
        const currentInvoices = this.manageSessionUseCase.getInvoiceCount(userId);
        if (cached.invoiceCount === currentInvoices) {
          // Cache hit! Send immediately
          const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
          const filename = `facturas_${userId}_${timestamp}.xlsx`;

          await ctx.replyWithDocument(
            {
              source: cached.buffer,
              filename: filename,
            },
            {
              caption: MessageFormatter.excelSentMessage(cached.invoiceCount),
            }
          );

          // Audit log: Excel downloaded (from cache)
          this.auditLogger.audit('EXCEL_DOWNLOADED', userId, {
            filename,
            invoiceCount: cached.invoiceCount,
            fileSizeBytes: cached.buffer.length,
            fromCache: true,
            timestamp: new Date().toISOString(),
          });

          this.logger.success(`Excel sent from cache to user ${userId}`);
          
          // Auto-cleanup and clear cache
          this.handleExcelDownloadCleanup(ctx, userId);
          return;
        }
      }

      // Cache miss or invalid - generate now
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

        // Audit log: Excel downloaded
        this.auditLogger.audit('EXCEL_DOWNLOADED', userId, {
          filename,
          invoiceCount: result.invoiceCount,
          fileSizeBytes: result.excelBuffer.length,
          timestamp: new Date().toISOString(),
        });

        this.logger.success(`Excel generated and sent to user ${userId}`);
        
        // Auto-cleanup and clear cache
        this.handleExcelDownloadCleanup(ctx, userId);
      } else {
        await ctx.reply('❌ Error al generar el archivo Excel. Por favor, intenta nuevamente.');
      }
    } catch (error: any) {
      this.logger.error('Error generating Excel:', error);
      await ctx.reply('❌ Error al generar el archivo Excel. Por favor, intenta nuevamente.');
    }
  }

  /**
   * Pre-generate Excel in background for faster download
   */
  private async preGenerateExcel(userId: number, invoiceCount: number): Promise<void> {
    try {
      const result = await this.generateExcelUseCase.execute({ userId });
      if (result.success && result.excelBuffer) {
        // Store in cache
        this.excelCache.set(userId, {
          buffer: result.excelBuffer,
          timestamp: Date.now(),
          invoiceCount: invoiceCount,
        });
        this.logger.debug(`Excel pre-generated and cached for user ${userId} (${invoiceCount} invoices)`);
      }
    } catch (error: any) {
      // Silent fail - cache is optional optimization
      this.logger.debug(`Excel pre-generation failed for user ${userId}: ${error.message}`);
    }
  }

  /**
   * Handle cleanup after Excel download (session clear, control panel, cache)
   */
  private async handleExcelDownloadCleanup(ctx: any, userId: number): Promise<void> {
    // Clear cache
    this.excelCache.delete(userId);

    // ✅ Auto-cleanup: Limpiar sesión después de descargar Excel
    const clearResult = this.manageSessionUseCase.clearSession({ userId });
    
    if (clearResult.clearedCount > 0) {
      await ctx.reply(
        `✅ Sesión limpiada automáticamente: ${clearResult.clearedCount} factura(s) eliminadas.\n\n` +
        `Puedes empezar a enviar nuevos comprobantes. 🚀`,
        { parse_mode: 'Markdown' }
      );
      this.logger.info(`Session auto-cleared for user ${userId}: ${clearResult.clearedCount} invoices removed`);
    }
    
    // Limpiar el panel de control
    const controlMessageId = this.controlMessages.get(userId);
    if (controlMessageId && ctx.chat) {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, controlMessageId);
        this.logger.debug(`Control panel message deleted after Excel download for user ${userId}`);
      } catch (error) {
        // Ignore if message is already deleted
        this.logger.warn(`Could not delete control panel message: ${error}`);
      }
    }
    this.controlMessages.delete(userId);
    this.logger.info(`Control panel reset for user ${userId} - ready for new invoices`);
  }

  private async handleClearSession(ctx: any, userId: number): Promise<void> {
    const result = this.manageSessionUseCase.clearSession({ userId });

    // Audit log: Session cleared via button
    this.auditLogger.audit('SESSION_CLEARED', userId, {
      clearedCount: result.clearedCount,
      source: 'button',
      timestamp: new Date().toISOString(),
    });

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
    
    // ✅ Mantener el panel de control visible después de mostrar el resumen
    if (sessionInfo.hasSession && sessionInfo.invoiceCount > 0) {
      this.logger.debug(`Refreshing control panel after showing summary for user ${userId}`);
      await this.updateControlPanel(ctx, userId, sessionInfo.invoiceCount);
    }
  }

  // ========================================
  // Control Panel Management
  // ========================================

  private async updateControlPanel(ctx: Context, userId: number, totalInvoices: number): Promise<void> {
    if (!ctx.chat) {
      this.logger.warn(`No chat context for user ${userId}, cannot update control panel`);
      return;
    }

    this.logger.debug(`Scheduling control panel update for user ${userId} (${totalInvoices} invoices)`);

    this.pendingUpdates.set(userId, { 
      chatId: ctx.chat.id, 
      totalInvoices 
    });

    const existingTimeout = this.controlPanelUpdateQueue.get(userId);
    if (existingTimeout) {
      this.logger.debug(`Clearing existing timeout for user ${userId}`);
      clearTimeout(existingTimeout);
    }

    const timeout = setTimeout(async () => {
      try {
        this.logger.info(`Executing control panel update for user ${userId}`);
        const updateInfo = this.pendingUpdates.get(userId);
        if (updateInfo) {
          await this.performControlPanelUpdate(updateInfo.chatId, userId, updateInfo.totalInvoices);
          this.pendingUpdates.delete(userId);
        } else {
          this.logger.warn(`No pending update found for user ${userId}`);
        }
      } catch (error: any) {
        this.logger.error(`Error in control panel timeout callback: ${error.message}`);
      } finally {
        this.controlPanelUpdateQueue.delete(userId);
      }
    }, 2000); // Increased to 2 seconds for more reliable updates

    this.controlPanelUpdateQueue.set(userId, timeout);
  }

  private async performControlPanelUpdate(chatId: number, userId: number, totalInvoices: number): Promise<void> {
    this.logger.info(`▶️ Starting control panel update for user ${userId} with ${totalInvoices} invoices`);
    
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
        this.logger.debug(`Attempting to edit existing control panel message ID: ${existingMessageId}`);
        try {
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
          this.logger.success(`✅ Control panel UPDATED for user ${userId} (${totalInvoices} invoices)`);
          return; // Success, exit early
        } catch (editError: any) {
          // If edit fails, delete old message before creating new one
          this.logger.warn(`⚠️ Failed to edit control panel: ${editError.message}. Deleting old and creating new...`);
          try {
            await this.bot.telegram.deleteMessage(chatId, existingMessageId);
            this.logger.debug(`Old control panel message deleted`);
          } catch (deleteError: any) {
            this.logger.warn(`Could not delete old message: ${deleteError.message}`);
          }
          this.controlMessages.delete(userId);
        }
      }
      
      // Send new message (either no existing message or edit failed)
      this.logger.debug(`Sending new control panel message to chat ${chatId}`);
      const sentMessage = await this.bot.telegram.sendMessage(
        chatId,
        messageText,
        {
          parse_mode: 'Markdown',
          ...keyboard
        }
      );
      this.controlMessages.set(userId, sentMessage.message_id);
      this.logger.success(`✅ Control panel CREATED for user ${userId} (${totalInvoices} invoices)`);
      
    } catch (error: any) {
      this.logger.error(`❌ Error in control panel: ${error.message}`);
      
      // Final fallback: try one more time after a delay
      try {
        this.logger.info(`Attempting fallback retry...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        const sentMessage = await this.bot.telegram.sendMessage(
          chatId,
          messageText,
          {
            parse_mode: 'Markdown',
            ...keyboard
          }
        );
        this.controlMessages.set(userId, sentMessage.message_id);
        this.logger.success(`✅ Control panel created (fallback) for user ${userId}`);
      } catch (retryError: any) {
        this.logger.error(`❌ Fallback also failed: ${retryError.message}`);
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

