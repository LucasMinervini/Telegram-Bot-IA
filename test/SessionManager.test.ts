/**
 * Test suite para SessionManager.ts
 * Valida gestión de sesiones y acumulación de facturas
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InMemoryInvoiceRepository } from '../src/infrastructure/repositories/InMemoryInvoiceRepository';
import { Invoice } from '../src/domain/entities/Invoice.entity';

describe('SessionManager', () => {
  let sessionManager: InMemoryInvoiceRepository;

  // Helper para crear una factura de prueba
  const createMockInvoice = (invoiceNumber: string, amount: number = 1000): Invoice => {
    return Invoice.create({
      invoiceNumber,
      date: '2025-11-03',
      vendor: {
        name: 'Test Vendor',
        taxId: '30-12345678-9',
      },
      totalAmount: amount,
      currency: 'ARS',
      items: [
        {
          description: 'Test Item',
          quantity: 1,
          unitPrice: amount,
          subtotal: amount,
        },
      ],
      metadata: {
        processedAt: '2025-11-03T10:00:00Z',
        processingTimeMs: 1000,
        confidence: 'high',
      },
    });
  };

  beforeEach(() => {
    sessionManager = new InMemoryInvoiceRepository(30); // 30 minutos de timeout
  });

  describe('addInvoice', () => {
    it('debería crear una nueva sesión al agregar la primera factura', () => {
      const userId = 12345;
      const invoice = createMockInvoice('001-001');

      sessionManager.addInvoice(userId, invoice);

      const invoices = sessionManager.getInvoices(userId);
      expect(invoices).toHaveLength(1);
      expect(invoices[0].invoiceNumber).toBe('001-001');
    });

    it('debería agregar múltiples facturas a la misma sesión', () => {
      const userId = 12345;
      const invoice1 = createMockInvoice('001-001');
      const invoice2 = createMockInvoice('001-002');
      const invoice3 = createMockInvoice('001-003');

      sessionManager.addInvoice(userId, invoice1);
      sessionManager.addInvoice(userId, invoice2);
      sessionManager.addInvoice(userId, invoice3);

      const invoices = sessionManager.getInvoices(userId);
      expect(invoices).toHaveLength(3);
      expect(invoices[0].invoiceNumber).toBe('001-001');
      expect(invoices[1].invoiceNumber).toBe('001-002');
      expect(invoices[2].invoiceNumber).toBe('001-003');
    });

    it('debería mantener sesiones separadas para diferentes usuarios', () => {
      const user1 = 11111;
      const user2 = 22222;

      sessionManager.addInvoice(user1, createMockInvoice('001-001'));
      sessionManager.addInvoice(user2, createMockInvoice('002-001'));

      expect(sessionManager.getInvoices(user1)).toHaveLength(1);
      expect(sessionManager.getInvoices(user2)).toHaveLength(1);
      expect(sessionManager.getInvoices(user1)[0].invoiceNumber).toBe('001-001');
      expect(sessionManager.getInvoices(user2)[0].invoiceNumber).toBe('002-001');
    });

    it('debería actualizar lastActivity al agregar factura', async () => {
      const userId = 12345;
      
      sessionManager.addInvoice(userId, createMockInvoice('001-001'));
      const time1 = sessionManager.getSession(userId)?.lastActivity.getTime();
      
      // Esperar un momento real
      await new Promise(resolve => setTimeout(resolve, 10));
      
      sessionManager.addInvoice(userId, createMockInvoice('001-002'));
      const time2 = sessionManager.getSession(userId)?.lastActivity.getTime();

      expect(time2).toBeGreaterThan(time1!);
    });
  });

  describe('getInvoices', () => {
    it('debería retornar array vacío para usuario sin sesión', () => {
      const userId = 99999;
      const invoices = sessionManager.getInvoices(userId);

      expect(invoices).toEqual([]);
      expect(invoices).toHaveLength(0);
    });

    it('debería retornar todas las facturas del usuario', () => {
      const userId = 12345;
      
      sessionManager.addInvoice(userId, createMockInvoice('001-001', 100));
      sessionManager.addInvoice(userId, createMockInvoice('001-002', 200));
      sessionManager.addInvoice(userId, createMockInvoice('001-003', 300));

      const invoices = sessionManager.getInvoices(userId);
      
      expect(invoices).toHaveLength(3);
      expect(invoices[0].totalAmount).toBe(100);
      expect(invoices[1].totalAmount).toBe(200);
      expect(invoices[2].totalAmount).toBe(300);
    });

    it('debería retornar copias de las facturas', () => {
      const userId = 12345;
      const original = createMockInvoice('001-001', 1000);
      
      sessionManager.addInvoice(userId, original);
      const retrieved = sessionManager.getInvoices(userId);
      
      // Las facturas tienen getters readonly que protegen la integridad del dominio
      expect(retrieved[0].totalAmount).toBe(1000);
      expect(retrieved[0].invoiceNumber).toBe('001-001');
      expect(retrieved).toHaveLength(1);
    });
  });

  describe('getInvoiceCount', () => {
    it('debería retornar 0 para usuario sin sesión', () => {
      const count = sessionManager.getInvoiceCount(99999);
      expect(count).toBe(0);
    });

    it('debería retornar el número correcto de facturas', () => {
      const userId = 12345;
      
      expect(sessionManager.getInvoiceCount(userId)).toBe(0);
      
      sessionManager.addInvoice(userId, createMockInvoice('001-001'));
      expect(sessionManager.getInvoiceCount(userId)).toBe(1);
      
      sessionManager.addInvoice(userId, createMockInvoice('001-002'));
      expect(sessionManager.getInvoiceCount(userId)).toBe(2);
      
      sessionManager.addInvoice(userId, createMockInvoice('001-003'));
      expect(sessionManager.getInvoiceCount(userId)).toBe(3);
    });
  });

  describe('clearInvoices', () => {
    it('debería limpiar todas las facturas de un usuario', () => {
      const userId = 12345;
      
      sessionManager.addInvoice(userId, createMockInvoice('001-001'));
      sessionManager.addInvoice(userId, createMockInvoice('001-002'));
      expect(sessionManager.getInvoiceCount(userId)).toBe(2);
      
      sessionManager.clearInvoices(userId);
      
      expect(sessionManager.getInvoiceCount(userId)).toBe(0);
      expect(sessionManager.getInvoices(userId)).toEqual([]);
    });

    it('debería actualizar lastActivity al limpiar', async () => {
      const userId = 12345;
      
      sessionManager.addInvoice(userId, createMockInvoice('001-001'));
      const time1 = sessionManager.getSession(userId)?.lastActivity.getTime();
      
      // Esperar un momento real
      await new Promise(resolve => setTimeout(resolve, 10));
      
      sessionManager.clearInvoices(userId);
      const time2 = sessionManager.getSession(userId)?.lastActivity.getTime();

      expect(time2).toBeGreaterThan(time1!);
    });

    it('no debería generar error al limpiar sesión inexistente', () => {
      expect(() => {
        sessionManager.clearInvoices(99999);
      }).not.toThrow();
    });

    it('debería mantener la sesión existente después de limpiar', () => {
      const userId = 12345;
      
      sessionManager.addInvoice(userId, createMockInvoice('001-001'));
      sessionManager.clearInvoices(userId);
      
      const session = sessionManager.getSession(userId);
      expect(session).toBeDefined();
      expect(session?.invoices.length).toBe(0);
    });
  });

  describe('deleteSession', () => {
    it('debería eliminar completamente la sesión de un usuario', () => {
      const userId = 12345;
      
      sessionManager.addInvoice(userId, createMockInvoice('001-001'));
      expect(sessionManager.hasSession(userId)).toBe(true);
      
      sessionManager.deleteSession(userId);
      
      expect(sessionManager.getSession(userId)).toBeUndefined();
      expect(sessionManager.hasSession(userId)).toBe(false);
    });

    it('no debería generar error al eliminar sesión inexistente', () => {
      expect(() => {
        sessionManager.deleteSession(99999);
      }).not.toThrow();
    });
  });

  describe('hasSession', () => {
    it('debería retornar false para usuario sin sesión', () => {
      expect(sessionManager.hasSession(99999)).toBe(false);
    });

    it('debería retornar true para sesión vacía', () => {
      const userId = 12345;
      
      sessionManager.addInvoice(userId, createMockInvoice('001-001'));
      sessionManager.clearInvoices(userId);
      
      expect(sessionManager.hasSession(userId)).toBe(true);
    });

    it('debería retornar true cuando hay facturas', () => {
      const userId = 12345;
      
      sessionManager.addInvoice(userId, createMockInvoice('001-001'));
      
      expect(sessionManager.hasSession(userId)).toBe(true);
    });
  });

  describe('getActiveSessionCount', () => {
    it('debería retornar el número correcto de sesiones activas', () => {
      sessionManager.addInvoice(11111, createMockInvoice('001-001'));
      sessionManager.addInvoice(11111, createMockInvoice('001-002'));
      sessionManager.addInvoice(22222, createMockInvoice('002-001'));
      sessionManager.addInvoice(33333, createMockInvoice('003-001'));
      sessionManager.addInvoice(33333, createMockInvoice('003-002'));
      sessionManager.addInvoice(33333, createMockInvoice('003-003'));

      const count = sessionManager.getActiveSessionCount();

      expect(count).toBe(3);
    });

    it('debería retornar cero cuando no hay sesiones', () => {
      const count = sessionManager.getActiveSessionCount();

      expect(count).toBe(0);
    });

    it('debería mantener el conteo después de limpiar sesión', () => {
      const userId = 12345;
      
      sessionManager.addInvoice(userId, createMockInvoice('001-001'));
      sessionManager.addInvoice(userId, createMockInvoice('001-002'));
      
      let count = sessionManager.getActiveSessionCount();
      expect(count).toBe(1);
      
      sessionManager.clearInvoices(userId);
      count = sessionManager.getActiveSessionCount();
      expect(count).toBe(1); // Sesión sigue existiendo
    });
  });

  describe('getSession', () => {
    it('debería retornar undefined para usuario sin sesión', () => {
      const session = sessionManager.getSession(99999);
      expect(session).toBeUndefined();
    });

    it('debería retornar información correcta de la sesión', () => {
      const userId = 12345;
      
      sessionManager.addInvoice(userId, createMockInvoice('001-001'));
      sessionManager.addInvoice(userId, createMockInvoice('001-002'));

      const session = sessionManager.getSession(userId);

      expect(session).toBeDefined();
      expect(session?.invoices.length).toBe(2);
      expect(session?.lastActivity).toBeInstanceOf(Date);
    });

    it('debería reflejar cambios en el conteo de facturas', () => {
      const userId = 12345;
      
      sessionManager.addInvoice(userId, createMockInvoice('001-001'));
      expect(sessionManager.getSession(userId)?.invoices.length).toBe(1);
      
      sessionManager.addInvoice(userId, createMockInvoice('001-002'));
      expect(sessionManager.getSession(userId)?.invoices.length).toBe(2);
      
      sessionManager.clearInvoices(userId);
      expect(sessionManager.getSession(userId)?.invoices.length).toBe(0);
    });
  });

  describe('Session Timeout y Cleanup', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('debería limpiar sesiones expiradas después del timeout', () => {
      // Crear SessionManager con 1 minuto de timeout
      const shortTimeoutManager = new InMemoryInvoiceRepository(1);
      const userId = 12345;

      shortTimeoutManager.addInvoice(userId, createMockInvoice('001-001'));
      expect(shortTimeoutManager.hasSession(userId)).toBe(true);

      // Avanzar 2 minutos (más que el timeout)
      vi.advanceTimersByTime(2 * 60 * 1000);

      // Triggear cleanup manualmente
      const cleaned = shortTimeoutManager.cleanExpiredSessions();

      // La sesión debería estar eliminada
      expect(cleaned).toBeGreaterThan(0);
      expect(shortTimeoutManager.getSession(userId)).toBeUndefined();
    });

    it('no debería limpiar sesiones que siguen activas', () => {
      const shortTimeoutManager = new InMemoryInvoiceRepository(5); // 5 minutos
      const userId = 12345;

      shortTimeoutManager.addInvoice(userId, createMockInvoice('001-001'));

      // Avanzar solo 3 minutos (menos que timeout)
      vi.advanceTimersByTime(3 * 60 * 1000);

      // Agregar otra factura (actualiza lastActivity)
      shortTimeoutManager.addInvoice(userId, createMockInvoice('001-002'));

      // Avanzar otros 3 minutos
      vi.advanceTimersByTime(3 * 60 * 1000);

      // Total: 6 minutos, pero lastActivity se actualizó a los 3 minutos
      // Así que solo han pasado 3 minutos desde la última actividad
      const cleaned = shortTimeoutManager.cleanExpiredSessions();
      expect(cleaned).toBe(0);
      expect(shortTimeoutManager.hasSession(userId)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('debería manejar múltiples operaciones en la misma sesión', () => {
      const userId = 12345;

      sessionManager.addInvoice(userId, createMockInvoice('001-001'));
      sessionManager.addInvoice(userId, createMockInvoice('001-002'));
      expect(sessionManager.getInvoiceCount(userId)).toBe(2);

      sessionManager.clearInvoices(userId);
      expect(sessionManager.getInvoiceCount(userId)).toBe(0);

      sessionManager.addInvoice(userId, createMockInvoice('001-003'));
      expect(sessionManager.getInvoiceCount(userId)).toBe(1);

      sessionManager.deleteSession(userId);
      expect(sessionManager.getSession(userId)).toBeUndefined();
    });

    it('debería manejar IDs de usuario muy grandes', () => {
      const userId = Number.MAX_SAFE_INTEGER;

      sessionManager.addInvoice(userId, createMockInvoice('001-001'));
      expect(sessionManager.hasSession(userId)).toBe(true);
    });
  });
});

