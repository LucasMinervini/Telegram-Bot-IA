/**
 * ExcelJSGenerator.ts
 * Clean implementation of Excel generation with professional formatting
 * Implements IExcelGenerator interface without legacy dependencies
 * Follows Clean Architecture and SOLID principles
 */

import ExcelJS from 'exceljs';
import fs from 'fs-extra';
import { IExcelGenerator } from '../../domain/interfaces/IExcelGenerator';
import { Invoice } from '../../domain/entities/Invoice.entity';

interface IExcelRow {
  fecha: string;
  tipoOperacion: string;
  cuit: string;
  montoBruto: number;
  bancoReceptor: string;
}

/**
 * ExcelJS-based Excel Generator Implementation
 * Direct implementation without wrappers - Clean Architecture compliant
 */
export class ExcelJSGenerator implements IExcelGenerator {
  
  async generateExcel(invoices: Invoice[]): Promise<Buffer> {
    console.log(`[ExcelJSGenerator] Generating Excel with ${invoices.length} invoice(s)`);

    // Create workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Facturas', {
      properties: { tabColor: { argb: 'FF0066CC' } },
    });

    // Configure columns (widths will be auto-adjusted later)
    worksheet.columns = [
      { header: 'Fecha', key: 'fecha' },
      { header: 'Tipo Operación', key: 'tipoOperacion' },
      { header: 'Cuit', key: 'cuit' },
      { header: 'Monto Bruto', key: 'montoBruto' },
      { header: 'Banco receptor', key: 'bancoReceptor' },
    ];

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.height = 35;
    
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0066CC' }, // Blue
      };
      cell.font = {
        name: 'Segoe UI',
        size: 13,
        bold: true,
        color: { argb: 'FFFFFFFF' }, // White
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } },
      };
    });

    // Add invoice data
    invoices.forEach((invoice) => {
      const rowData = this.invoiceToRow(invoice);
      const row = worksheet.addRow(rowData);
      row.height = 22;

      // Style data cells
      row.eachCell((cell, colNumber) => {
        // Yellow background
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFFF00' }, // Yellow
        };

        // Borders
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } },
        };

        // Center alignment with text wrap for long content
        cell.alignment = { 
          vertical: 'middle', 
          horizontal: 'center',
          wrapText: true,
        };

        // Currency format for amount column
        if (colNumber === 4) {
          cell.numFmt = '$#,##0.00';
        }

        // Font
        cell.font = {
          name: 'Segoe UI',
          size: 11,
        };
      });
    });

    // Auto-adjust column widths based on content
    this.autoAdjustColumnWidths(worksheet);

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    console.log('[ExcelJSGenerator] ✅ Excel generated successfully');
    
    return Buffer.from(buffer);
  }

  async generateAndSaveExcel(invoices: Invoice[], outputPath: string): Promise<void> {
    const buffer = await this.generateExcel(invoices);
    await fs.writeFile(outputPath, buffer);
    console.log(`[ExcelJSGenerator] ✅ Excel saved to ${outputPath}`);
  }

  /**
   * Convert invoice to Excel row format
   */
  private invoiceToRow(invoice: Invoice): IExcelRow {
    const dateFormatted = this.formatDateForExcel(invoice.date);
    
    // Normalize operation type
    const tipoOperacion = this.normalizeOperationType(
      invoice.operationType || this.extractOperationType(invoice.paymentMethod)
    );
    
    // CUIT column should prioritize taxId (actual CUIT), not CVU
    let cuit = '';
    if (invoice.vendor.taxId) {
      const formattedCuit = this.formatCUIT(invoice.vendor.taxId);
      // Validate if it's actually a CUIT and not a name
      if (this.isValidCUITFormat(formattedCuit)) {
        cuit = formattedCuit;
      } else {
        // If taxId is actually a name/text, treat as not found
        cuit = '';
      }
    }
    
    // Replace undefined/empty values with friendly message
    cuit = this.sanitizeValue(cuit);
    
    const montoBruto = invoice.totalAmount;
    
    // Banco receptor: use LLM extraction, fallback to vendor name (who is the receiver)
    let bancoReceptor = invoice.receiverBank || '';
    
    // Special handling for BNA and Banco Galicia: If receiverBank is empty and vendor name exists, use vendor name
    // This handles the case where these banks' transfers show "Banco: -" but the recipient name should be used
    // The LLM should extract this correctly, but this is a safety fallback
    if (!bancoReceptor || bancoReceptor.trim() === '') {
      // Use vendor name as bank receptor (they are the money receiver)
      bancoReceptor = this.extractBankName(invoice.vendor.name);
    }
    
    bancoReceptor = this.sanitizeValue(bancoReceptor);

    return {
      fecha: dateFormatted,
      tipoOperacion,
      cuit,
      montoBruto,
      bancoReceptor,
    };
  }

  /**
   * Sanitize value - replace undefined/empty with user-friendly message
   */
  private sanitizeValue(value: any): string {
    if (value === undefined || value === null || value === '' || value === 'undefined') {
      return 'No encontrado en la factura';
    }
    return String(value);
  }

  /**
   * Format date from YYYY-MM-DD to DD/MM/YYYY
   */
  private formatDateForExcel(dateString: string): string {
    if (!dateString) return dateString;
    
    try {
      const parts = dateString.split('-');
      if (parts.length !== 3) {
        return dateString;
      }
      
      const [year, month, day] = parts;
      
      if (!year || !month || !day || isNaN(Number(year)) || isNaN(Number(month)) || isNaN(Number(day))) {
        return dateString;
      }
      
      return `${day}/${month}/${year}`;
    } catch {
      return dateString;
    }
  }

  /**
   * Extract operation type from payment method
   */
  private extractOperationType(paymentMethod?: string): string {
    if (!paymentMethod) return 'Transferencia';
    
    const method = paymentMethod.toLowerCase();
    
    if (method.includes('transfer') || method.includes('transferencia')) {
      return 'Transferencia';
    } else if (method.includes('efectivo') || method.includes('cash')) {
      return 'Efectivo';
    } else if (method.includes('cheque') || method.includes('check')) {
      return 'Cheque';
    } else if (method.includes('tarjeta') || method.includes('card')) {
      return 'Tarjeta';
    }
    
    return 'Transferencia'; // Default
  }

  /**
   * Validate if a string is a valid CUIT format
   */
  private isValidCUITFormat(cuit: string): boolean {
    if (!cuit || typeof cuit !== 'string') return false;
    
    // Remove dashes and spaces for validation
    const cleaned = cuit.replace(/[-\s]/g, '');
    
    // Must be exactly 11 digits
    if (cleaned.length !== 11 || !/^\d{11}$/.test(cleaned)) {
      return false;
    }
    
    // Check if it's not a suspicious pattern (like all same digits)
    const allSame = /^(\d)\1{10}$/.test(cleaned);
    if (allSame) return false;
    
    return true;
  }

  /**
   * Format CUIT with dashes (XX-XXXXXXXX-X)
   */
  private formatCUIT(cuit: string): string {
    if (!cuit) return '';
    
    // Remove any non-digit characters and "CUIT" prefix
    const cleaned = cuit.replace(/[^\d]/g, '').trim();
    
    // Check if it's a valid CUIT length (11 digits)
    if (cleaned.length === 11) {
      return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 10)}-${cleaned.slice(10)}`;
    }
    
    // If not 11 digits, return as-is (might be a name or invalid)
    return cuit;
  }

  /**
   * Normalize operation type with proper capitalization
   */
  private normalizeOperationType(operationType: string): string {
    if (!operationType) return 'Transferencia';
    
    const normalized = operationType.trim().toLowerCase();
    
    // Map common variations to standardized format
    const operationMap: Record<string, string> = {
      'transferencia': 'Transferencia',
      'transfer': 'Transferencia',
      'mercado pago': 'Mercado Pago',
      'mercadopago': 'Mercado Pago',
      'efectivo': 'Efectivo',
      'cash': 'Efectivo',
      'cheque': 'Cheque',
      'tarjeta': 'Tarjeta',
      'card': 'Tarjeta',
      'debito': 'Débito',
      'credito': 'Crédito',
      'varios': 'Varios',
      'transferencias simples': 'Transferencia',
      'transferencias - transferencias simples': 'Transferencia',
    };
    
    // Check if we have a direct match
    if (operationMap[normalized]) {
      return operationMap[normalized];
    }
    
    // If contains "transfer", return "Transferencia"
    if (normalized.includes('transfer')) {
      return 'Transferencia';
    }
    
    // Capitalize first letter of each word as fallback
    return operationType
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Extract bank/receiver name from vendor name
   * The vendor is the receiver, so use their name as bank receptor
   */
  private extractBankName(vendorName: string): string {
    if (!vendorName) return '';
    
    // Clean and capitalize properly
    return vendorName
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Auto-adjust column widths based on content
   */
  private autoAdjustColumnWidths(worksheet: ExcelJS.Worksheet): void {
    worksheet.columns.forEach((column, colIndex) => {
      if (!column.eachCell) return;
      
      let maxLength = 0;
      
      // Check header length
      const header = column.header;
      if (header && typeof header === 'string') {
        maxLength = header.length;
      }
      
      // Check all cell values in this column
      column.eachCell({ includeEmpty: false }, (cell) => {
        const cellValue = cell.value;
        let cellLength = 0;
        
        if (cellValue !== null && cellValue !== undefined) {
          if (typeof cellValue === 'string') {
            cellLength = cellValue.length;
          } else if (typeof cellValue === 'number') {
            cellLength = cellValue.toString().length;
          } else if (cellValue && typeof cellValue === 'object' && 'text' in cellValue) {
            cellLength = String(cellValue.text).length;
          } else {
            cellLength = String(cellValue).length;
          }
        }
        
        if (cellLength > maxLength) {
          maxLength = cellLength;
        }
      });
      
      // Set width with padding, min and max limits
      const minWidth = 12;
      const maxWidth = 50;
      const padding = 3;
      
      column.width = Math.min(Math.max(maxLength + padding, minWidth), maxWidth);
    });
  }
}

