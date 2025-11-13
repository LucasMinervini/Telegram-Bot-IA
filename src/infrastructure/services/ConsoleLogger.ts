/**
 * ConsoleLogger.ts
 * Console-based logger implementation
 * Can be swapped with Winston, Pino, or other logging libraries
 */

import { ILogger } from '../../domain/interfaces/ILogger';

/**
 * Console Logger Implementation
 * Simple console-based logging with colors
 */
export class ConsoleLogger implements ILogger {
  private context: string;

  constructor(context: string = 'App') {
    this.context = context;
  }

  info(message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${this.context}] ℹ️  ${message}`, ...args);
  }

  success(message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${this.context}] ✅ ${message}`, ...args);
  }

  error(message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [${this.context}] ❌ ${message}`, ...args);
  }

  warn(message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] [${this.context}] ⚠️  ${message}`, ...args);
  }

  debug(message: string, ...args: any[]): void {
    if (process.env.LOG_LEVEL === 'debug') {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${this.context}] 🐛 ${message}`, ...args);
    }
  }

  audit(action: string, userId: number, details: Record<string, any>): void {
    // Console logger delegates audit to console (for development)
    // In production, use AuditLogger for file-based immutable logging
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${this.context}] [AUDIT] Action: ${action} | User: ${userId} | Details:`, details);
  }
}

