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

    // Configure columns with fixed widths for better UX
    worksheet.columns = [
      { header: 'Fecha', key: 'fecha', width: 15 },
      { header: 'Tipo Operación', key: 'tipoOperacion', width: 25 },
      { header: 'Cuit', key: 'cuit', width: 25 },
      { header: 'Monto Bruto', key: 'montoBruto', width: 18 },
      { header: 'Banco receptor', key: 'bancoReceptor', width: 30 },
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
        indent: 1,
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

        // Center alignment
        cell.alignment = { 
          vertical: 'middle', 
          horizontal: 'center',
          indent: 1,
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

    // Column widths are already set in column configuration
    // No need for auto-adjustment as we have optimized fixed widths

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
    // Priority: taxId (CUIT) > name as fallback
    let cuit = '';
    if (invoice.vendor.taxId) {
      cuit = this.formatCUIT(invoice.vendor.taxId);
    } else {
      cuit = invoice.vendor.name;
    }
    
    // Replace undefined/empty values with friendly message
    cuit = this.sanitizeValue(cuit);
    
    const montoBruto = invoice.totalAmount;
    
    // Banco receptor: use LLM extraction, fallback to vendor name (who is the receiver)
    let bancoReceptor = invoice.receiverBank || '';
    
    // If no explicit bank found, use vendor name (they are the money receiver)
    if (!bancoReceptor || bancoReceptor.trim() === '') {
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
    
    // If not 11 digits, return as-is (might be a different format or invalid)
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
}

