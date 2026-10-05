/**
 * InvoiceFormatter.ts
 * Formats invoice data for presentation layer
 * Single Responsibility: Format invoices for Telegram messages
 */

import { Invoice } from '../../domain/entities/Invoice.entity';

export class InvoiceFormatter {
  /**
   * Format invoice as compact summary
   */
  static toCompactSummary(invoice: Invoice): string {
    const formattedDate = invoice.getFormattedDate();
    const formattedAmount = invoice.getFormattedAmount();
    
    let summary = `📄 Fecha: ${formattedDate}\n`;
    
    if (invoice.operationType) {
      summary += `💼 Tipo de Operación: ${invoice.operationType}\n`;
    }
    
    if (invoice.vendor.taxId) {
      summary += `🆔 CUIT: ${invoice.vendor.taxId}\n`;
    }
    
    summary += `💰 Monto Bruto: ${formattedAmount}\n`;
    
    if (invoice.receiverBank) {
      summary += `🏦 Banco Receptor: ${invoice.receiverBank}\n`;
    }

    return summary;
  }

  /**
   * Format invoice as detailed summary
   */
  static toDetailedSummary(invoice: Invoice): string {
    let summary = `📄 **Comprobante Procesado**\n\n`;
    summary += `**Número:** ${invoice.invoiceNumber}\n`;
    summary += `**Fecha:** ${invoice.getFormattedDate()}\n`;
    
    if (invoice.operationType) {
      summary += `**Tipo de Operación:** ${invoice.operationType}\n`;
    }

    summary += `\n**Proveedor:**\n`;
    summary += `• Nombre: ${invoice.vendor.name}\n`;
    
    if (invoice.vendor.taxId) {
      summary += `• CUIT/Tax ID: ${invoice.vendor.taxId}\n`;
    }
    
    if (invoice.vendor.cvu) {
      summary += `• CVU: ${invoice.vendor.cvu}\n`;
    }

    summary += `\n**Monto Total:** ${invoice.getFormattedAmount()}\n`;
    
    if (invoice.receiverBank) {
      summary += `**Banco Receptor:** ${invoice.receiverBank}\n`;
    }

    if (invoice.paymentMethod) {
      summary += `**Método de Pago:** ${invoice.paymentMethod}\n`;
    }

    // Add items if present
    const items = invoice.items;
    if (items.length > 0) {
      summary += `\n**Items:**\n`;
      items.forEach((item, index) => {
        summary += `${index + 1}. ${item.description} - ${item.quantity}x $${item.unitPrice.toFixed(2)}\n`;
      });
    }

    // Add confidence indicator
    const confidence = invoice.isHighConfidence() ? '🟢 Alta' : '🟡 Media';
    summary += `\n**Confianza:** ${confidence}`;

    return summary;
  }

  /**
   * Format session summary
   */
  static formatSessionSummary(
    invoiceCount: number,
    totalAmount: number,
    currencies: string[],
    vendorSummary: Map<string, number>
  ): string {
    let summary = `📊 **Resumen de Comprobantes**\n\n`;
    summary += `• Total de comprobantes: ${invoiceCount}\n`;
    summary += `• Monto total: $${totalAmount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    summary += `• Moneda(s): ${currencies.join(', ')}\n\n`;

    if (vendorSummary.size > 0) {
      summary += `**Desglose por Banco/Proveedor:**\n`;
      vendorSummary.forEach((amount, vendor) => {
        summary += `• ${vendor}: $${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      });
    }

    summary += `\n💡 Usa el botón "Descargar Excel" para obtener todos los comprobantes en un archivo.`;

    return summary;
  }
}

