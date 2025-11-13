/**
 * AuditLogger.ts
 * Immutable audit logging service for security compliance
 * Implements write-only logging to prevent tampering
 * Follows Clean Architecture - Infrastructure Layer
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { ILogger } from '../../domain/interfaces/ILogger';

export interface IAuditLogEntry {
  timestamp: string;
  action: string;
  userId: number;
  details: Record<string, any>;
  hash?: string; // For integrity verification (future enhancement)
}

/**
 * Audit Logger Implementation
 * Writes immutable audit logs to file system
 * 
 * Security Features:
 * - Write-only logs (append mode)
 * - Timestamped entries
 * - JSON format for structured logging
 * - Automatic log rotation
 */
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
    } catch (error) {
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

  /**
   * Write audit log entry (immutable, append-only)
   */
  audit(action: string, userId: number, details: Record<string, any>): void {
    try {
      // Check if log rotation is needed
      if (this.shouldRotateLog()) {
        this.rotateLog();
      }

      const entry: IAuditLogEntry = {
        timestamp: new Date().toISOString(),
        action,
        userId,
        details,
      };

      // Write as JSON line (one entry per line for easy parsing)
      const logLine = JSON.stringify(entry) + '\n';
      
      // Append to file (write-only, immutable)
      fs.appendFileSync(this.auditLogPath, logLine, { encoding: 'utf8', flag: 'a' });
      
      // Also log to console for immediate visibility
      console.log(`[AUDIT] ${entry.timestamp} | Action: ${action} | User: ${userId} | Details: ${JSON.stringify(details)}`);
      
    } catch (error: any) {
      // Critical: Audit logging must never fail silently
      console.error(`[AuditLogger] CRITICAL: Failed to write audit log: ${error.message}`);
      console.error(`[AuditLogger] Action: ${action}, User: ${userId}, Details:`, details);
    }
  }

  // Standard logging methods (delegate to console for now)
  info(message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [AuditLogger] ℹ️  ${message}`, ...args);
  }

  success(message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [AuditLogger] ✅ ${message}`, ...args);
  }

  error(message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [AuditLogger] ❌ ${message}`, ...args);
  }

  warn(message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] [AuditLogger] ⚠️  ${message}`, ...args);
  }

  debug(message: string, ...args: any[]): void {
    if (process.env.LOG_LEVEL === 'debug') {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [AuditLogger] 🐛 ${message}`, ...args);
    }
  }
}

