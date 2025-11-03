/**
 * TelegramBot.ts
 * Manejo de la conexión, comandos y webhooks del bot
 * Gestiona el flujo completo: recepción → procesamiento → respuesta
 */

import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import { DocumentIngestor } from './DocumentIngestor';
import { VisionProcessor } from './VisionProcessor';
import { 
  ProcessingResultFormatter, 
  InvoiceResponse, 
  Logger 
} from './DataStructures';
import { ExcelGenerator } from './ExcelGenerator';
import { SessionManager } from './SessionManager';
import { Markup } from 'telegraf';

/**
 * Clase TelegramBot
 * Gestiona la interacción con usuarios a través de Telegram
 */
export class TelegramBot {
  private bot: Telegraf;
  private documentIngestor: DocumentIngestor;
  private visionProcessor: VisionProcessor;
  private excelGenerator: ExcelGenerator;
  private sessionManager: SessionManager;
  private logger: Logger;
  private controlMessages: Map<number, number>; // userId -> messageId del panel de control
  private controlPanelUpdateQueue: Map<number, NodeJS.Timeout>; // userId -> timeout para throttling
  private pendingUpdates: Map<number, { chatId: number; totalInvoices: number }>; // Info pendiente de actualización

  constructor(token: string) {
    this.bot = new Telegraf(token);
    this.documentIngestor = DocumentIngestor.fromEnv();
    this.visionProcessor = VisionProcessor.fromEnv();
    this.excelGenerator = new ExcelGenerator();
    this.sessionManager = new SessionManager(30); // 30 minutos de timeout
    this.logger = new Logger('TelegramBot');
    this.controlMessages = new Map();
    this.controlPanelUpdateQueue = new Map();
    this.pendingUpdates = new Map();

    this.setupCommands();
    this.setupHandlers();
  }

  /**
   * Configura los comandos del bot
   */
  private setupCommands(): void {
    // Comando /start
    this.bot.command('start', (ctx) => {
      this.logger.info(`Usuario ${ctx.from.id} ejecutó /start`);
      ctx.reply(ProcessingResultFormatter.welcomeMessage(), {
        parse_mode: 'Markdown',
      });
    });

    // Comando /help
    this.bot.command('help', (ctx) => {
      this.logger.info(`Usuario ${ctx.from.id} ejecutó /help`);
      ctx.reply(ProcessingResultFormatter.helpMessage(), {
        parse_mode: 'Markdown',
      });
    });

    // Comando /stats (opcional - estadísticas del storage)
    this.bot.command('stats', async (ctx) => {
      try {
        const stats = await this.documentIngestor.getStorageStats();
        const statsMessage = `
📊 **Estadísticas del Sistema**

• Archivos temporales: ${stats.totalFiles}
• Espacio usado: ${stats.totalSizeMB.toFixed(2)} MB
• Archivo más antiguo: ${stats.oldestFileAgeHours.toFixed(1)} horas
        `.trim();

        ctx.reply(statsMessage, { parse_mode: 'Markdown' });
      } catch (error: any) {
        ctx.reply('❌ Error obteniendo estadísticas');
      }
    });

    // Comando /facturas - Ver facturas acumuladas
    this.bot.command('facturas', async (ctx) => {
      if (!ctx.from) return;
      
      const userId = ctx.from.id;
      const count = this.sessionManager.getInvoiceCount(userId);

      if (count === 0) {
        ctx.reply('📭 No tienes facturas acumuladas.\n\nEnvía una imagen de una factura para comenzar.');
        return;
      }

      const message = `
📊 **Facturas Acumuladas**

• Total de facturas: ${count}
• Listas para descargar en Excel

🔽 Usa el botón "Descargar Excel" que aparece después de procesar cada factura, o envía más facturas para acumularlas.
      `.trim();

      ctx.reply(message, { parse_mode: 'Markdown' });
    });

    // Comando /limpiar - Limpiar sesión
    this.bot.command('limpiar', async (ctx) => {
      if (!ctx.from) return;
      
      const userId = ctx.from.id;
      const count = this.sessionManager.getInvoiceCount(userId);
      
      if (count === 0) {
        ctx.reply('✅ No hay facturas para limpiar.');
        return;
      }

      this.sessionManager.clearInvoices(userId);
      ctx.reply(`🗑️ Sesión limpiada.\n\n${count} factura(s) eliminada(s).`);
    });
  }

