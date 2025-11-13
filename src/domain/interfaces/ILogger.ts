/**
 * ILogger.ts
 * Interface for logging service
 * Follows Dependency Inversion Principle
 */

/**
 * Logger Interface
 * Any logging service must implement this
 */
export interface ILogger {
  /**
   * Log info message
   */
  info(message: string, ...args: any[]): void;

  /**
   * Log success message
   */
  success(message: string, ...args: any[]): void;

  /**
   * Log error message
   */
  error(message: string, ...args: any[]): void;

  /**
   * Log warning message
   */
  warn(message: string, ...args: any[]): void;

  /**
   * Log debug message
   */
  debug(message: string, ...args: any[]): void;

  /**
   * Log audit event (immutable, for security auditing)
   * Records sensitive actions for non-repudiation
   */
  audit(action: string, userId: number, details: Record<string, any>): void;
}

