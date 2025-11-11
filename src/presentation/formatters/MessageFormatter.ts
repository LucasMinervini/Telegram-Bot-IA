/**
 * MessageFormatter.ts
 * Formats system messages for presentation layer
 * Single Responsibility: Format system messages for Telegram
 */

export class MessageFormatter {
  /**
   * Welcome message for /start command
   */
  static welcomeMessage(): string {
    return `
🤖 **¡Bienvenido al Bot de Procesamiento de Comprobantes!**

Este bot utiliza Inteligencia Artificial para extraer automáticamente datos de tus facturas y comprobantes.

**¿Cómo funciona?**
1. Envía una foto o documento de tu comprobante
2. El bot lo procesará automáticamente
3. Recibirás un resumen con los datos extraídos
4. Las facturas se acumulan en tu sesión
5. Descarga un Excel con todas tus facturas cuando quieras

**Comandos disponibles:**
• /help - Ver ayuda detallada
• /facturas - Ver facturas acumuladas
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

**¿Cómo usar el bot?**
1. **Envía tu comprobante** (foto o documento)
2. **Espera 5-15 segundos** mientras lo procesamos
3. **Revisa el resumen** con los datos extraídos
4. **Envía más facturas** si lo deseas (se acumulan)
5. **Descarga Excel** con el botón cuando termines
6. **La sesión se limpia automáticamente** después de descargar

**Comandos:**
• \`/start\` - Mensaje de bienvenida
• \`/help\` - Esta ayuda
• \`/facturas\` - Ver cuántas facturas tienes acumuladas
• \`/limpiar\` - Limpiar tu sesión manualmente (también se limpia automáticamente al descargar Excel)
• \`/stats\` - Ver estadísticas del sistema

**Datos extraídos:**
✅ Número de factura
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
    return '📭 No tienes facturas acumuladas.\n\nEnvía una imagen de una factura para comenzar.';
  }

  /**
   * Session cleared message
   */
  static sessionClearedMessage(count: number): string {
    return `🗑️ Sesión limpiada.\n\n${count} factura(s) eliminada(s).\n\nEnvía una nueva imagen para comenzar.`;
  }

  /**
   * Excel sent message
   */
  static excelSentMessage(count: number): string {
    return `📊 Excel con ${count} factura(s)\n\n✅ Las facturas siguen en tu sesión. Usa /limpiar si quieres empezar de nuevo.`;
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
   * Control panel message
   */
  static controlPanelMessage(totalInvoices: number): string {
    return `
📊 **Panel de Control**

📋 Facturas acumuladas: **${totalInvoices}**

💡 Envía más facturas o descarga el Excel
    `.trim();
  }
}

