/**
 * DataStructures.ts
 * Clases para manejar comprobantes, respuestas y utilidades
 * Proporciona métodos helper para formatear y presentar datos
 */

import { Invoice, ProcessingResult } from './Interfaces';

/**
 * Clase InvoiceResponse
 * Gestiona el formateo y presentación de facturas procesadas
 */
export class InvoiceResponse {
  private invoice: Invoice;

  constructor(invoice: Invoice) {
    this.invoice = invoice;
  }

  /**
   * Genera un resumen legible para enviar al usuario
   * @returns String con resumen formateado
   */
  toReadableSummary(): string {
    const { invoice } = this;
    const confidenceEmoji = {
      high: '🟢',
      medium: '🟡',
      low: '🔴',
    };

    const summary = `
✅ **Comprobante procesado exitosamente**

📄 **Información General**
• Número: ${invoice.invoiceNumber}
• Fecha: ${this.formatDate(invoice.date)}
• Moneda: ${invoice.currency}
• Confianza: ${confidenceEmoji[invoice.metadata.confidence]} ${invoice.metadata.confidence.toUpperCase()}

🏢 **Proveedor**
• Nombre: ${invoice.vendor.name}
${invoice.vendor.taxId ? `• ID Fiscal: ${invoice.vendor.taxId}` : ''}
${invoice.vendor.address ? `• Dirección: ${invoice.vendor.address}` : ''}

💰 **Montos**
• Total: ${this.formatCurrency(invoice.totalAmount, invoice.currency)}
${invoice.taxes ? `• IVA: ${this.formatCurrency(invoice.taxes.iva, invoice.currency)}` : ''}
${invoice.taxes && invoice.taxes.otherTaxes > 0 ? `• Otros impuestos: ${this.formatCurrency(invoice.taxes.otherTaxes, invoice.currency)}` : ''}

📦 **Items** (${invoice.items.length})
${this.formatItems()}

${invoice.paymentMethod ? `💳 **Método de pago:** ${invoice.paymentMethod}` : ''}

⏱️ **Procesamiento**
• Tiempo: ${invoice.metadata.processingTimeMs}ms
• Modelo: ${invoice.metadata.model || 'N/A'}
    `.trim();

    return summary;
  }

  /**
   * Genera JSON bonito para adjuntar como archivo
   * @returns String con JSON formateado
   */
  toPrettyJSON(): string {
    return JSON.stringify(this.invoice, null, 2);
  }

  /**
   * Genera JSON minificado
   * @returns String con JSON minificado
   */
  toMinifiedJSON(): string {
    return JSON.stringify(this.invoice);
  }

  /**
   * Formatea items de la factura
   * @returns String con items formateados
   */
  private formatItems(): string {
    return this.invoice.items
      .map((item, index) => {
        return `${index + 1}. ${item.description}
   • Cantidad: ${item.quantity} x ${this.formatCurrency(item.unitPrice, this.invoice.currency)}
   • Subtotal: ${this.formatCurrency(item.subtotal, this.invoice.currency)}`;
      })
      .join('\n');
  }

