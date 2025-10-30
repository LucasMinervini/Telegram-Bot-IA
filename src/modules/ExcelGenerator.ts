/**
 * ExcelGenerator.ts
 * Módulo para generar archivos Excel con formato profesional
 * basado en las especificaciones del cliente
 */

import ExcelJS from 'exceljs';
import { Invoice } from './Interfaces';
import { Logger } from './DataStructures';

/**
 * Estructura de datos para cada fila del Excel
 */
export interface ExcelInvoiceRow {
  fecha: string;
  tipoOperacion: string;
  cuit: string;
  montoBruto: number;
  bancoReceptor: string;
}

/**
 * Clase ExcelGenerator
 * Genera archivos Excel con formato y estilos específicos del cliente
 */
export class ExcelGenerator {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('ExcelGenerator');
  }

  /**
   * Convierte una factura a formato de fila Excel
   * @param invoice Factura procesada
   * @returns Objeto con los datos formateados para Excel
   */
  private invoiceToRow(invoice: Invoice): ExcelInvoiceRow {
    // Formatear fecha de YYYY-MM-DD a DD/MM/YYYY
    const dateFormatted = this.formatDateForExcel(invoice.date);
    
    // Determinar tipo de operación desde paymentMethod o usar default
    const tipoOperacion = this.extractOperationType(invoice.paymentMethod);
    
    // Extraer CUIT del vendor
    const cuit = invoice.vendor.taxId || '';
    
    // Monto bruto es el total
    const montoBruto = invoice.totalAmount;
    
    // Extraer banco receptor del nombre del vendor o campo adicional
    const bancoReceptor = this.extractBankName(invoice.vendor.name);

    return {
      fecha: dateFormatted,
      tipoOperacion,
      cuit,
      montoBruto,
      bancoReceptor,
    };
  }

  /**
   * Formatea fecha de YYYY-MM-DD a DD/MM/YYYY
   * @param dateString Fecha en formato ISO
   * @returns Fecha formateada
   */
  private formatDateForExcel(dateString: string): string {
    try {
      const [year, month, day] = dateString.split('-');
      return `${day}/${month}/${year}`;
    } catch {
      return dateString;
    }
  }

  /**
   * Extrae el tipo de operación del método de pago
   * @param paymentMethod Método de pago
   * @returns Tipo de operación
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
   * Extrae el nombre del banco del nombre del vendor
   * @param vendorName Nombre del proveedor/banco
   * @returns Nombre del banco formateado
   */
  private extractBankName(vendorName: string): string {
    // Si el nombre contiene "Bouche" o términos bancarios comunes, formatearlo
    if (!vendorName) return '';
    
    // Capitalizar primera letra de cada palabra
    return vendorName
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Genera un archivo Excel con las facturas proporcionadas
   * @param invoices Array de facturas a incluir
   * @param filename Nombre del archivo (opcional)
   * @returns Buffer con el archivo Excel
   */
  async generateExcel(invoices: Invoice[], filename?: string): Promise<Buffer> {
    this.logger.info(`Generando Excel con ${invoices.length} factura(s)`);

    // Crear workbook y worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Facturas', {
      properties: { tabColor: { argb: 'FF0066CC' } },
    });

    // Configurar columnas con anchos específicos
    worksheet.columns = [
      { header: 'Fecha', key: 'fecha', width: 12 },
      { header: 'Tipo Operación', key: 'tipoOperacion', width: 18 },
      { header: 'Cuit', key: 'cuit', width: 20 },
      { header: 'Monto Bruto', key: 'montoBruto', width: 18 },
      { header: 'Banco receptor', key: 'bancoReceptor', width: 20 },
    ];

    // Estilizar la fila de encabezados (fila 1)
    const headerRow = worksheet.getRow(1);
    headerRow.height = 20;
    
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0066CC' }, // Azul como en la imagen
      };
      cell.font = {
        name: 'Calibri',
        size: 11,
        bold: true,
        color: { argb: 'FFFFFFFF' }, // Blanco
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

    // Agregar datos de las facturas
    invoices.forEach((invoice) => {
      const rowData = this.invoiceToRow(invoice);
      const row = worksheet.addRow(rowData);

      // Aplicar bordes a todas las celdas de datos
      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } },
        };

        // Alineación según columna
        if (colNumber === 1 || colNumber === 2 || colNumber === 5) {
          // Fecha, Tipo Operación, Banco receptor: alineado a la izquierda
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        } else if (colNumber === 3) {
          // CUIT: alineado a la izquierda
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        } else if (colNumber === 4) {
          // Monto: alineado a la derecha con formato de moneda
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          cell.numFmt = '$#,##0.00'; // Formato de moneda con separador de miles
        }

        // Font para datos
        cell.font = {
          name: 'Calibri',
          size: 11,
        };
      });
    });

    // Generar buffer
    const buffer = await workbook.xlsx.writeBuffer();
    this.logger.success('Excel generado exitosamente');
    
    return Buffer.from(buffer);
  }

  /**
   * Genera un Excel y lo guarda en el sistema de archivos
   * @param invoices Array de facturas
   * @param filepath Ruta donde guardar el archivo
   */
  async generateAndSaveExcel(invoices: Invoice[], filepath: string): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Facturas');

    // Mismo proceso que generateExcel pero guardando en archivo
    worksheet.columns = [
      { header: 'Fecha', key: 'fecha', width: 12 },
      { header: 'Tipo Operación', key: 'tipoOperacion', width: 18 },
      { header: 'Cuit', key: 'cuit', width: 20 },
      { header: 'Monto Bruto', key: 'montoBruto', width: 18 },
      { header: 'Banco receptor', key: 'bancoReceptor', width: 20 },
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.height = 20;
    
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0066CC' },
      };
      cell.font = {
        name: 'Calibri',
        size: 11,
        bold: true,
        color: { argb: 'FFFFFFFF' },
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

    invoices.forEach((invoice) => {
      const rowData = this.invoiceToRow(invoice);
      const row = worksheet.addRow(rowData);

      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } },
        };

        if (colNumber === 1 || colNumber === 2 || colNumber === 5) {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        } else if (colNumber === 3) {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        } else if (colNumber === 4) {
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          cell.numFmt = '$#,##0.00';
        }

        cell.font = {
          name: 'Calibri',
          size: 11,
        };
      });
    });

    await workbook.xlsx.writeFile(filepath);
    this.logger.success(`Excel guardado en: ${filepath}`);
  }
}

