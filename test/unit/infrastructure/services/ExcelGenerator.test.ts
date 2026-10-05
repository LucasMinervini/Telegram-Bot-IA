/**
 * Test suite para ExcelGenerator.ts
 * Valida generaciÃƒÆ’Ã‚Â³n de archivos Excel con formato profesional
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ExcelJSGenerator } from '@/infrastructure/services/ExcelJSGenerator';
import { Invoice } from '@/domain/entities/Invoice.entity';
import ExcelJS from 'exceljs';
import fs from 'fs-extra';
import path from 'path';

describe('ExcelGenerator', () => {
  let generator: ExcelJSGenerator;

  // Helper para crear factura de prueba
  const createMockInvoice = (overrides?: any): Invoice => {
    const props = {
      invoiceNumber: '001-00001234',
      date: '2025-11-03',
      operationType: 'Transferencia',
      vendor: {
        name: 'Empresa Test SA',
        taxId: '30-12345678-9',
        cvu: '0000003100010123456789',
      },
      totalAmount: 15750.00,
      currency: 'ARS',
      receiverBank: 'Banco Test',
      items: [
        {
          description: 'Servicio de consultorÃƒÆ’Ã‚Â­a',
          quantity: 10,
          unitPrice: 1500.00,
          subtotal: 15000.00,
        },
      ],
      metadata: {
        processedAt: '2025-11-03T10:00:00Z',
        processingTimeMs: 6420,
        confidence: 'high',
        model: 'gpt-4o-mini',
      },
      ...overrides,
    };
    return Invoice.create(props);
  };

  beforeEach(() => {
    generator = new ExcelJSGenerator();
  });

  describe('generateExcel', () => {
    it('deberÃƒÆ’Ã‚Â­a generar un buffer de Excel vÃƒÆ’Ã‚Â¡lido', async () => {
      const invoices = [createMockInvoice()];
      const buffer = await generator.generateExcel(invoices);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('deberÃƒÆ’Ã‚Â­a generar Excel con una sola factura', async () => {
      const invoices = [createMockInvoice()];
      const buffer = await generator.generateExcel(invoices);

      // Leer el buffer y validar contenido
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Comprobantes');
      expect(worksheet).toBeDefined();

      // DeberÃƒÆ’Ã‚Â­a tener 1 fila de headers + 1 fila de datos
      expect(worksheet?.rowCount).toBe(2);
    });

    it('deberÃƒÆ’Ã‚Â­a generar Excel con mÃƒÆ’Ã‚Âºltiples facturas', async () => {
      const invoices = [
        createMockInvoice({ invoiceNumber: '001-001', totalAmount: 1000 }),
        createMockInvoice({ invoiceNumber: '001-002', totalAmount: 2000 }),
        createMockInvoice({ invoiceNumber: '001-003', totalAmount: 3000 }),
      ];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Comprobantes');
      
      // DeberÃƒÆ’Ã‚Â­a tener 1 fila de headers + 3 filas de datos
      expect(worksheet?.rowCount).toBe(4);
    });

    it('deberÃƒÆ’Ã‚Â­a incluir las columnas correctas', async () => {
      const invoices = [createMockInvoice()];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Comprobantes');
      const headerRow = worksheet?.getRow(1);

      expect(headerRow?.getCell(1).value).toBe('Fecha');
      expect(String(headerRow?.getCell(2).value)).toContain('Tipo Operaci');
      expect(headerRow?.getCell(3).value).toBe('Cuit');
      expect(headerRow?.getCell(4).value).toBe('Monto Bruto');
      expect(headerRow?.getCell(5).value).toBe('Banco receptor');
    });

    it('deberÃƒÆ’Ã‚Â­a formatear fecha correctamente (DD/MM/YYYY)', async () => {
      const invoices = [createMockInvoice({ date: '2025-11-03' })];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Comprobantes');
      const dataRow = worksheet?.getRow(2);

      expect(dataRow?.getCell(1).value).toBe('03/11/2025');
    });

    it('deberÃƒÆ’Ã‚Â­a usar CVU cuando estÃƒÆ’Ã‚Â¡ disponible', async () => {
      const invoices = [
        createMockInvoice({
          vendor: {
            name: 'Test',
            taxId: '30-12345678-9',
            cvu: '0000003100010123456789',
          },
        }),
      ];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Comprobantes');
      const dataRow = worksheet?.getRow(2);

      expect(dataRow?.getCell(3).value).toBe('0000003100010123456789');
    });

    it('deberÃƒÆ’Ã‚Â­a usar CUIT cuando no hay CVU', async () => {
      const invoices = [
        createMockInvoice({
          vendor: {
            name: 'Test',
            taxId: '30-12345678-9',
          },
        }),
      ];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Comprobantes');
      const dataRow = worksheet?.getRow(2);

      expect(dataRow?.getCell(3).value).toBe('30-12345678-9');
    });

    it('deberÃƒÆ’Ã‚Â­a usar nombre cuando no hay CVU ni CUIT', async () => {
      const invoices = [
        createMockInvoice({
          vendor: {
            name: 'Empresa Sin IdentificaciÃƒÆ’Ã‚Â³n',
          },
        }),
      ];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Comprobantes');
      const dataRow = worksheet?.getRow(2);

      expect(String(dataRow?.getCell(3).value)).toContain('Empresa Sin Identificaci');
    });

    it('deberÃƒÆ’Ã‚Â­a usar operationType cuando estÃƒÆ’Ã‚Â¡ disponible', async () => {
      const invoices = [createMockInvoice({ operationType: 'DepÃƒÆ’Ã‚Â³sito' })];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Comprobantes');
      const dataRow = worksheet?.getRow(2);

      expect(String(dataRow?.getCell(2).value)).toContain('Dep');
    });

    it('deberÃƒÆ’Ã‚Â­a extraer tipo de operaciÃƒÆ’Ã‚Â³n de paymentMethod', async () => {
      const testCases = [
        { method: 'Transferencia bancaria', expected: 'Transferencia' },
        { method: 'Efectivo', expected: 'Efectivo' },
        { method: 'Cheque al portador', expected: 'Cheque' },
        { method: 'Tarjeta de crÃƒÆ’Ã‚Â©dito', expected: 'Tarjeta' },
        { method: undefined, expected: 'Transferencia' }, // Default
      ];

      for (const { method, expected } of testCases) {
        const invoices = [
          createMockInvoice({
            operationType: undefined,
            paymentMethod: method,
          }),
        ];
        const buffer = await generator.generateExcel(invoices);

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        const worksheet = workbook.getWorksheet('Comprobantes');
        const dataRow = worksheet?.getRow(2);

        expect(dataRow?.getCell(2).value).toBe(expected);
      }
    });

    it('deberÃƒÆ’Ã‚Â­a usar receiverBank cuando estÃƒÆ’Ã‚Â¡ disponible', async () => {
      const invoices = [createMockInvoice({ receiverBank: 'Banco Santander' })];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Comprobantes');
      const dataRow = worksheet?.getRow(2);

      expect(dataRow?.getCell(5).value).toBe('Banco Santander');
    });

    it('deberÃƒÆ’Ã‚Â­a extraer y formatear banco del nombre del vendor', async () => {
      const invoices = [
        createMockInvoice({
          receiverBank: undefined,
          vendor: {
            name: 'banco galicia',
          },
        }),
      ];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Comprobantes');
      const dataRow = worksheet?.getRow(2);

      expect(dataRow?.getCell(5).value).toBe('Banco Galicia');
    });

    it('deberÃƒÆ’Ã‚Â­a aplicar formato de moneda a la columna de monto', async () => {
      const invoices = [createMockInvoice({ totalAmount: 1234.56 })];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Comprobantes');
      const dataRow = worksheet?.getRow(2);
      const montoCell = dataRow?.getCell(4);

      expect(montoCell?.value).toBe(1234.56);
      expect(montoCell?.numFmt).toBe('$#,##0.00');
    });

    it('deberÃƒÆ’Ã‚Â­a aplicar estilos de header correctamente', async () => {
      const invoices = [createMockInvoice()];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Comprobantes');
      const headerRow = worksheet?.getRow(1);
      const headerCell = headerRow?.getCell(1);

      // Verificar estilo del header
      expect(headerCell?.fill).toEqual({
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0066CC' },
      });

      expect(headerCell?.font).toMatchObject({
        name: 'Segoe UI',
        size: 13,
        bold: true,
        color: { argb: 'FFFFFFFF' },
      });
    });

    it('deberÃƒÆ’Ã‚Â­a aplicar fondo amarillo a las celdas de datos', async () => {
      const invoices = [createMockInvoice()];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Comprobantes');
      const dataRow = worksheet?.getRow(2);
      const dataCell = dataRow?.getCell(1);

      expect(dataCell?.fill).toEqual({
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFF00' },
      });
    });

    it('deberÃƒÆ’Ã‚Â­a aplicar bordes a todas las celdas', async () => {
      const invoices = [createMockInvoice()];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Comprobantes');
      const dataRow = worksheet?.getRow(2);
      const dataCell = dataRow?.getCell(1);

      expect(dataCell?.border).toEqual({
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } },
      });
    });

    it('deberÃƒÆ’Ã‚Â­a manejar array vacÃƒÆ’Ã‚Â­o de facturas', async () => {
      const invoices: Invoice[] = [];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Comprobantes');
      
      // Solo deberÃƒÆ’Ã‚Â­a tener la fila de headers
      expect(worksheet?.rowCount).toBe(1);
    });

    it('deberÃƒÆ’Ã‚Â­a manejar montos muy grandes', async () => {
      const invoices = [createMockInvoice({ totalAmount: 9999999.99 })];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Comprobantes');
      const dataRow = worksheet?.getRow(2);

      expect(dataRow?.getCell(4).value).toBe(9999999.99);
    });

    it('deberÃƒÆ’Ã‚Â­a manejar montos decimales precisos', async () => {
      const invoices = [createMockInvoice({ totalAmount: 1234.567 })];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Comprobantes');
      const dataRow = worksheet?.getRow(2);

      expect(dataRow?.getCell(4).value).toBeCloseTo(1234.567, 2);
    });
  });

  describe('generateAndSaveExcel', () => {
    const testFilePath = path.join(process.cwd(), 'test', 'temp-test.xlsx');

    afterEach(async () => {
      // Limpiar archivo de prueba
      if (await fs.pathExists(testFilePath)) {
        await fs.remove(testFilePath);
      }
    });

    it('deberÃƒÆ’Ã‚Â­a crear archivo Excel en el filesystem', async () => {
      const invoices = [createMockInvoice()];

      await generator.generateAndSaveExcel(invoices, testFilePath);

      expect(await fs.pathExists(testFilePath)).toBe(true);
    });

    it('deberÃƒÆ’Ã‚Â­a crear archivo con contenido vÃƒÆ’Ã‚Â¡lido', async () => {
      const invoices = [
        createMockInvoice({ invoiceNumber: '001-001' }),
        createMockInvoice({ invoiceNumber: '001-002' }),
      ];

      await generator.generateAndSaveExcel(invoices, testFilePath);

      // Leer el archivo y verificar contenido
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(testFilePath);

      const worksheet = workbook.getWorksheet('Comprobantes');
      expect(worksheet?.rowCount).toBe(3); // 1 header + 2 datos
    });

    it('deberÃƒÆ’Ã‚Â­a sobrescribir archivo existente', async () => {
      const invoices1 = [createMockInvoice()];
      const invoices2 = [createMockInvoice(), createMockInvoice()];

      // Crear archivo con 1 factura
      await generator.generateAndSaveExcel(invoices1, testFilePath);

      // Sobrescribir con 2 facturas
      await generator.generateAndSaveExcel(invoices2, testFilePath);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(testFilePath);

      const worksheet = workbook.getWorksheet('Comprobantes');
      expect(worksheet?.rowCount).toBe(3); // DeberÃƒÆ’Ã‚Â­a tener 2 facturas, no 1
    });
  });

  describe('Formateo de fechas', () => {
    it('deberÃƒÆ’Ã‚Â­a manejar fechas vÃƒÆ’Ã‚Â¡lidas', async () => {
      const testCases = [
        { input: '2025-01-15', expected: '15/01/2025' },
        { input: '2025-12-31', expected: '31/12/2025' },
        { input: '2025-06-01', expected: '01/06/2025' },
      ];

      for (const { input, expected } of testCases) {
        const invoices = [createMockInvoice({ date: input })];
        const buffer = await generator.generateExcel(invoices);

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        const worksheet = workbook.getWorksheet('Comprobantes');
        const dataRow = worksheet?.getRow(2);

        expect(dataRow?.getCell(1).value).toBe(expected);
      }
    });

    it('deberÃƒÆ’Ã‚Â­a formatear fechas vÃƒÆ’Ã‚Â¡lidas correctamente', async () => {
      const invoices = [createMockInvoice({ date: '2025-03-15' })];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Comprobantes');
      const dataRow = worksheet?.getRow(2);

      // DeberÃƒÆ’Ã‚Â­a formatear correctamente
      expect(dataRow?.getCell(1).value).toBe('15/03/2025');
    });
  });

  describe('Edge Cases', () => {
    it('deberÃƒÆ’Ã‚Â­a manejar vendor sin CVU ni CUIT', async () => {
      const invoices = [
        createMockInvoice({
          vendor: {
            name: 'Empresa Test',
          },
          receiverBank: undefined,
        }),
      ];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Comprobantes');
      const dataRow = worksheet?.getRow(2);

      expect(dataRow?.getCell(3).value).toBe('Empresa Test');
      // Sin receiverBank explÃƒÆ’Ã‚Â­cito pero con nombre del vendor, podrÃƒÆ’Ã‚Â­a extraerse
      expect(dataRow?.getCell(5).value).toBeDefined();
    });

    it('deberÃƒÆ’Ã‚Â­a manejar monto pequeÃƒÆ’Ã‚Â±o', async () => {
      const invoices = [createMockInvoice({ totalAmount: 0.01 })];

      // Monto vÃƒÆ’Ã‚Â¡lido pero pequeÃƒÆ’Ã‚Â±o
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Comprobantes');
      const dataRow = worksheet?.getRow(2);

      expect(dataRow?.getCell(4).value).toBe(0.01);
    });

    it('deberÃƒÆ’Ã‚Â­a manejar caracteres especiales en nombres', async () => {
      const invoices = [
        createMockInvoice({
          vendor: {
            name: 'Empresa & Asociados <Test>',
          },
        }),
      ];
      const buffer = await generator.generateExcel(invoices);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe('Cobranzas (pagador)', () => {
    const readFirstRow = async (invoice: Invoice) => {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await generator.generateExcel([invoice]));
      const row = workbook.getWorksheet('Comprobantes')!.getRow(2);
      return { cuit: row.getCell(3).value, banco: row.getCell(5).value };
    };

    it('usa el CUIT y el banco de quien pago', async () => {
      const row = await readFirstRow(
        createMockInvoice({ payer: { name: 'CHOJOA SAS', taxId: '30716397447', bank: 'BBVA' } })
      );

      expect(row.cuit).toBe('30-71639744-7');
      expect(row.banco).toBe('BBVA');
    });

    it('usa el nombre del pagador cuando no figura su CUIT', async () => {
      const row = await readFirstRow(
        createMockInvoice({ payer: { name: 'DIEGO SEBASTIAN STECKLEIN', taxId: 'No figura', bank: 'Banco Provincia' } })
      );

      expect(row.cuit).toBe('Diego Sebastian Stecklein');
      expect(row.banco).toBe('Banco Provincia');
    });

    it('mantiene el comportamiento anterior sin pagador', async () => {
      const row = await readFirstRow(createMockInvoice());

      expect(row.cuit).toBe('0000003100010123456789');
      expect(row.banco).toBe('Banco Test');
    });
  });
});