  /**
   * Formatea fecha de YYYY-MM-DD a formato legible
   * @param dateString Fecha en formato YYYY-MM-DD
   * @returns Fecha formateada
   */
  private formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return dateString;
    }
  }

  /**
   * Formatea moneda según el código
   * @param amount Monto
   * @param currency Código de moneda (ISO 4217)
   * @returns String formateado
   */
  private formatCurrency(amount: number, currency: string): string {
    const symbols: Record<string, string> = {
      ARS: '$',
      USD: 'USD $',
      EUR: '€',
      BRL: 'R$',
      CLP: '$',
      MXN: '$',
      COP: '$',
    };

    const symbol = symbols[currency] || currency;
    return `${symbol}${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  /**
   * Obtiene la factura original
   * @returns Invoice object
   */
  getInvoice(): Invoice {
    return this.invoice;
  }
}

/**
 * Clase ProcessingResultFormatter
 * Maneja el formateo de resultados de procesamiento (éxito o error)
 */
export class ProcessingResultFormatter {
  /**
   * Formatea un resultado de procesamiento para el usuario
   * @param result Resultado del procesamiento
   * @returns String formateado para Telegram
   */
  static format(result: ProcessingResult): string {
    if (result.success && result.invoice) {
      const invoiceResponse = new InvoiceResponse(result.invoice);
      return invoiceResponse.toReadableSummary();
    }

    // Formatear error
    return this.formatError(result.error || 'Error desconocido');
  }

  /**
   * Formatea un mensaje de error amigable
   * @param errorMessage Mensaje de error técnico
   * @returns Mensaje formateado para el usuario
   */
  static formatError(errorMessage: string): string {
    // Mapear errores técnicos a mensajes amigables
    const friendlyMessages: Record<string, string> = {
      'imagen no existe': '❌ No se pudo encontrar la imagen. Por favor, intenta enviarla nuevamente.',
      'API Key': '❌ Error de configuración del servidor. Por favor, contacta al administrador.',
      'validación': '⚠️ No se pudo extraer toda la información del comprobante. Por favor, verifica que la imagen sea clara y legible.',
      'rate limit': '⏸️ Se ha alcanzado el límite de procesamiento. Por favor, intenta nuevamente en unos minutos.',
      'timeout': '⏱️ El procesamiento está tomando más tiempo de lo esperado. Por favor, intenta nuevamente.',
    };

    // Buscar mensaje amigable basado en keywords
    for (const [keyword, friendlyMsg] of Object.entries(friendlyMessages)) {
      if (errorMessage.toLowerCase().includes(keyword)) {
        return friendlyMsg;
      }
    }

    // Mensaje genérico si no hay match
    return `❌ **Error al procesar el comprobante**

${errorMessage}

💡 **Sugerencias:**
• Asegúrate de que la imagen sea clara y legible
• Verifica que el comprobante esté completo en la imagen
• Intenta con mejor iluminación si la foto está oscura
• Evita sombras o reflejos en el documento`;
  }

  /**
   * Genera un mensaje de bienvenida
   * @returns Mensaje de bienvenida
   */
  static welcomeMessage(): string {
    return `
👋 **¡Bienvenido al Bot de Procesamiento de Comprobantes!**

📸 **¿Cómo funciona?**
1. Envíame una foto o documento de tu factura o comprobante
2. Procesaré el archivo con IA
3. Acumularé las facturas en tu sesión
4. Descarga todas las facturas en un Excel profesional

✅ **Formatos soportados:**
• Imágenes: JPG, PNG, GIF, WEBP, BMP, TIFF
• Documentos: PDF, DOCX, DOC, XLSX, XLS, PPTX, PPT

🚀 **Comandos disponibles:**
• /start - Ver este mensaje
• /help - Ayuda detallada
• /facturas - Ver facturas acumuladas
• /limpiar - Limpiar sesión

¡Envía una imagen o documento para comenzar!
    `.trim();
  }

  /**
   * Genera un mensaje de ayuda
   * @returns Mensaje de ayuda
   */
  static helpMessage(): string {
    return `
📖 **Ayuda - Bot de Procesamiento de Comprobantes**

**¿Qué hace este bot?**
Extrae automáticamente información de facturas y comprobantes usando IA avanzada y genera archivos Excel profesionales.

**Información extraída:**
• Fecha de la operación
• Tipo de operación (Transferencia, etc.)
• CUIT del proveedor
• Monto bruto
• Banco receptor

**¿Cómo funciona?**
1. Envía una o varias imágenes de facturas
2. El bot las procesa y acumula en tu sesión
3. Presiona el botón "Descargar Excel" para obtener todas las facturas en un archivo
4. Puedes seguir agregando facturas antes de descargar

**Comandos útiles:**
• /facturas - Ver cuántas facturas tienes acumuladas
• /limpiar - Borrar todas las facturas y empezar de nuevo
• /stats - Ver estadísticas del sistema

**Consejos para mejores resultados:**
✓ Toma la foto con buena iluminación
✓ Asegúrate de que todo el comprobante sea visible
✓ Evita sombras, reflejos o desenfoques
✓ Las imágenes y documentos deben ser claros y legibles
✓ Screenshots también son aceptados

**Formatos aceptados:**
• **Imágenes:** JPG, PNG, GIF, WEBP, BMP, TIFF (ideal para fotos y screenshots)
• **Documentos:** PDF, DOCX, DOC (el bot extraerá automáticamente el contenido)
• **Hojas de cálculo:** XLSX, XLS (si contienen facturas escaneadas)
• **Presentaciones:** PPTX, PPT (si contienen facturas escaneadas)

**Limitaciones:**
• Máximo 10MB por archivo
• El bot puede tardar 5-20 segundos en procesar según el formato

**Privacidad:**
• Las imágenes se eliminan después del procesamiento
• Las facturas en sesión expiran después de 30 minutos de inactividad
• No almacenamos datos sensibles sin tu consentimiento

¿Necesitas más ayuda? Contacta al administrador.
    `.trim();
  }
}

/**
 * Clase Logger
 * Utilidad para logging consistente
 */
export class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  info(message: string, ...args: any[]): void {
    console.log(`[${this.context}] ℹ️  ${message}`, ...args);
  }

  success(message: string, ...args: any[]): void {
    console.log(`[${this.context}] ✅ ${message}`, ...args);
  }

  error(message: string, ...args: any[]): void {
    console.error(`[${this.context}] ❌ ${message}`, ...args);
  }

  warn(message: string, ...args: any[]): void {
    console.warn(`[${this.context}] ⚠️  ${message}`, ...args);
  }

  debug(message: string, ...args: any[]): void {
    if (process.env.LOG_LEVEL === 'debug') {
      console.debug(`[${this.context}] 🐛 ${message}`, ...args);
    }
  }
}
