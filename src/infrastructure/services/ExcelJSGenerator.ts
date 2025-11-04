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

    // Configure columns
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

    // Auto-adjust column widths
    worksheet.columns.forEach((column) => {
      let maxLength = 0;
      if (column.eachCell) {
        column.eachCell({ includeEmpty: false }, (cell) => {
          const cellValue = cell.value ? cell.value.toString() : '';
          maxLength = Math.max(maxLength, cellValue.length);
        });
      }
      column.width = Math.max(12, maxLength + 4);
    });

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
    
    const tipoOperacion = invoice.operationType || this.extractOperationType(invoice.paymentMethod);
    
    // Determine which identifier to use: CVU > taxId > name
    let cuit = '';
    if (invoice.vendor.cvu) {
      cuit = invoice.vendor.cvu;
    } else if (invoice.vendor.taxId) {
      cuit = invoice.vendor.taxId;
    } else {
      cuit = invoice.vendor.name;
    }
    
    const montoBruto = invoice.totalAmount;
    const bancoReceptor = invoice.receiverBank || this.extractBankName(invoice.vendor.name);

    return {
      fecha: dateFormatted,
      tipoOperacion,
      cuit,
      montoBruto,
      bancoReceptor,
    };
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
   * Extract bank name from vendor name
   */
  private extractBankName(vendorName: string): string {
    if (!vendorName) return '';
    
    // Capitalize first letter of each word
    return vendorName
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
}

