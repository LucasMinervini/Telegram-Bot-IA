/**
 * SessionManager.ts
 * Maneja sesiones de usuario y acumulación de facturas
 * Permite procesar múltiples facturas y generar un Excel consolidado
 */

import { Invoice } from './Interfaces';
import { Logger } from './DataStructures';

/**
 * Interfaz para sesión de usuario
 */
export interface UserSession {
  userId: number;
  invoices: Invoice[];
  lastActivity: Date;
}

/**
 * Clase SessionManager
 * Gestiona las sesiones de usuario y acumulación de facturas
 */
export class SessionManager {
  private sessions: Map<number, UserSession>;
  private logger: Logger;
  private sessionTimeoutMinutes: number;

  constructor(sessionTimeoutMinutes: number = 30) {
    this.sessions = new Map();
    this.logger = new Logger('SessionManager');
    this.sessionTimeoutMinutes = sessionTimeoutMinutes;
    
    // Limpiar sesiones expiradas cada 5 minutos
    setInterval(() => this.cleanExpiredSessions(), 5 * 60 * 1000);
  }

  /**
   * Agrega una factura a la sesión del usuario
   * @param userId ID del usuario
   * @param invoice Factura a agregar
   */
  addInvoice(userId: number, invoice: Invoice): void {
    let session = this.sessions.get(userId);

    if (!session) {
      // Crear nueva sesión
      session = {
        userId,
        invoices: [],
        lastActivity: new Date(),
      };
      this.sessions.set(userId, session);
      this.logger.info(`Nueva sesión creada para usuario ${userId}`);
    }

    // Agregar factura
    session.invoices.push(invoice);
    session.lastActivity = new Date();

    this.logger.info(
      `Factura agregada a usuario ${userId}. Total: ${session.invoices.length}`
    );
  }

  /**
   * Obtiene todas las facturas de un usuario
   * @param userId ID del usuario
   * @returns Array de facturas o array vacío si no hay sesión
   */
  getInvoices(userId: number): Invoice[] {
    const session = this.sessions.get(userId);
    return session?.invoices || [];
  }

  /**
   * Obtiene el número de facturas acumuladas
   * @param userId ID del usuario
   * @returns Cantidad de facturas
   */
  getInvoiceCount(userId: number): number {
    const session = this.sessions.get(userId);
    return session?.invoices.length || 0;
  }

  /**
   * Limpia las facturas de un usuario (después de generar Excel)
   * @param userId ID del usuario
   */
  clearInvoices(userId: number): void {
    const session = this.sessions.get(userId);
    
    if (session) {
      const count = session.invoices.length;
      session.invoices = [];
      session.lastActivity = new Date();
      this.logger.info(`Sesión limpiada para usuario ${userId}. ${count} factura(s) eliminadas`);
    }
  }

  /**
   * Elimina completamente la sesión de un usuario
   * @param userId ID del usuario
   */
  deleteSession(userId: number): void {
    if (this.sessions.has(userId)) {
      this.sessions.delete(userId);
      this.logger.info(`Sesión eliminada para usuario ${userId}`);
    }
  }

  /**
   * Verifica si un usuario tiene facturas acumuladas
   * @param userId ID del usuario
   * @returns true si tiene facturas, false si no
   */
  hasInvoices(userId: number): boolean {
    return this.getInvoiceCount(userId) > 0;
  }

  /**
   * Limpia sesiones expiradas
   */
  private cleanExpiredSessions(): void {
    const now = new Date();
    const expiredUserIds: number[] = [];

    this.sessions.forEach((session, userId) => {
      const timeDiffMinutes =
        (now.getTime() - session.lastActivity.getTime()) / (1000 * 60);

      if (timeDiffMinutes > this.sessionTimeoutMinutes) {
        expiredUserIds.push(userId);
      }
    });

    if (expiredUserIds.length > 0) {
      expiredUserIds.forEach((userId) => this.deleteSession(userId));
      this.logger.info(`${expiredUserIds.length} sesión(es) expirada(s) eliminada(s)`);
    }
  }

  /**
   * Obtiene estadísticas de sesiones activas
   * @returns Objeto con estadísticas
   */
  getStats(): { totalSessions: number; totalInvoices: number } {
    let totalInvoices = 0;
    
    this.sessions.forEach((session) => {
      totalInvoices += session.invoices.length;
    });

    return {
      totalSessions: this.sessions.size,
      totalInvoices,
    };
  }

  /**
   * Obtiene información de la sesión de un usuario
   * @param userId ID del usuario
   * @returns Información de la sesión o null
   */
  getSessionInfo(userId: number): { invoiceCount: number; lastActivity: Date } | null {
    const session = this.sessions.get(userId);
    
    if (!session) return null;

    return {
      invoiceCount: session.invoices.length,
      lastActivity: session.lastActivity,
    };
  }
}

