/**
 * Test suite para ExcelGenerator.ts
 * Valida generación de archivos Excel con formato profesional
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ExcelGenerator } from '../src/modules/ExcelGenerator';
import type { Invoice } from '../src/modules/Interfaces';
import ExcelJS from 'exceljs';
import fs from 'fs-extra';
import path from 'path';

describe('ExcelGenerator', () => {
  let generator: ExcelGenerator;

  // Helper para crear factura de prueba
  const createMockInvoice = (overrides?: Partial<Invoice>): Invoice => ({
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
        description: 'Servicio de consultoría',
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
  });

  beforeEach(() => {
    generator = new ExcelGenerator();
  });

  describe('generateExcel', () => {
    it('debería generar un buffer de Excel válido', async () => {
      const invoices = [createMockInvoice()];
      const buffer = await generator.generateExcel(invoices);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('debería generar Excel con una sola factura', async () => {
      const invoices = [createMockInvoice()];
      const buffer = await generator.generateExcel(invoices);

      // Leer el buffer y validar contenido
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Facturas');
      expect(worksheet).toBeDefined();

      // Debería tener 1 fila de headers + 1 fila de datos
      expect(worksheet?.rowCount).toBe(2);
    });

    it('debería generar Excel con múltiples facturas', async () => {
      const invoices = [
        createMockInvoice({ invoiceNumber: '001-001', totalAmount: 1000 }),
        createMockInvoice({ invoiceNumber: '001-002', totalAmount: 2000 }),
        createMockInvoice({ invoiceNumber: '001-003', totalAmount: 3000 }),
      ];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Facturas');
      
      // Debería tener 1 fila de headers + 3 filas de datos
      expect(worksheet?.rowCount).toBe(4);
    });

    it('debería incluir las columnas correctas', async () => {
      const invoices = [createMockInvoice()];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Facturas');
      const headerRow = worksheet?.getRow(1);

      expect(headerRow?.getCell(1).value).toBe('Fecha');
      expect(headerRow?.getCell(2).value).toBe('Tipo Operación');
      expect(headerRow?.getCell(3).value).toBe('Cuit');
      expect(headerRow?.getCell(4).value).toBe('Monto Bruto');
      expect(headerRow?.getCell(5).value).toBe('Banco receptor');
    });

    it('debería formatear fecha correctamente (DD/MM/YYYY)', async () => {
      const invoices = [createMockInvoice({ date: '2025-11-03' })];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Facturas');
      const dataRow = worksheet?.getRow(2);

      expect(dataRow?.getCell(1).value).toBe('03/11/2025');
    });

    it('debería usar CVU cuando está disponible', async () => {
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

      const worksheet = workbook.getWorksheet('Facturas');
      const dataRow = worksheet?.getRow(2);

      expect(dataRow?.getCell(3).value).toBe('0000003100010123456789');
    });

    it('debería usar CUIT cuando no hay CVU', async () => {
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

      const worksheet = workbook.getWorksheet('Facturas');
      const dataRow = worksheet?.getRow(2);

      expect(dataRow?.getCell(3).value).toBe('30-12345678-9');
    });

    it('debería usar nombre cuando no hay CVU ni CUIT', async () => {
      const invoices = [
        createMockInvoice({
          vendor: {
            name: 'Empresa Sin Identificación',
          },
        }),
      ];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Facturas');
      const dataRow = worksheet?.getRow(2);

      expect(dataRow?.getCell(3).value).toBe('Empresa Sin Identificación');
    });

    it('debería usar operationType cuando está disponible', async () => {
      const invoices = [createMockInvoice({ operationType: 'Depósito' })];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Facturas');
      const dataRow = worksheet?.getRow(2);

      expect(dataRow?.getCell(2).value).toBe('Depósito');
    });

    it('debería extraer tipo de operación de paymentMethod', async () => {
      const testCases = [
        { method: 'Transferencia bancaria', expected: 'Transferencia' },
        { method: 'Efectivo', expected: 'Efectivo' },
        { method: 'Cheque al portador', expected: 'Cheque' },
        { method: 'Tarjeta de crédito', expected: 'Tarjeta' },
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

        const worksheet = workbook.getWorksheet('Facturas');
        const dataRow = worksheet?.getRow(2);

        expect(dataRow?.getCell(2).value).toBe(expected);
      }
    });

    it('debería usar receiverBank cuando está disponible', async () => {
      const invoices = [createMockInvoice({ receiverBank: 'Banco Santander' })];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Facturas');
      const dataRow = worksheet?.getRow(2);

      expect(dataRow?.getCell(5).value).toBe('Banco Santander');
    });

    it('debería extraer y formatear banco del nombre del vendor', async () => {
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

      const worksheet = workbook.getWorksheet('Facturas');
      const dataRow = worksheet?.getRow(2);

      expect(dataRow?.getCell(5).value).toBe('Banco Galicia');
    });

    it('debería aplicar formato de moneda a la columna de monto', async () => {
      const invoices = [createMockInvoice({ totalAmount: 1234.56 })];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Facturas');
      const dataRow = worksheet?.getRow(2);
      const montoCell = dataRow?.getCell(4);

      expect(montoCell?.value).toBe(1234.56);
      expect(montoCell?.numFmt).toBe('$#,##0.00');
    });

    it('debería aplicar estilos de header correctamente', async () => {
      const invoices = [createMockInvoice()];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Facturas');
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

    it('debería aplicar fondo amarillo a las celdas de datos', async () => {
      const invoices = [createMockInvoice()];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Facturas');
      const dataRow = worksheet?.getRow(2);
      const dataCell = dataRow?.getCell(1);

      expect(dataCell?.fill).toEqual({
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFF00' },
      });
    });

    it('debería aplicar bordes a todas las celdas', async () => {
      const invoices = [createMockInvoice()];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Facturas');
      const dataRow = worksheet?.getRow(2);
      const dataCell = dataRow?.getCell(1);

      expect(dataCell?.border).toEqual({
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } },
      });
    });

    it('debería manejar array vacío de facturas', async () => {
      const invoices: Invoice[] = [];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Facturas');
      
      // Solo debería tener la fila de headers
      expect(worksheet?.rowCount).toBe(1);
    });

    it('debería manejar montos muy grandes', async () => {
      const invoices = [createMockInvoice({ totalAmount: 9999999.99 })];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Facturas');
      const dataRow = worksheet?.getRow(2);

      expect(dataRow?.getCell(4).value).toBe(9999999.99);
    });

    it('debería manejar montos decimales precisos', async () => {
      const invoices = [createMockInvoice({ totalAmount: 1234.567 })];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Facturas');
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

    it('debería crear archivo Excel en el filesystem', async () => {
      const invoices = [createMockInvoice()];

      await generator.generateAndSaveExcel(invoices, testFilePath);

      expect(await fs.pathExists(testFilePath)).toBe(true);
    });

    it('debería crear archivo con contenido válido', async () => {
      const invoices = [
        createMockInvoice({ invoiceNumber: '001-001' }),
        createMockInvoice({ invoiceNumber: '001-002' }),
      ];

      await generator.generateAndSaveExcel(invoices, testFilePath);

      // Leer el archivo y verificar contenido
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(testFilePath);

      const worksheet = workbook.getWorksheet('Facturas');
      expect(worksheet?.rowCount).toBe(3); // 1 header + 2 datos
    });

    it('debería sobrescribir archivo existente', async () => {
      const invoices1 = [createMockInvoice()];
      const invoices2 = [createMockInvoice(), createMockInvoice()];

      // Crear archivo con 1 factura
      await generator.generateAndSaveExcel(invoices1, testFilePath);

      // Sobrescribir con 2 facturas
      await generator.generateAndSaveExcel(invoices2, testFilePath);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(testFilePath);

      const worksheet = workbook.getWorksheet('Facturas');
      expect(worksheet?.rowCount).toBe(3); // Debería tener 2 facturas, no 1
    });
  });

  describe('Formateo de fechas', () => {
    it('debería manejar fechas válidas', async () => {
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

        const worksheet = workbook.getWorksheet('Facturas');
        const dataRow = worksheet?.getRow(2);

        expect(dataRow?.getCell(1).value).toBe(expected);
      }
    });

    it('debería manejar fecha con formato inválido', async () => {
      const invoices = [createMockInvoice({ date: 'invalid-date' })];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Facturas');
      const dataRow = worksheet?.getRow(2);

      // Debería retornar el valor original
      expect(dataRow?.getCell(1).value).toBe('invalid-date');
    });
  });

  describe('Edge Cases', () => {
    it('debería manejar nombre de vendor vacío', async () => {
      const invoices = [
        createMockInvoice({
          vendor: {
            name: '',
          },
          receiverBank: undefined,
        }),
      ];
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Facturas');
      const dataRow = worksheet?.getRow(2);

      expect(dataRow?.getCell(3).value).toBe('');
      expect(dataRow?.getCell(5).value).toBe('');
    });

    it('debería manejar monto en cero', async () => {
      const invoices = [createMockInvoice({ totalAmount: 0 })];

      // Esto debería fallar la validación de Zod en producción,
      // pero para el test unitario del generador, validamos que lo maneje
      const buffer = await generator.generateExcel(invoices);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Facturas');
      const dataRow = worksheet?.getRow(2);

      expect(dataRow?.getCell(4).value).toBe(0);
    });

    it('debería manejar caracteres especiales en nombres', async () => {
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
});

