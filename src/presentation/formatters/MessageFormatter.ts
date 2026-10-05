/**
 * MessageFormatter.ts
 * Formats system messages for presentation layer
 * Single Responsibility: Format system messages for Telegram
 */

import { IProcessArchiveResponse } from '../../application/use-cases/ProcessArchiveUseCase';

/** Telegram allows 4096 chars per message; keep a margin for safety */
const ARCHIVE_MESSAGE_CHUNK_SIZE = 3800;

export class MessageFormatter {
  /**
   * Welcome message for /start command
   */
  static welcomeMessage(): string {
    return `
🤖 **¡Bienvenido al Bot de Procesamiento de Comprobantes!**

Este bot utiliza Inteligencia Artificial para extraer automáticamente datos de tus comprobantes.

**¿Cómo funciona?**
1. Envía una foto, documento o un ZIP con varios comprobantes
2. El bot lo procesará automáticamente
3. Recibirás un resumen con los datos extraídos
4. Los comprobantes se acumulan en tu sesión
5. Descarga un Excel con todos tus comprobantes cuando quieras

**Comandos disponibles:**
• /help - Ver ayuda detallada
• /comprobantes - Ver comprobantes acumulados
• /limpiar - Limpiar sesión actual
• /stats - Estadísticas del sistema

¡Envía tu primer comprobante para comenzar! 📸
    `.trim();
  }

  /**
   * Help message for /help command
   */
  static helpMessage(): string {
    return `
📖 **Ayuda - Bot de Procesamiento de Comprobantes**

**Formatos soportados:**
📷 Imágenes: JPG, PNG, GIF, WEBP, BMP, TIFF
📄 Documentos: PDF, DOCX, DOC
📊 Hojas de cálculo: XLSX, XLS
🎨 Presentaciones: PPTX, PPT
📦 Comprimidos: ZIP con varios comprobantes (JPG, PNG, GIF, WEBP, PDF)

**¿Cómo usar el bot?**
1. **Envía tu comprobante** (foto o documento)
2. **Espera 5-15 segundos** mientras lo procesamos
3. **Revisa el resumen** con los datos extraídos
4. **Envía más comprobantes** si lo deseas (se acumulan)
5. **Descarga Excel** con el botón cuando termines
6. **La sesión se limpia automáticamente** después de descargar

**Comandos:**
• \`/start\` - Mensaje de bienvenida
• \`/help\` - Esta ayuda
• \`/comprobantes\` - Ver cuántos comprobantes tienes acumulados
• \`/limpiar\` - Limpiar tu sesión manualmente (también se limpia automáticamente al descargar Excel)
• \`/stats\` - Ver estadísticas del sistema

**Datos extraídos:**
✅ Número de comprobante
✅ Fecha
✅ Proveedor (nombre, CUIT)
✅ Monto total
✅ Banco receptor
✅ Tipo de operación
✅ Método de pago

**Tips para mejores resultados:**
• Usa fotos bien iluminadas
• Evita sombras y reflejos
• Asegúrate de que el texto sea legible
• Los archivos PDF suelen dar mejores resultados

¿Preguntas? ¡Envía tu comprobante y prueba! 🚀
    `.trim();
  }

  /**
   * Format error message
   */
  static formatError(error: string): string {
    return `❌ **Error al procesar**\n\n${error}\n\n💡 **Sugerencias:**\n• Verifica que la imagen sea clara y legible\n• Asegúrate de enviar un comprobante válido\n• Intenta con mejor iluminación\n• Usa /help para más información`;
  }

  /**
   * Processing message
   */
  static processingMessage(): string {
    return '⏳ Procesando comprobante...';
  }

  /**
   * Excel generation message
   */
  static generatingExcelMessage(): string {
    return '⏳ Generando archivo Excel...';
  }

  /**
   * No invoices message
   */
  static noInvoicesMessage(): string {
    return '📭 No tienes comprobantes acumulados.\n\nEnvía una imagen de un comprobante para comenzar.';
  }

  /**
   * Session cleared message
   */
  static sessionClearedMessage(count: number): string {
    return `🗑️ Sesión limpiada.\n\n${count} comprobante(s) eliminado(s).\n\nEnvía una nueva imagen para comenzar.`;
  }

  /**
   * Excel sent message
   */
  static excelSentMessage(count: number): string {
    return `📊 Excel con ${count} comprobante(s)\n\n✅ Los comprobantes siguen en tu sesión. Usa /limpiar si quieres empezar de nuevo.`;
  }

