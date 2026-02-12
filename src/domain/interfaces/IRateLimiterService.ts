export interface IRateLimitConfig {
  maxRequestsPerMinute: number;
  maxRequestsPerHour: number;
  windowSizeMs: number;
}

export interface IRateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export interface IRateLimiterService {
  isEnabled(): boolean;
  isAllowed(userId: number): IRateLimitResult;
  getConfig(): IRateLimitConfig;
}