  /**
   * Configura los handlers para mensajes
   */
  private setupHandlers(): void {
    // Handler para fotos
    this.bot.on(message('photo'), async (ctx) => {
      await this.handlePhotoMessage(ctx);
    });

    // Handler para documentos (PDF, etc)
    this.bot.on(message('document'), async (ctx) => {
      await this.handleDocumentMessage(ctx);
    });

    // Handler para mensajes de texto (respuesta por defecto)
    this.bot.on(message('text'), (ctx) => {
      ctx.reply(
        '📸 Por favor, envíame una imagen de un comprobante o factura.\n\n' +
        'Usa /help para más información.',
        { parse_mode: 'Markdown' }
      );
    });

    // Handler para callback queries (botones)
    this.bot.on('callback_query', async (ctx) => {
      await this.handleCallbackQuery(ctx);
    });

    // Handler de errores
    this.bot.catch((err, ctx) => {
      this.logger.error(`Error para usuario ${ctx.from?.id}:`, err);
      ctx.reply(
        '❌ Ocurrió un error inesperado. Por favor, intenta nuevamente.\n\n' +
        'Si el problema persiste, usa /help para más información.'
      );
    });
  }

  /**
   * Actualiza o crea el panel de control con los botones (con throttling)
   */
  private async updateControlPanel(ctx: Context, userId: number, totalInvoices: number): Promise<void> {
    if (!ctx.chat) return;

    // Guardar info de la actualización pendiente
    this.pendingUpdates.set(userId, { 
      chatId: ctx.chat.id, 
      totalInvoices 
    });

    // Cancelar actualización pendiente si existe
    const existingTimeout = this.controlPanelUpdateQueue.get(userId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Programar actualización con un pequeño delay para evitar rate limits
    const timeout = setTimeout(async () => {
      const updateInfo = this.pendingUpdates.get(userId);
      if (updateInfo) {
        await this.performControlPanelUpdate(updateInfo.chatId, userId, updateInfo.totalInvoices);
        this.pendingUpdates.delete(userId);
      }
      this.controlPanelUpdateQueue.delete(userId);
    }, 500); // 500ms de delay

    this.controlPanelUpdateQueue.set(userId, timeout);
  }

  /**
   * Ejecuta la actualización real del panel de control
   */
  private async performControlPanelUpdate(chatId: number, userId: number, totalInvoices: number): Promise<void> {
    const messageText = `
📊 **Panel de Control**

📋 Facturas acumuladas: **${totalInvoices}**

💡 Envía más facturas o descarga el Excel
    `.trim();

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
        // Intentar editar el mensaje existente
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
        this.logger.info(`Panel de control actualizado para usuario ${userId} (${totalInvoices} facturas)`);
      } else {
        // Crear nuevo mensaje y guardar su ID
        const sentMessage = await this.bot.telegram.sendMessage(
          chatId,
          messageText,
          keyboard
        );
        this.controlMessages.set(userId, sentMessage.message_id);
        this.logger.info(`Panel de control creado para usuario ${userId} (${totalInvoices} facturas)`);
      }
    } catch (error: any) {
      this.logger.error(`Error en panel de control: ${error.message}`);
      
      // Si falla la edición (mensaje borrado o demasiados requests), crear uno nuevo
      if (error.response?.error_code === 400 || error.response?.error_code === 429) {
        try {
          await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1 segundo
          const sentMessage = await this.bot.telegram.sendMessage(
            chatId,
            messageText,
            keyboard
          );
          this.controlMessages.set(userId, sentMessage.message_id);
          this.logger.info(`Panel de control recreado para usuario ${userId}`);
        } catch (retryError: any) {
          this.logger.error('Error creando panel de control:', retryError.message);
        }
      }
    }
  }

  /**
   * Maneja mensajes con fotos
   */
  private async handlePhotoMessage(ctx: Context & { message: any }): Promise<void> {
    if (!ctx.from || !ctx.chat) return;
    
    const userId = ctx.from.id;
    const messageId = ctx.message.message_id;

    try {
      // Enviar mensaje de "procesando"
      const processingMsg = await ctx.reply('⏳ Procesando comprobante...');

      this.logger.info(`Procesando foto de usuario ${userId}`);

      // Obtener la foto de mayor resolución
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      
      // Obtener URL del archivo
      const file = await ctx.telegram.getFile(photo.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

      // 1. Descargar y almacenar imagen
      const storageResult = await this.documentIngestor.downloadAndStore(
        fileUrl,
        userId,
        messageId
      );

      if (!storageResult.success || !storageResult.filePath) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMsg.message_id,
          undefined,
          `❌ ${storageResult.error || 'Error descargando imagen'}`
        );
        return;
      }

      // 2. Procesar imagen con VisionProcessor
      const processingResult = await this.visionProcessor.processInvoiceImage({
        imagePath: storageResult.filePath,
        userId,
        messageId,
        detail: 'high',
      });

      // 3. Eliminar imagen temporal inmediatamente si está configurado así
      if (parseInt(process.env.IMAGE_RETENTION_HOURS || '0') === 0) {
        await this.documentIngestor.deleteFile(storageResult.filePath);
      }

      // 4. Enviar resultado al usuario
      if (processingResult.success && processingResult.invoice) {
        // Agregar factura a la sesión del usuario
        this.sessionManager.addInvoice(userId, processingResult.invoice);
        const totalInvoices = this.sessionManager.getInvoiceCount(userId);

        // Editar mensaje de "procesando" con confirmación compacta
        const invoiceResponse = new InvoiceResponse(processingResult.invoice);
        
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMsg.message_id,
          undefined,
          `✅ ${invoiceResponse.toCompactSummary()}`,
          { parse_mode: 'Markdown' }
        );

        // Actualizar o crear panel de control
        await this.updateControlPanel(ctx, userId, totalInvoices);

        this.logger.success(`✅ Comprobante procesado para usuario ${userId}. Total: ${totalInvoices}`);
      } else {
        // Error en el procesamiento
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMsg.message_id,
          undefined,
          ProcessingResultFormatter.formatError(
            processingResult.error || 'Error desconocido'
          ),
          { parse_mode: 'Markdown' }
        );

        this.logger.error(`❌ Error procesando comprobante: ${processingResult.error}`);
      }

    } catch (error: any) {
      this.logger.error('Error en handlePhotoMessage:', error);
      ctx.reply(
        ProcessingResultFormatter.formatError(error.message),
        { parse_mode: 'Markdown' }
      );
    }
  }

  /**
   * Maneja mensajes con documentos (PDF, etc)
   */
  private async handleDocumentMessage(ctx: Context & { message: any }): Promise<void> {
    if (!ctx.from || !ctx.chat) return;
    
    const document = ctx.message.document;

    // Validar que sea un formato soportado
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

    // Validar tamaño
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

    // Procesar documento (mismo flujo que foto)
    const userId = ctx.from.id;
    const messageId = ctx.message.message_id;

    try {
      const processingMsg = await ctx.reply('⏳ Procesando documento...');

      // Obtener URL del archivo
      const file = await ctx.telegram.getFile(document.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

      // Mismo flujo que handlePhotoMessage
      const storageResult = await this.documentIngestor.downloadAndStore(
        fileUrl,
        userId,
        messageId
      );

      if (!storageResult.success || !storageResult.filePath) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMsg.message_id,
          undefined,
          `❌ ${storageResult.error || 'Error descargando documento'}`
        );
        return;
      }

      const processingResult = await this.visionProcessor.processInvoiceImage({
        imagePath: storageResult.filePath,
        userId,
        messageId,
        detail: 'high',
      });

      if (parseInt(process.env.IMAGE_RETENTION_HOURS || '0') === 0) {
        await this.documentIngestor.deleteFile(storageResult.filePath);
      }

      if (processingResult.success && processingResult.invoice) {
        // Agregar factura a la sesión del usuario
        this.sessionManager.addInvoice(userId, processingResult.invoice);
        const totalInvoices = this.sessionManager.getInvoiceCount(userId);

        // Editar mensaje de "procesando" con confirmación compacta
        const invoiceResponse = new InvoiceResponse(processingResult.invoice);
        
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMsg.message_id,
          undefined,
          `✅ ${invoiceResponse.toCompactSummary()}`,
          { parse_mode: 'Markdown' }
        );

        // Actualizar o crear panel de control
        await this.updateControlPanel(ctx, userId, totalInvoices);

        this.logger.success(`✅ Documento procesado para usuario ${userId}. Total: ${totalInvoices}`);
      } else {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMsg.message_id,
          undefined,
          ProcessingResultFormatter.formatError(
            processingResult.error || 'Error desconocido'
          ),
          { parse_mode: 'Markdown' }
        );
      }

    } catch (error: any) {
      this.logger.error('Error en handleDocumentMessage:', error);
      ctx.reply(
        ProcessingResultFormatter.formatError(error.message),
        { parse_mode: 'Markdown' }
      );
    }
  }

  /**
   * Maneja callback queries (botones inline)
   */
  private async handleCallbackQuery(ctx: any): Promise<void> {
    if (!ctx.from || !ctx.callbackQuery) return;

    const userId = ctx.from.id;
    const action = ctx.callbackQuery.data;

    try {
      // Responder al callback para quitar el "loading" del botón
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
      this.logger.error('Error en handleCallbackQuery:', error);
      await ctx.reply('❌ Error al procesar la acción.');
    }
  }

  /**
   * Maneja la descarga del Excel
   */
  private async handleDownloadExcel(ctx: any, userId: number): Promise<void> {
    const invoices = this.sessionManager.getInvoices(userId);

    if (invoices.length === 0) {
      await ctx.reply('📭 No tienes facturas para descargar.');
      return;
    }

    try {
      // Mostrar mensaje de generación
      const generatingMsg = await ctx.reply('⏳ Generando archivo Excel...');

      // Generar Excel
      const excelBuffer = await this.excelGenerator.generateExcel(invoices);

      // Eliminar mensaje de "generando"
      await ctx.telegram.deleteMessage(ctx.chat.id, generatingMsg.message_id);

      // Enviar archivo Excel
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const filename = `facturas_${userId}_${timestamp}.xlsx`;

      await ctx.replyWithDocument(
        {
          source: excelBuffer,
          filename: filename,
        },
        {
          caption: `📊 Excel con ${invoices.length} factura(s)\n\n` +
            `✅ Las facturas siguen en tu sesión. Usa /limpiar si quieres empezar de nuevo.`,
        }
      );

      this.logger.success(`Excel generado y enviado a usuario ${userId}`);
    } catch (error: any) {
      this.logger.error('Error generando Excel:', error);
      await ctx.reply('❌ Error al generar el archivo Excel. Por favor, intenta nuevamente.');
    }
  }

  /**
   * Maneja la limpieza de sesión
   */
  private async handleClearSession(ctx: any, userId: number): Promise<void> {
    const count = this.sessionManager.getInvoiceCount(userId);

    if (count === 0) {
      await ctx.reply('✅ No hay facturas para limpiar.');
      return;
    }

    this.sessionManager.clearInvoices(userId);
    
    // Intentar borrar el panel de control
    const controlMessageId = this.controlMessages.get(userId);
    if (controlMessageId && ctx.chat) {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, controlMessageId);
      } catch (error) {
        // Si falla, no importa (el mensaje ya fue borrado por el usuario)
      }
    }
    
    // Limpiar el registro del panel de control
    this.controlMessages.delete(userId);
    
    await ctx.reply(`🗑️ Sesión limpiada.\n\n${count} factura(s) eliminada(s).\n\n` +
      `Envía una nueva imagen para comenzar.`);
    
    this.logger.info(`Sesión limpiada para usuario ${userId}`);
  }

  /**
   * Maneja la visualización del resumen de facturas
   */
  private async handleShowSummary(ctx: any, userId: number): Promise<void> {
    const invoices = this.sessionManager.getInvoices(userId);

    if (invoices.length === 0) {
      await ctx.reply('📭 No tienes facturas acumuladas.');
      return;
    }

    // Calcular totales
    const totalAmount = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const currencies = [...new Set(invoices.map(inv => inv.currency))];

    // Generar resumen por vendor/banco
    const vendorSummary = new Map<string, number>();
    invoices.forEach(inv => {
      const vendor = inv.vendor.name;
      const current = vendorSummary.get(vendor) || 0;
      vendorSummary.set(vendor, current + inv.totalAmount);
    });

    let summaryText = `📊 **Resumen de Facturas**\n\n`;
    summaryText += `• Total de facturas: ${invoices.length}\n`;
    summaryText += `• Monto total: $${totalAmount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    summaryText += `• Moneda(s): ${currencies.join(', ')}\n\n`;

    if (vendorSummary.size > 0) {
      summaryText += `**Desglose por Banco/Proveedor:**\n`;
      vendorSummary.forEach((amount, vendor) => {
        summaryText += `• ${vendor}: $${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      });
    }

    summaryText += `\n💡 Usa el botón "Descargar Excel" para obtener todas las facturas en un archivo.`;

    await ctx.reply(summaryText, { parse_mode: 'Markdown' });
  }

  /**
   * Inicia el bot (polling)
   */
  async launch(): Promise<void> {
    try {
      this.logger.info('🚀 Iniciando bot de Telegram...');
      
      // Obtener info del bot
      const botInfo = await this.bot.telegram.getMe();
      this.logger.success(`Bot iniciado: @${botInfo.username}`);
      
      // Iniciar bot con polling
      await this.bot.launch();
      
      this.logger.success('✅ Bot activo y escuchando mensajes');
      
      // Graceful shutdown
      process.once('SIGINT', () => this.stop('SIGINT'));
      process.once('SIGTERM', () => this.stop('SIGTERM'));
      
    } catch (error: any) {
      this.logger.error('Error iniciando bot:', error);
      throw error;
    }
  }

  /**
   * Detiene el bot de forma limpia
   */
  async stop(signal?: string): Promise<void> {
    this.logger.info(`Deteniendo bot${signal ? ` (${signal})` : ''}...`);
    await this.bot.stop(signal);
    this.logger.success('Bot detenido');
  }

  /**
   * Obtiene la instancia del bot (para testing o configuración avanzada)
   */
  getBot(): Telegraf {
    return this.bot;
  }
}
