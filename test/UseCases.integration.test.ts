/**
 * Integration Tests para Use Cases
 * Tests de INTEGRACIÓN que verifican la orquestación entre servicios
 * Usan mocks para aislar la lógica de negocio
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProcessInvoiceUseCase } from '../src/application/use-cases/ProcessInvoiceUseCase';
import { ManageSessionUseCase } from '../src/application/use-cases/ManageSessionUseCase';
import { GenerateExcelUseCase } from '../src/application/use-cases/GenerateExcelUseCase';
import { Invoice } from '../src/domain/entities/Invoice.entity';
import type { IDocumentIngestor } from '../src/domain/interfaces/IDocumentIngestor';
import type { IVisionProcessor } from '../src/domain/interfaces/IVisionProcessor';
import type { IInvoiceRepository } from '../src/domain/interfaces/IInvoiceRepository';
import type { IExcelGenerator } from '../src/domain/interfaces/IExcelGenerator';
import type { ILogger } from '../src/domain/interfaces/ILogger';

describe('Use Cases - Integration Tests', () => {
  // Mock factories
  const createMockLogger = (): ILogger => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
  });

  const createMockInvoice = (invoiceNumber: string): Invoice => {
    return Invoice.create({
      invoiceNumber,
      date: '2025-11-03',
      vendor: { name: 'Test Vendor' },
      totalAmount: 1000,
      currency: 'ARS',
      items: [{ description: 'Test', quantity: 1, unitPrice: 1000, subtotal: 1000 }],
      metadata: {
        processedAt: '2025-11-03T10:00:00Z',
        processingTimeMs: 1000,
        confidence: 'high',
      },
    });
  };

  describe('ProcessInvoiceUseCase (Integration)', () => {
    let mockDocumentIngestor: IDocumentIngestor;
    let mockVisionProcessor: IVisionProcessor;
    let mockInvoiceRepository: IInvoiceRepository;
    let mockLogger: ILogger;
    let useCase: ProcessInvoiceUseCase;

    beforeEach(() => {
      mockDocumentIngestor = {
        downloadAndStore: vi.fn(),
        deleteFile: vi.fn(),
        getStorageStats: vi.fn(),
        cleanupExpiredFiles: vi.fn(),
      };

      mockVisionProcessor = {
        processInvoiceImage: vi.fn(),
        getModelName: vi.fn(() => 'test-model'),
      };

      mockInvoiceRepository = {
        addInvoice: vi.fn(),
        getInvoices: vi.fn(() => []),
        getInvoiceCount: vi.fn(() => 0),
        clearInvoices: vi.fn(),
        deleteSession: vi.fn(),
        getSession: vi.fn(),
        hasSession: vi.fn(() => false),
        getActiveSessionCount: vi.fn(() => 0),
        cleanExpiredSessions: vi.fn(() => 0),
      };

      mockLogger = createMockLogger();

      useCase = new ProcessInvoiceUseCase(
        mockDocumentIngestor,
        mockVisionProcessor,
        mockInvoiceRepository,
        mockLogger,
        0 // retentionHours = 0 para borrar inmediatamente
      );
    });

    it('debería procesar factura exitosamente (happy path)', async () => {
      // Arrange
      const request = {
        fileUrl: 'https://example.com/invoice.jpg',
        userId: 123,
        messageId: 456,
      };

      const mockInvoice = createMockInvoice('001-001');

      (mockDocumentIngestor.downloadAndStore as any).mockResolvedValue({
        success: true,
        filePath: '/tmp/test.jpg',
        fileName: 'test.jpg',
      });

      (mockVisionProcessor.processInvoiceImage as any).mockResolvedValue({
        success: true,
        invoice: mockInvoice,
        userId: 123,
        messageId: 456,
      });

      (mockInvoiceRepository.getInvoiceCount as any).mockReturnValue(1);

      // Act
      const response = await useCase.execute(request);

      // Assert
      expect(response.success).toBe(true);
      expect(response.invoice).toBeDefined();
      expect(response.totalInvoices).toBe(1);
      expect(mockDocumentIngestor.downloadAndStore).toHaveBeenCalledWith(
        request.fileUrl,
        request.userId,
        request.messageId
      );
      expect(mockVisionProcessor.processInvoiceImage).toHaveBeenCalled();
      expect(mockInvoiceRepository.addInvoice).toHaveBeenCalledWith(123, mockInvoice);
      expect(mockDocumentIngestor.deleteFile).toHaveBeenCalledWith('/tmp/test.jpg');
      expect(mockLogger.success).toHaveBeenCalled();
    });

    it('debería manejar error en descarga de archivo', async () => {
      // Arrange
      (mockDocumentIngestor.downloadAndStore as any).mockResolvedValue({
        success: false,
        error: 'Download failed',
      });

      (mockInvoiceRepository.getInvoiceCount as any).mockReturnValue(0);

      // Act
      const response = await useCase.execute({
        fileUrl: 'https://example.com/invoice.jpg',
        userId: 123,
        messageId: 456,
      });

      // Assert
      expect(response.success).toBe(false);
      expect(response.error).toBe('Download failed');
      expect(response.totalInvoices).toBe(0);
      expect(mockVisionProcessor.processInvoiceImage).not.toHaveBeenCalled();
      expect(mockInvoiceRepository.addInvoice).not.toHaveBeenCalled();
    });

    it('debería manejar error en procesamiento de visión', async () => {
      // Arrange
      (mockDocumentIngestor.downloadAndStore as any).mockResolvedValue({
        success: true,
        filePath: '/tmp/test.jpg',
      });

      (mockVisionProcessor.processInvoiceImage as any).mockResolvedValue({
        success: false,
        error: 'Vision processing failed',
      });

      (mockInvoiceRepository.getInvoiceCount as any).mockReturnValue(0);

      // Act
      const response = await useCase.execute({
        fileUrl: 'https://example.com/invoice.jpg',
        userId: 123,
        messageId: 456,
      });

      // Assert
      expect(response.success).toBe(false);
      expect(response.error).toBe('Vision processing failed');
      expect(mockInvoiceRepository.addInvoice).not.toHaveBeenCalled();
      expect(mockDocumentIngestor.deleteFile).toHaveBeenCalled(); // Debe limpiar archivo temporal
    });

    it('debería NO borrar archivo temporal si retentionHours > 0', async () => {
      // Arrange
      const useCaseWithRetention = new ProcessInvoiceUseCase(
        mockDocumentIngestor,
        mockVisionProcessor,
        mockInvoiceRepository,
        mockLogger,
        24 // 24 horas de retención
      );

      const mockInvoice = createMockInvoice('001-001');

      (mockDocumentIngestor.downloadAndStore as any).mockResolvedValue({
        success: true,
        filePath: '/tmp/test.jpg',
      });

      (mockVisionProcessor.processInvoiceImage as any).mockResolvedValue({
        success: true,
        invoice: mockInvoice,
      });

      // Act
      await useCaseWithRetention.execute({
        fileUrl: 'https://example.com/invoice.jpg',
        userId: 123,
        messageId: 456,
      });

      // Assert
      expect(mockDocumentIngestor.deleteFile).not.toHaveBeenCalled();
    });

    it('debería pasar detail level al vision processor', async () => {
      // Arrange
      const mockInvoice = createMockInvoice('001-001');

      (mockDocumentIngestor.downloadAndStore as any).mockResolvedValue({
        success: true,
        filePath: '/tmp/test.jpg',
      });

      (mockVisionProcessor.processInvoiceImage as any).mockResolvedValue({
        success: true,
        invoice: mockInvoice,
      });

      // Act
      await useCase.execute({
        fileUrl: 'https://example.com/invoice.jpg',
        userId: 123,
        messageId: 456,
        detail: 'low',
      });

      // Assert
      expect(mockVisionProcessor.processInvoiceImage).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: 'low',
        })
      );
    });

    it('debería manejar excepciones no controladas', async () => {
      // Arrange
      (mockDocumentIngestor.downloadAndStore as any).mockRejectedValue(
        new Error('Unexpected error')
      );

      (mockInvoiceRepository.getInvoiceCount as any).mockReturnValue(0);

      // Act
      const response = await useCase.execute({
        fileUrl: 'https://example.com/invoice.jpg',
        userId: 123,
        messageId: 456,
      });

      // Assert
      expect(response.success).toBe(false);
      expect(response.error).toBe('Unexpected error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('ManageSessionUseCase (Integration)', () => {
    let mockInvoiceRepository: IInvoiceRepository;
    let mockLogger: ILogger;
    let useCase: ManageSessionUseCase;

    beforeEach(() => {
      mockInvoiceRepository = {
        addInvoice: vi.fn(),
        getInvoices: vi.fn(() => []),
        getInvoiceCount: vi.fn(() => 0),
        clearInvoices: vi.fn(),
        deleteSession: vi.fn(),
        getSession: vi.fn(),
        hasSession: vi.fn(() => false),
        getActiveSessionCount: vi.fn(() => 0),
        cleanExpiredSessions: vi.fn(() => 0),
      };

      mockLogger = createMockLogger();

      useCase = new ManageSessionUseCase(mockInvoiceRepository, mockLogger);
    });

    it('debería retornar info vacía para usuario sin sesión', () => {
      // Arrange
      (mockInvoiceRepository.hasSession as any).mockReturnValue(false);

      // Act
      const response = useCase.getSessionInfo({ userId: 123 });

      // Assert
      expect(response.hasSession).toBe(false);
      expect(response.invoiceCount).toBe(0);
      expect(response.totalAmount).toBe(0);
      expect(response.currencies).toEqual([]);
      expect(response.vendorSummary.size).toBe(0);
    });

    it('debería calcular correctamente info de sesión con facturas', () => {
      // Arrange
      const invoices = [
        createMockInvoice('001-001'),
        Invoice.create({
          invoiceNumber: '001-002',
          date: '2025-11-03',
          vendor: { name: 'Vendor 2' },
          totalAmount: 2000,
          currency: 'USD',
          items: [{ description: 'Test', quantity: 1, unitPrice: 2000, subtotal: 2000 }],
          metadata: {
            processedAt: '2025-11-03T10:00:00Z',
            processingTimeMs: 1000,
            confidence: 'high',
          },
        }),
        Invoice.create({
          invoiceNumber: '001-003',
          date: '2025-11-03',
          vendor: { name: 'Test Vendor' }, // Mismo vendor que la primera
          totalAmount: 1500,
          currency: 'ARS',
          items: [{ description: 'Test', quantity: 1, unitPrice: 1500, subtotal: 1500 }],
          metadata: {
            processedAt: '2025-11-03T10:00:00Z',
            processingTimeMs: 1000,
            confidence: 'high',
          },
        }),
      ];

      (mockInvoiceRepository.hasSession as any).mockReturnValue(true);
      (mockInvoiceRepository.getInvoices as any).mockReturnValue(invoices);

      // Act
      const response = useCase.getSessionInfo({ userId: 123 });

      // Assert
      expect(response.hasSession).toBe(true);
      expect(response.invoiceCount).toBe(3);
      expect(response.totalAmount).toBe(4500); // 1000 + 2000 + 1500
      expect(response.currencies).toEqual(['ARS', 'USD']); // Unique currencies
      expect(response.vendorSummary.get('Test Vendor')).toBe(2500); // 1000 + 1500
      expect(response.vendorSummary.get('Vendor 2')).toBe(2000);
    });

    it('debería limpiar sesión exitosamente', () => {
      // Arrange
      (mockInvoiceRepository.getInvoiceCount as any).mockReturnValue(5);

      // Act
      const response = useCase.clearSession({ userId: 123 });

      // Assert
      expect(response.success).toBe(true);
      expect(response.clearedCount).toBe(5);
      expect(mockInvoiceRepository.clearInvoices).toHaveBeenCalledWith(123);
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('debería manejar limpieza de sesión vacía', () => {
      // Arrange
      (mockInvoiceRepository.getInvoiceCount as any).mockReturnValue(0);

      // Act
      const response = useCase.clearSession({ userId: 123 });

      // Assert
      expect(response.success).toBe(true);
      expect(response.clearedCount).toBe(0);
      expect(mockInvoiceRepository.clearInvoices).not.toHaveBeenCalled();
    });

    it('debería obtener conteo de facturas', () => {
      // Arrange
      (mockInvoiceRepository.getInvoiceCount as any).mockReturnValue(10);

      // Act
      const count = useCase.getInvoiceCount(123);

      // Assert
      expect(count).toBe(10);
      expect(mockInvoiceRepository.getInvoiceCount).toHaveBeenCalledWith(123);
    });
  });

  describe('GenerateExcelUseCase (Integration)', () => {
    let mockInvoiceRepository: IInvoiceRepository;
    let mockExcelGenerator: IExcelGenerator;
    let mockLogger: ILogger;
    let useCase: GenerateExcelUseCase;

    beforeEach(() => {
      mockInvoiceRepository = {
        addInvoice: vi.fn(),
        getInvoices: vi.fn(() => []),
        getInvoiceCount: vi.fn(() => 0),
        clearInvoices: vi.fn(),
        deleteSession: vi.fn(),
        getSession: vi.fn(),
        hasSession: vi.fn(() => false),
        getActiveSessionCount: vi.fn(() => 0),
        cleanExpiredSessions: vi.fn(() => 0),
      };

      mockExcelGenerator = {
        generateExcel: vi.fn(),
        generateAndSaveExcel: vi.fn(),
      };

      mockLogger = createMockLogger();

      useCase = new GenerateExcelUseCase(
        mockInvoiceRepository,
        mockExcelGenerator,
        mockLogger
      );
    });

    it('debería generar Excel exitosamente (happy path)', async () => {
      // Arrange
      const invoices = [
        createMockInvoice('001-001'),
        createMockInvoice('001-002'),
      ];

      const mockBuffer = Buffer.from('excel content');

      (mockInvoiceRepository.getInvoices as any).mockReturnValue(invoices);
      (mockExcelGenerator.generateExcel as any).mockResolvedValue(mockBuffer);

      // Act
      const response = await useCase.execute({ userId: 123 });

      // Assert
      expect(response.success).toBe(true);
      expect(response.excelBuffer).toBe(mockBuffer);
      expect(response.invoiceCount).toBe(2);
      expect(mockInvoiceRepository.getInvoices).toHaveBeenCalledWith(123);
      expect(mockExcelGenerator.generateExcel).toHaveBeenCalledWith(invoices);
      expect(mockLogger.success).toHaveBeenCalled();
    });

    it('debería retornar error si no hay facturas', async () => {
      // Arrange
      (mockInvoiceRepository.getInvoices as any).mockReturnValue([]);

      // Act
      const response = await useCase.execute({ userId: 123 });

      // Assert
      expect(response.success).toBe(false);
      expect(response.invoiceCount).toBe(0);
      expect(response.error).toBe('No invoices to generate Excel');
      expect(mockExcelGenerator.generateExcel).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('debería manejar error en generación de Excel', async () => {
      // Arrange
      const invoices = [createMockInvoice('001-001')];

      (mockInvoiceRepository.getInvoices as any).mockReturnValue(invoices);
      (mockExcelGenerator.generateExcel as any).mockRejectedValue(
        new Error('Excel generation failed')
      );

      // Act
      const response = await useCase.execute({ userId: 123 });

      // Assert
      expect(response.success).toBe(false);
      expect(response.error).toBe('Excel generation failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('debería generar Excel con una sola factura', async () => {
      // Arrange
      const invoices = [createMockInvoice('001-001')];
      const mockBuffer = Buffer.from('excel content');

      (mockInvoiceRepository.getInvoices as any).mockReturnValue(invoices);
      (mockExcelGenerator.generateExcel as any).mockResolvedValue(mockBuffer);

      // Act
      const response = await useCase.execute({ userId: 123 });

      // Assert
      expect(response.success).toBe(true);
      expect(response.invoiceCount).toBe(1);
    });

    it('debería generar Excel con muchas facturas', async () => {
      // Arrange
      const invoices = Array.from({ length: 100 }, (_, i) =>
        createMockInvoice(`001-${String(i).padStart(3, '0')}`)
      );
      const mockBuffer = Buffer.from('excel content');

      (mockInvoiceRepository.getInvoices as any).mockReturnValue(invoices);
      (mockExcelGenerator.generateExcel as any).mockResolvedValue(mockBuffer);

      // Act
      const response = await useCase.execute({ userId: 123 });

      // Assert
      expect(response.success).toBe(true);
      expect(response.invoiceCount).toBe(100);
    });
  });
});