  /**
   * Storage stats message
   */
  static storageStatsMessage(totalFiles: number, totalSizeMB: number, oldestFileAgeHours: number): string {
    return `
📊 **Estadísticas del Sistema**

• Archivos temporales: ${totalFiles}
• Espacio usado: ${totalSizeMB.toFixed(2)} MB
• Archivo más antiguo: ${oldestFileAgeHours.toFixed(1)} horas
    `.trim();
  }

  /**
   * AI provider unavailable (no credit, invalid key...). Never exposes provider details.
   */
  static providerUnavailableMessage(processedCount: number = 0): string {
    const partial =
      processedCount > 0
        ? `\n\n✅ Se alcanzaron a procesar ${processedCount} comprobante(s); quedaron guardados en tu sesión.`
        : '';
    return (
      `⚠️ El servicio de IA no está disponible en este momento.\n\n` +
      `No se procesaron (más) comprobantes. Contacta al administrador e intenta más tarde.` +
      partial
    );
  }

  /**
   * Escape Telegram legacy Markdown control characters in user-provided text
   */
  static escapeMarkdown(text: string): string {
    return text.replace(/([_*`[])/g, '\\$1');
  }

  /**
   * Archive processing progress message
   */
  static archiveProgressMessage(processed: number, total: number): string {
    return `📦 Procesando archivo comprimido...\n\n⏳ ${processed}/${total} comprobante(s) procesado(s)`;
  }

  /**
   * Archive result summary, split in chunks that fit Telegram's message limit
   */
  static archiveResultMessages(archiveName: string, response: IProcessArchiveResponse): string[] {
    const header =
      `📦 *Archivo procesado:* ${MessageFormatter.escapeMarkdown(archiveName)}\n\n` +
      `✅ Procesados: ${response.processedCount}/${response.items.length}\n` +
      (response.failedCount > 0 ? `❌ Con error: ${response.failedCount}\n` : '') +
      (response.skipped.length > 0 ? `⏭️ Omitidos: ${response.skipped.length}\n` : '');

    const lines: string[] = [header, '*Comprobantes:*'];

    response.items.forEach((item, index) => {
      const fileName = MessageFormatter.escapeMarkdown(item.fileName);
      if (item.success && item.invoice) {
        const invoice = item.invoice;
        const details = [invoice.payer?.name || invoice.vendor.name, invoice.getFormattedAmount(), invoice.getFormattedDate()]
          .filter(Boolean)
          .map((value) => MessageFormatter.escapeMarkdown(String(value)))
          .join(' · ');
        lines.push(`${index + 1}. ✅ ${fileName}\n     ${details}`);
      } else {
        const error = MessageFormatter.escapeMarkdown(MessageFormatter.truncate(item.error || 'Error desconocido', 120));
        lines.push(`${index + 1}. ❌ ${fileName}\n     ${error}`);
      }
    });

    if (response.skipped.length > 0) {
      lines.push('\n*Omitidos:*');
      response.skipped.forEach((entry) => {
        lines.push(
          `• ${MessageFormatter.escapeMarkdown(entry.originalName)} — ${MessageFormatter.escapeMarkdown(entry.reason)}`
        );
      });
    }

    return MessageFormatter.chunkLines(lines, ARCHIVE_MESSAGE_CHUNK_SIZE);
  }

  /**
   * Archive too large message
   */
  static archiveTooLargeMessage(maxSizeMB: number, fileSizeMB: number): string {
    return `⚠️ Archivo comprimido muy grande.\n\nTamaño máximo: ${maxSizeMB} MB\nTu archivo: ${fileSizeMB.toFixed(2)} MB`;
  }

  private static truncate(text: string, maxLength: number): string {
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
  }

  private static chunkLines(lines: string[], maxLength: number): string[] {
    const chunks: string[] = [];
    let current = '';

    for (const line of lines) {
      const candidate = current ? `${current}\n${line}` : line;
      if (candidate.length > maxLength && current) {
        chunks.push(current);
        current = line.slice(0, maxLength);
      } else {
        current = candidate.slice(0, maxLength);
      }
    }

    if (current) chunks.push(current);
    return chunks;
  }

  /**
   * Control panel message
   */
  static controlPanelMessage(totalInvoices: number): string {
    return `
📊 **Panel de Control**

📋 Comprobantes acumulados: **${totalInvoices}**

💡 Envía más comprobantes o descarga el Excel
    `.trim();
  }
}

