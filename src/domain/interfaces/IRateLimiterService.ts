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

export interface IRateLimiterService {
  isEnabled(): boolean;
  isAllowed(userId: number): IRateLimitResult;
  getConfig(): IRateLimitConfig;
}
