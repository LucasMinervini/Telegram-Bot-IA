/**
 * AuditLogger.test.ts
 * Unit tests for AuditLogger
 * Tests immutable audit logging functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import { AuditLogger } from '../src/infrastructure/services/AuditLogger';

describe('AuditLogger', () => {
  const testLogDir = './test-logs';

  beforeEach(() => {
    // Clean test directory
    if (fs.existsSync(testLogDir)) {
      fs.removeSync(testLogDir);
    }
  });

  afterEach(() => {
    // Clean test directory
    if (fs.existsSync(testLogDir)) {
      fs.removeSync(testLogDir);
    }
  });

  describe('Constructor', () => {
    it('should create instance with default directory', () => {
      const logger = new AuditLogger(testLogDir);
      expect(logger).toBeDefined();
    });

    it('should create log directory if not exists', () => {
      const logger = new AuditLogger(testLogDir);
      expect(fs.existsSync(testLogDir)).toBe(true);
    });

    it('should use environment variable for log directory', () => {
      const envDir = './env-test-logs';
      process.env.AUDIT_LOG_DIR = envDir;
      
      const logger = new AuditLogger();
      
      expect(fs.existsSync(envDir)).toBe(true);
      
      // Cleanup
      fs.removeSync(envDir);
      delete process.env.AUDIT_LOG_DIR;
    });

    it('should handle custom max log size', () => {
      const logger = new AuditLogger(testLogDir, 50);
      expect(logger).toBeDefined();
    });
  });

  describe('audit method', () => {
    it('should write audit log entry', () => {
      const logger = new AuditLogger(testLogDir);
      
      logger.audit('USER_LOGIN', 123, { username: 'john' });
      
      const logFile = fs.readdirSync(testLogDir)[0];
      expect(logFile).toBeDefined();
      expect(logFile).toContain('.log');
    });

    it('should include timestamp in log entry', () => {
      const logger = new AuditLogger(testLogDir);
      
      logger.audit('USER_LOGIN', 123, { username: 'john' });
      
      const logFile = path.join(testLogDir, fs.readdirSync(testLogDir)[0]);
      const content = fs.readFileSync(logFile, 'utf-8');
      
      expect(content).toContain('timestamp');
      expect(content).toContain('2025');
    });

    it('should include action in log entry', () => {
      const logger = new AuditLogger(testLogDir);
      
      logger.audit('USER_LOGIN', 123, { username: 'john' });
      
      const logFile = path.join(testLogDir, fs.readdirSync(testLogDir)[0]);
      const content = fs.readFileSync(logFile, 'utf-8');
      
      expect(content).toContain('USER_LOGIN');
    });

    it('should include userId in log entry', () => {
      const logger = new AuditLogger(testLogDir);
      
      logger.audit('USER_LOGIN', 123, {});
      
      const logFile = path.join(testLogDir, fs.readdirSync(testLogDir)[0]);
      const content = fs.readFileSync(logFile, 'utf-8');
      
      expect(content).toContain('123');
    });

    it('should include details in log entry', () => {
      const logger = new AuditLogger(testLogDir);
      
      logger.audit('FILE_UPLOADED', 456, { filename: 'invoice.pdf', size: 1024 });
      
      const logFile = path.join(testLogDir, fs.readdirSync(testLogDir)[0]);
      const content = fs.readFileSync(logFile, 'utf-8');
      
      expect(content).toContain('invoice.pdf');
      expect(content).toContain('1024');
    });

    it('should write multiple entries to same file', () => {
      const logger = new AuditLogger(testLogDir);
      
      logger.audit('ACTION_1', 123, { action: 'a' });
      logger.audit('ACTION_2', 456, { action: 'b' });
      logger.audit('ACTION_3', 789, { action: 'c' });
      
      const logFile = path.join(testLogDir, fs.readdirSync(testLogDir)[0]);
      const content = fs.readFileSync(logFile, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l);
      
      expect(lines.length).toBe(3);
    });

    it('should format entries as JSON lines', () => {
      const logger = new AuditLogger(testLogDir);
      
      logger.audit('TEST_ACTION', 123, { key: 'value' });
      
      const logFile = path.join(testLogDir, fs.readdirSync(testLogDir)[0]);
      const content = fs.readFileSync(logFile, 'utf-8');
      const lines = content.trim().split('\n');
      
      const entry = JSON.parse(lines[0]);
      expect(entry.action).toBe('TEST_ACTION');
      expect(entry.userId).toBe(123);
      expect(entry.details.key).toBe('value');
    });

    it('should handle complex details object', () => {
      const logger = new AuditLogger(testLogDir);
      
      const details = {
        operation: 'TRANSFER',
        amount: 1000,
        currency: 'ARS',
        nested: {
          from: 'account_a',
          to: 'account_b',
        },
        array: [1, 2, 3],
      };
      
      logger.audit('COMPLEX_ACTION', 111, details);
      
      const logFile = path.join(testLogDir, fs.readdirSync(testLogDir)[0]);
      const content = fs.readFileSync(logFile, 'utf-8');
      const entry = JSON.parse(content.trim());
      
      expect(entry.details).toEqual(details);
    });
  });

  describe('ILogger interface compliance', () => {
    it('should implement info method', () => {
      const logger = new AuditLogger(testLogDir);
      expect(typeof logger.info).toBe('function');
    });

    it('should implement error method', () => {
      const logger = new AuditLogger(testLogDir);
      expect(typeof logger.error).toBe('function');
    });

    it('should implement warn method', () => {
      const logger = new AuditLogger(testLogDir);
      expect(typeof logger.warn).toBe('function');
    });

    it('should implement success method', () => {
      const logger = new AuditLogger(testLogDir);
      expect(typeof logger.success).toBe('function');
    });

    it('should implement debug method', () => {
      const logger = new AuditLogger(testLogDir);
      expect(typeof logger.debug).toBe('function');
    });

    it('should implement audit method', () => {
      const logger = new AuditLogger(testLogDir);
      expect(typeof logger.audit).toBe('function');
    });
  });

  describe('info, error, warn, success methods', () => {
    it('should log messages via info', () => {
      const logger = new AuditLogger(testLogDir);
      
      logger.info('Information message');
      
      const logFile = path.join(testLogDir, fs.readdirSync(testLogDir)[0]);
      const content = fs.readFileSync(logFile, 'utf-8');
      
      expect(content).toContain('Information message');
    });

    it('should log messages via error', () => {
      const logger = new AuditLogger(testLogDir);
      
      logger.error('Error message');
      
      const logFile = path.join(testLogDir, fs.readdirSync(testLogDir)[0]);
      const content = fs.readFileSync(logFile, 'utf-8');
      
      expect(content).toContain('Error message');
    });

    it('should log messages via warn', () => {
      const logger = new AuditLogger(testLogDir);
      
      logger.warn('Warning message');
      
      const logFile = path.join(testLogDir, fs.readdirSync(testLogDir)[0]);
      const content = fs.readFileSync(logFile, 'utf-8');
      
      expect(content).toContain('Warning message');
    });

    it('should log messages via success', () => {
      const logger = new AuditLogger(testLogDir);
      
      logger.success('Success message');
      
      const logFile = path.join(testLogDir, fs.readdirSync(testLogDir)[0]);
      const content = fs.readFileSync(logFile, 'utf-8');
      
      expect(content).toContain('Success message');
    });

    it('should handle null data gracefully', () => {
      const logger = new AuditLogger(testLogDir);
      
      logger.info('Message without data');
      
      const logFile = path.join(testLogDir, fs.readdirSync(testLogDir)[0]);
      const content = fs.readFileSync(logFile, 'utf-8');
      
      expect(content).toBeDefined();
    });
  });

  describe('append-only behavior', () => {
    it('should append to existing log file', () => {
      const logger = new AuditLogger(testLogDir);
      
      logger.audit('FIRST', 1, {});
      logger.audit('SECOND', 2, {});
      
      const logFile = path.join(testLogDir, fs.readdirSync(testLogDir)[0]);
      const content = fs.readFileSync(logFile, 'utf-8');
      const lines = content.trim().split('\n');
      
      expect(lines[0]).toContain('FIRST');
      expect(lines[1]).toContain('SECOND');
    });

    it('should preserve order of entries', () => {
      const logger = new AuditLogger(testLogDir);
      
      for (let i = 1; i <= 5; i++) {
        logger.audit(`ACTION_${i}`, i * 100, {});
      }
      
      const logFile = path.join(testLogDir, fs.readdirSync(testLogDir)[0]);
      const content = fs.readFileSync(logFile, 'utf-8');
      const lines = content.trim().split('\n');
      
      for (let i = 0; i < 5; i++) {
        expect(lines[i]).toContain(`ACTION_${i + 1}`);
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle very long action names', () => {
      const logger = new AuditLogger(testLogDir);
      const longAction = 'A'.repeat(1000);
      
      logger.audit(longAction, 123, {});
      
      const logFile = path.join(testLogDir, fs.readdirSync(testLogDir)[0]);
      const content = fs.readFileSync(logFile, 'utf-8');
      
      expect(content).toContain(longAction);
    });

    it('should handle very large details objects', () => {
      const logger = new AuditLogger(testLogDir);
      
      const largeDetails: Record<string, any> = {};
      for (let i = 0; i < 100; i++) {
        largeDetails[`key_${i}`] = `value_${i}`;
      }
      
      logger.audit('LARGE_AUDIT', 123, largeDetails);
      
      const logFile = path.join(testLogDir, fs.readdirSync(testLogDir)[0]);
      const content = fs.readFileSync(logFile, 'utf-8');
      const entry = JSON.parse(content.trim());
      
      expect(Object.keys(entry.details).length).toBe(100);
    });

    it('should handle special characters in details', () => {
      const logger = new AuditLogger(testLogDir);
      
      const details = {
        message: 'Contains "quotes" and \\backslashes\\ and\nnewlines',
        data: '日本語テキスト',
      };
      
      logger.audit('SPECIAL_CHARS', 123, details);
      
      const logFile = path.join(testLogDir, fs.readdirSync(testLogDir)[0]);
      const content = fs.readFileSync(logFile, 'utf-8');
      const entry = JSON.parse(content.trim());
      
      expect(entry.details.message).toContain('quotes');
      expect(entry.details.data).toBe('日本語テキスト');
    });

    it('should handle negative user IDs', () => {
      const logger = new AuditLogger(testLogDir);
      
      logger.audit('ACTION', -1, {});
      
      const logFile = path.join(testLogDir, fs.readdirSync(testLogDir)[0]);
      const content = fs.readFileSync(logFile, 'utf-8');
      
      expect(content).toContain('-1');
    });
  });

  describe('Log rotation', () => {
    it('should not crash if log directory is deleted', () => {
      const logger = new AuditLogger(testLogDir);
      
      logger.audit('FIRST', 1, {});
      
      // Try to delete and recreate directory
      fs.removeSync(testLogDir);
      
      // Should handle gracefully
      expect(() => logger.audit('SECOND', 2, {})).not.toThrow();
    });
  });

  describe('Concurrent writes', () => {
    it('should handle multiple simultaneous writes', () => {
      const logger = new AuditLogger(testLogDir);
      
      for (let i = 0; i < 100; i++) {
        logger.audit(`ACTION_${i}`, i, { index: i });
      }
      
      const logFile = path.join(testLogDir, fs.readdirSync(testLogDir)[0]);
      const content = fs.readFileSync(logFile, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l);
      
      expect(lines.length).toBe(100);
    });
  });
});
