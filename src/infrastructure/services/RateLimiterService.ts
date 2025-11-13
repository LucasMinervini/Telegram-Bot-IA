/**
 * RateLimiterService.ts
 * Rate limiting service to prevent abuse and DoS attacks
 * Implements token bucket algorithm
 * Follows Clean Architecture - Infrastructure Layer
 */

export interface IRateLimitConfig {
  maxRequestsPerMinute: number;
  maxRequestsPerHour: number;
  windowSizeMs: number;
}

export interface IRateLimitResult {
  allowed: boolean;
  remainingRequests: number;
  resetTime: Date;
  retryAfterSeconds?: number;
}

/**
 * Rate Limiter Service
 * Prevents abuse by limiting requests per user
 * 
 * Security Features:
 * - Per-user rate limiting
 * - Configurable limits (per minute, per hour)
 * - Automatic cleanup of old entries
 * - Graceful degradation
 */
export class RateLimiterService {
  private userRequests: Map<number, { minute: number[]; hour: number[] }>;
  private config: IRateLimitConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private enabled: boolean;

  constructor(config?: Partial<IRateLimitConfig>) {
    this.userRequests = new Map();
    
    // Rate limiting is OPTIONAL - only enabled if explicitly configured
    const envMinute = process.env.RATE_LIMIT_REQUESTS_PER_MINUTE;
    const envHour = process.env.RATE_LIMIT_REQUESTS_PER_HOUR;
    
    // Enable only if at least one limit is configured
    this.enabled = !!(envMinute || envHour || config?.maxRequestsPerMinute || config?.maxRequestsPerHour);
    
    this.config = {
      maxRequestsPerMinute: parseInt(envMinute || '0'),
      maxRequestsPerHour: parseInt(envHour || '0'),
      windowSizeMs: 60000, // 1 minute
      ...config,
    };

    // Start cleanup task only if enabled
    if (this.enabled) {
      this.startCleanupTask();
    }
  }

  /**
   * Check if rate limiting is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Check if request is allowed for user
   * Returns allowed=true if rate limiting is disabled
   */
  isAllowed(userId: number): IRateLimitResult {
    // If rate limiting is disabled, always allow
    if (!this.enabled) {
      return {
        allowed: true,
        remainingRequests: Infinity,
        resetTime: new Date(),
      };
    }
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneHourAgo = now - 3600000;

    // Get or create user request history
    let userHistory = this.userRequests.get(userId);
    if (!userHistory) {
      userHistory = { minute: [], hour: [] };
      this.userRequests.set(userId, userHistory);
    }

    // Clean old entries
    userHistory.minute = userHistory.minute.filter(time => time > oneMinuteAgo);
    userHistory.hour = userHistory.hour.filter(time => time > oneHourAgo);

    // Check limits
    const requestsInMinute = userHistory.minute.length;
    const requestsInHour = userHistory.hour.length;

    const exceededMinute = requestsInMinute >= this.config.maxRequestsPerMinute;
    const exceededHour = requestsInHour >= this.config.maxRequestsPerHour;

    if (exceededMinute || exceededHour) {
      // Calculate retry after time
      let retryAfterSeconds = 0;
      
      if (exceededMinute) {
        const oldestRequestInMinute = Math.min(...userHistory.minute);
        retryAfterSeconds = Math.ceil((60000 - (now - oldestRequestInMinute)) / 1000);
      } else if (exceededHour) {
        const oldestRequestInHour = Math.min(...userHistory.hour);
        retryAfterSeconds = Math.ceil((3600000 - (now - oldestRequestInHour)) / 1000);
      }

      return {
        allowed: false,
        remainingRequests: 0,
        resetTime: new Date(now + (retryAfterSeconds * 1000)),
        retryAfterSeconds: Math.max(1, retryAfterSeconds),
      };
    }

    // Record this request
    userHistory.minute.push(now);
    userHistory.hour.push(now);

    // Calculate remaining requests
    const remainingMinute = Math.max(0, this.config.maxRequestsPerMinute - requestsInMinute - 1);
    const remainingHour = Math.max(0, this.config.maxRequestsPerHour - requestsInHour - 1);
    const remainingRequests = Math.min(remainingMinute, remainingHour);

    // Calculate reset time (when the oldest request in the window expires)
    let resetTime = new Date(now + 60000); // Default: 1 minute from now
    
    if (userHistory.minute.length > 0) {
      const oldestInMinute = Math.min(...userHistory.minute);
      resetTime = new Date(oldestInMinute + 60000);
    }

    return {
      allowed: true,
      remainingRequests,
      resetTime,
    };
  }

  /**
   * Get current rate limit status for user (without recording a request)
   */
  getStatus(userId: number): IRateLimitResult {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneHourAgo = now - 3600000;

    const userHistory = this.userRequests.get(userId);
    if (!userHistory) {
      return {
        allowed: true,
        remainingRequests: this.config.maxRequestsPerMinute,
        resetTime: new Date(now + 60000),
      };
    }

    // Clean old entries
    userHistory.minute = userHistory.minute.filter(time => time > oneMinuteAgo);
    userHistory.hour = userHistory.hour.filter(time => time > oneHourAgo);

    const requestsInMinute = userHistory.minute.length;
    const requestsInHour = userHistory.hour.length;

    const remainingMinute = Math.max(0, this.config.maxRequestsPerMinute - requestsInMinute);
    const remainingHour = Math.max(0, this.config.maxRequestsPerHour - requestsInHour);
    const remainingRequests = Math.min(remainingMinute, remainingHour);

    return {
      allowed: remainingRequests > 0,
      remainingRequests,
      resetTime: new Date(now + 60000),
    };
  }

  /**
   * Reset rate limit for user (admin function)
   */
  resetUser(userId: number): void {
    this.userRequests.delete(userId);
  }

  /**
   * Start cleanup task to remove old entries
   */
  private startCleanupTask(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Cleanup old entries
   */
  private cleanup(): void {
    const now = Date.now();
    const oneHourAgo = now - 3600000;

    for (const [userId, history] of this.userRequests.entries()) {
      history.minute = history.minute.filter(time => time > oneHourAgo);
      history.hour = history.hour.filter(time => time > oneHourAgo);

      // Remove user if no recent activity
      if (history.minute.length === 0 && history.hour.length === 0) {
        this.userRequests.delete(userId);
      }
    }
  }

  /**
   * Stop cleanup task (for graceful shutdown)
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): IRateLimitConfig {
    return { ...this.config };
  }

  /**
   * Get statistics (for monitoring)
   */
  getStats(): { totalUsers: number; activeUsers: number } {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    
    let activeUsers = 0;
    for (const history of this.userRequests.values()) {
      const hasRecentActivity = history.hour.some(time => time > oneHourAgo);
      if (hasRecentActivity) {
        activeUsers++;
      }
    }

    return {
      totalUsers: this.userRequests.size,
      activeUsers,
    };
  }
}

