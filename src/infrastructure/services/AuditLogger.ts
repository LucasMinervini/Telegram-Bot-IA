/**
 * AuditLogger.ts
 * Immutable audit logging service for security compliance
 * Implements write-only logging to prevent tampering
 * Clean Architecture - Infrastructure Layer
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { ILogger } from '../../domain/interfaces/ILogger';

export interface IAuditLogEntry {
  timestamp: string;
  action: string;
  userId: number;
  details: Record<string, any>;
  hash?: string;
}

export class AuditLogger implements ILogger {
  private auditLogPath: string;
  private maxLogSizeMB: number;
  private logRotationEnabled: boolean;

  constructor(
    auditLogDir: string = process.env.AUDIT_LOG_DIR || './logs/audit',
    maxLogSizeMB: number = parseInt(process.env.AUDIT_LOG_MAX_SIZE_MB || '100'),
    logRotationEnabled: boolean = process.env.AUDIT_LOG_ROTATION !== 'false'
  ) {
    this.auditLogPath = path.join(auditLogDir, `audit_${this.getDateString()}.log`);
    this.maxLogSizeMB = maxLogSizeMB;
    this.logRotationEnabled = logRotationEnabled;
    this.ensureLogDirectory();
  }

  private ensureLogDirectory(): void {
    const logDir = path.dirname(this.auditLogPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  private getDateString(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  private shouldRotateLog(): boolean {
    if (!this.logRotationEnabled) return false;
    try {
      if (!fs.existsSync(this.auditLogPath)) return false;
      const stats = fs.statSync(this.auditLogPath);
      const sizeMB = stats.size / (1024 * 1024);
      return sizeMB >= this.maxLogSizeMB;
    } catch {
      return false;
    }
  }

  private rotateLog(): void {
    if (!fs.existsSync(this.auditLogPath)) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rotatedPath = this.auditLogPath.replace('.log', `_${timestamp}.log`);
    try {
      fs.moveSync(this.auditLogPath, rotatedPath);
    } catch (error) {
      console.error(`[AuditLogger] Failed to rotate log: ${error}`);
    }
  }

  audit(action: string, userId: number, details: Record<string, any>): void {
    try {
      if (this.shouldRotateLog()) {
        this.rotateLog();
      }
      const entry: IAuditLogEntry = {
        timestamp: new Date().toISOString(),
        action,
        userId,
        details,
      };
      const logLine = JSON.stringify(entry) + '\n';
      fs.appendFileSync(this.auditLogPath, logLine, { encoding: 'utf8', flag: 'a' });
      console.log(`[AUDIT] ${entry.timestamp} | Action: ${action} | User: ${userId} | Details: ${JSON.stringify(details)}`);
    } catch (error: any) {
      console.error(`[AuditLogger] CRITICAL: Failed to write audit log: ${error.message}`);
      console.error(`[AuditLogger] Action: ${action}, User: ${userId}, Details:`, details);
    }
  }

  info(message: string, ...args: any[]): void {
    this.logMessage('INFO', message, args);
  }

  success(message: string, ...args: any[]): void {
    this.logMessage('SUCCESS', message, args);
  }

  error(message: string, ...args: any[]): void {
    this.logMessage('ERROR', message, args);
  }

  warn(message: string, ...args: any[]): void {
    this.logMessage('WARN', message, args);
  }

  debug(message: string, ...args: any[]): void {
    if (process.env.LOG_LEVEL === 'debug') {
      this.logMessage('DEBUG', message, args);
    }
  }

  private logMessage(level: string, message: string, args: any[]): void {
    const timestamp = new Date().toISOString();
    const entry = {
      timestamp,
      level,
      message,
      data: args ?? [],
    };
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(this.auditLogPath, line, { encoding: 'utf8', flag: 'a' });
    console.log(`[${timestamp}] [AuditLogger] ${level} ${message}`, ...args);
  }
}
