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
    
    // Usar operationType si está disponible, sino extraer del paymentMethod
    const tipoOperacion = invoice.operationType || this.extractOperationType(invoice.paymentMethod);
    
    // Determinar qué identificador usar: CVU > CUIT > Nombre
    let cuit = '';
    if (invoice.vendor.cvu) {
      cuit = invoice.vendor.cvu;
    } else if (invoice.vendor.taxId) {
      cuit = invoice.vendor.taxId;
    } else {
      cuit = invoice.vendor.name;
    }
    
    // Monto bruto es el total
    const montoBruto = invoice.totalAmount;
    
    // Usar receiverBank si está disponible, sino extraer del nombre del vendor
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
   * Formatea fecha de YYYY-MM-DD a DD/MM/YYYY
   * @param dateString Fecha en formato ISO
   * @returns Fecha formateada
   */
  private formatDateForExcel(dateString: string): string {
    if (!dateString) return dateString;
    
    try {
      const parts = dateString.split('-');
      // Verificar que tiene exactamente 3 partes (year-month-day)
      if (parts.length !== 3) {
        return dateString; // Retornar original si no tiene formato válido
      }
      
      const [year, month, day] = parts;
      
      // Validar que las partes sean números
      if (!year || !month || !day || isNaN(Number(year)) || isNaN(Number(month)) || isNaN(Number(day))) {
        return dateString;
      }
      
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

    // Configurar columnas (anchos se ajustarán después)
    worksheet.columns = [
      { header: 'Fecha', key: 'fecha' },
      { header: 'Tipo Operación', key: 'tipoOperacion' },
      { header: 'Cuit', key: 'cuit' },
      { header: 'Monto Bruto', key: 'montoBruto' },
      { header: 'Banco receptor', key: 'bancoReceptor' },
    ];

    // Estilizar la fila de encabezados (fila 1)
    const headerRow = worksheet.getRow(1);
    headerRow.height = 35; // Más altura para los headers
    
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0066CC' }, // Azul como en la imagen
      };
      cell.font = {
        name: 'Segoe UI',
        size: 13,
        bold: true,
        color: { argb: 'FFFFFFFF' }, // Blanco
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        indent: 1, // Padding interno
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
      row.height = 22; // Altura de las filas de datos

      // Aplicar estilos a todas las celdas de datos
      row.eachCell((cell, colNumber) => {
        // Fondo amarillo para todas las celdas de datos
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFFF00' }, // Amarillo
        };

        // Bordes
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } },
        };

        // Todos los datos centrados con padding
        cell.alignment = { 
          vertical: 'middle', 
          horizontal: 'center',
          indent: 1, // Padding interno
        };

        // Formato especial para monto
        if (colNumber === 4) {
          cell.numFmt = '$#,##0.00'; // Formato de moneda con separador de miles
        }

        // Font para datos - Fuente moderna y legible
        cell.font = {
          name: 'Segoe UI',
          size: 11,
        };
      });
    });

    // Auto-ajustar ancho de columnas basado en contenido
    worksheet.columns.forEach((column) => {
      let maxLength = 0;
      if (column.eachCell) {
        column.eachCell({ includeEmpty: false }, (cell) => {
          const cellValue = cell.value ? cell.value.toString() : '';
          maxLength = Math.max(maxLength, cellValue.length);
        });
      }
      // Agregar padding extra para el ancho
      column.width = Math.max(12, maxLength + 4);
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
      { header: 'Fecha', key: 'fecha' },
      { header: 'Tipo Operación', key: 'tipoOperacion' },
      { header: 'Cuit', key: 'cuit' },
      { header: 'Monto Bruto', key: 'montoBruto' },
      { header: 'Banco receptor', key: 'bancoReceptor' },
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.height = 35; // Más altura para los headers
    
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0066CC' },
      };
      cell.font = {
        name: 'Segoe UI',
        size: 13,
        bold: true,
        color: { argb: 'FFFFFFFF' },
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        indent: 1, // Padding interno
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
      row.height = 22; // Altura de las filas de datos

      row.eachCell((cell, colNumber) => {
        // Fondo amarillo para todas las celdas de datos
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFFF00' }, // Amarillo
        };

        // Bordes
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } },
        };

        // Todos los datos centrados con padding
        cell.alignment = { 
          vertical: 'middle', 
          horizontal: 'center',
          indent: 1, // Padding interno
        };

        // Formato especial para monto
        if (colNumber === 4) {
          cell.numFmt = '$#,##0.00';
        }

        cell.font = {
          name: 'Segoe UI',
          size: 11,
        };
      });
    });

    // Auto-ajustar ancho de columnas basado en contenido
    worksheet.columns.forEach((column) => {
      let maxLength = 0;
      if (column.eachCell) {
        column.eachCell({ includeEmpty: false }, (cell) => {
          const cellValue = cell.value ? cell.value.toString() : '';
          maxLength = Math.max(maxLength, cellValue.length);
        });
      }
      // Agregar padding extra para el ancho
      column.width = Math.max(12, maxLength + 4);
    });

    await workbook.xlsx.writeFile(filepath);
    this.logger.success(`Excel guardado en: ${filepath}`);
  }
}

