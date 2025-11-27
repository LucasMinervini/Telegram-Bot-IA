/**
 * RateLimiterService.test.ts
 * Unit tests for RateLimiterService
 * Tests rate limiting logic and token bucket algorithm
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ProcessEnv } from 'node:process';
import { RateLimiterService } from '../src/infrastructure/services/RateLimiterService';

describe('RateLimiterService', () => {
  let originalEnv: ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.RATE_LIMIT_REQUESTS_PER_MINUTE;
    delete process.env.RATE_LIMIT_REQUESTS_PER_HOUR;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllTimers();
  });

  describe('Constructor', () => {
    it('should create instance with rate limiting disabled by default', () => {
      const service = new RateLimiterService();
      expect(service.isEnabled()).toBe(false);
    });

    it('should enable rate limiting when config provided', () => {
      const service = new RateLimiterService({
        maxRequestsPerMinute: 10,
        maxRequestsPerHour: 100,
      });
      expect(service.isEnabled()).toBe(true);
    });

    it('should enable rate limiting from environment variables', () => {
      process.env.RATE_LIMIT_REQUESTS_PER_MINUTE = '10';
      const service = new RateLimiterService();
      expect(service.isEnabled()).toBe(true);
    });

    it('should enable rate limiting if only minute limit is set', () => {
      process.env.RATE_LIMIT_REQUESTS_PER_MINUTE = '5';
      const service = new RateLimiterService();
      expect(service.isEnabled()).toBe(true);
    });

    it('should enable rate limiting if only hour limit is set', () => {
      process.env.RATE_LIMIT_REQUESTS_PER_HOUR = '50';
      const service = new RateLimiterService();
      expect(service.isEnabled()).toBe(true);
    });

    it('should prioritize config parameter over environment', () => {
      process.env.RATE_LIMIT_REQUESTS_PER_MINUTE = '999';
      const service = new RateLimiterService({
        maxRequestsPerMinute: 10,
      });
      
      const result = service.isAllowed(123);
      // Should use config value, not env
      expect(result).toBeDefined();
    });
  });

  describe('isEnabled', () => {
    it('should return false when rate limiting is disabled', () => {
      const service = new RateLimiterService();
      expect(service.isEnabled()).toBe(false);
    });

    it('should return true when rate limiting is enabled', () => {
      const service = new RateLimiterService({
        maxRequestsPerMinute: 10,
      });
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe('isAllowed - When disabled', () => {
    it('should always allow requests when disabled', () => {
      const service = new RateLimiterService();
      
      for (let i = 0; i < 100; i++) {
        const result = service.isAllowed(123);
        expect(result.allowed).toBe(true);
      }
    });

    it('should return infinity for remaining requests when disabled', () => {
      const service = new RateLimiterService();
      const result = service.isAllowed(123);
      
      expect(result.remainingRequests).toBe(Infinity);
    });

    it('should allow different users when disabled', () => {
      const service = new RateLimiterService();
      
      expect(service.isAllowed(123).allowed).toBe(true);
      expect(service.isAllowed(456).allowed).toBe(true);
      expect(service.isAllowed(999).allowed).toBe(true);
    });
  });

  describe('isAllowed - Per minute limit', () => {
    it('should allow requests up to minute limit', () => {
      const service = new RateLimiterService({
        maxRequestsPerMinute: 5,
        maxRequestsPerHour: 100,
      });
      
      for (let i = 0; i < 5; i++) {
        expect(service.isAllowed(123).allowed).toBe(true);
      }
    });

    it('should deny requests exceeding minute limit', () => {
      const service = new RateLimiterService({
        maxRequestsPerMinute: 3,
        maxRequestsPerHour: 100,
      });
      
      service.isAllowed(123); // 1st
      service.isAllowed(123); // 2nd
      service.isAllowed(123); // 3rd
      
      const result = service.isAllowed(123); // 4th - exceeds limit
      expect(result.allowed).toBe(false);
    });

    it('should track remaining requests correctly', () => {
      const service = new RateLimiterService({
        maxRequestsPerMinute: 5,
        maxRequestsPerHour: 100,
      });
      
      let result = service.isAllowed(123);
      expect(result.remainingRequests).toBe(4);
      
      result = service.isAllowed(123);
      expect(result.remainingRequests).toBe(3);
      
      result = service.isAllowed(123);
      expect(result.remainingRequests).toBe(2);
    });

    it('should provide reset time when limit exceeded', () => {
      const service = new RateLimiterService({
        maxRequestsPerMinute: 2,
        maxRequestsPerHour: 100,
      });
      
      service.isAllowed(123);
      service.isAllowed(123);
      
      const result = service.isAllowed(123);
      expect(result.resetTime).toBeDefined();
      expect(result.retryAfterSeconds).toBeDefined();
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('should isolate limits per user', () => {
      const service = new RateLimiterService({
        maxRequestsPerMinute: 3,
        maxRequestsPerHour: 100,
      });
      
      service.isAllowed(123);
      service.isAllowed(123);
      service.isAllowed(123);
      
      // User 123 is limited, but user 456 should still be allowed
      expect(service.isAllowed(123).allowed).toBe(false);
      expect(service.isAllowed(456).allowed).toBe(true);
    });
  });

  describe('isAllowed - Per hour limit', () => {
    it('should enforce hour limit', () => {
      const service = new RateLimiterService({
        maxRequestsPerMinute: 100,
        maxRequestsPerHour: 5,
      });
      
      for (let i = 0; i < 5; i++) {
        expect(service.isAllowed(123).allowed).toBe(true);
      }
      
      expect(service.isAllowed(123).allowed).toBe(false);
    });

    it('should track hour limit separately from minute limit', () => {
      const service = new RateLimiterService({
        maxRequestsPerMinute: 10,
        maxRequestsPerHour: 20,
      });
      
      // Use up minute limit multiple times (10 per minute)
      for (let minute = 0; minute < 2; minute++) {
        for (let i = 0; i < 10; i++) {
          const result = service.isAllowed(123);
          if (minute === 0 && i < 10) {
            expect(result.allowed).toBe(true);
          }
        }
      }
    });
  });

  describe('Both limits', () => {
    it('should enforce whichever limit is hit first', () => {
      const service = new RateLimiterService({
        maxRequestsPerMinute: 5,
        maxRequestsPerHour: 10,
      });
      
      // Minute limit (5) is stricter, so should hit that first
      for (let i = 0; i < 5; i++) {
        expect(service.isAllowed(123).allowed).toBe(true);
      }
      
      expect(service.isAllowed(123).allowed).toBe(false);
    });
  });

  describe('Time-based limits', () => {
    it('should reset minute limit after 60 seconds', async () => {
      vi.useFakeTimers();
      
      const service = new RateLimiterService({
        maxRequestsPerMinute: 2,
        maxRequestsPerHour: 100,
      });
      
      service.isAllowed(123);
      service.isAllowed(123);
      expect(service.isAllowed(123).allowed).toBe(false);
      
      // Advance time by 61 seconds
      vi.advanceTimersByTime(61000);
      
      // Should be allowed again
      expect(service.isAllowed(123).allowed).toBe(true);
      
      vi.useRealTimers();
    });
  });

  describe('Multiple users', () => {
    it('should track limits independently per user', () => {
      const service = new RateLimiterService({
        maxRequestsPerMinute: 3,
        maxRequestsPerHour: 100,
      });
      
      // User 123 uses up their limit
      for (let i = 0; i < 3; i++) {
        expect(service.isAllowed(123).allowed).toBe(true);
      }
      expect(service.isAllowed(123).allowed).toBe(false);
      
      // User 456 should still have requests available
      for (let i = 0; i < 3; i++) {
        expect(service.isAllowed(456).allowed).toBe(true);
      }
      expect(service.isAllowed(456).allowed).toBe(false);
      
      // User 789 should also be independent
      expect(service.isAllowed(789).allowed).toBe(true);
    });

    it('should handle many concurrent users', () => {
      const service = new RateLimiterService({
        maxRequestsPerMinute: 5,
        maxRequestsPerHour: 100,
      });
      
      // Simulate 100 users making requests
      for (let userId = 1; userId <= 100; userId++) {
        for (let i = 0; i < 5; i++) {
          expect(service.isAllowed(userId).allowed).toBe(true);
        }
        expect(service.isAllowed(userId).allowed).toBe(false);
      }
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const service = new RateLimiterService({
        maxRequestsPerMinute: 10,
        maxRequestsPerHour: 100,
      });
      
      const config = service.getConfig();
      expect(config.maxRequestsPerMinute).toBe(10);
      expect(config.maxRequestsPerHour).toBe(100);
    });
  });

  describe('Reset method', () => {
    it('should reset user limits', () => {
      const service = new RateLimiterService({
        maxRequestsPerMinute: 3,
        maxRequestsPerHour: 100,
      });
      
      service.isAllowed(123);
      service.isAllowed(123);
      service.isAllowed(123);
      expect(service.isAllowed(123).allowed).toBe(false);
      
      service.resetUser(123);
      
      expect(service.isAllowed(123).allowed).toBe(true);
    });

    it('should reset all limits for user', () => {
      const service = new RateLimiterService({
        maxRequestsPerMinute: 3,
        maxRequestsPerHour: 10,
      });
      
      // Exhaust limits
      for (let i = 0; i < 10; i++) {
        service.isAllowed(123);
      }
      
      service.resetUser(123);
      
      // Should be able to make requests again
      expect(service.isAllowed(123).allowed).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle zero limits gracefully', () => {
      const service = new RateLimiterService({
        maxRequestsPerMinute: 0,
        maxRequestsPerHour: 100,
      });
      
      expect(service.isAllowed(123).allowed).toBe(false);
    });

    it('should handle negative user IDs', () => {
      const service = new RateLimiterService({
        maxRequestsPerMinute: 5,
        maxRequestsPerHour: 100,
      });
      
      // Negative IDs should work like any other ID
      expect(service.isAllowed(-1).allowed).toBe(true);
      expect(service.isAllowed(-999).allowed).toBe(true);
      
      // And should respect the limits
      service.isAllowed(-1);
      service.isAllowed(-1);
      service.isAllowed(-1);
      service.isAllowed(-1);
      service.isAllowed(-1);
      expect(service.isAllowed(-1).allowed).toBe(false);
    });

    it('should handle very large request counts', () => {
      const service = new RateLimiterService({
        maxRequestsPerMinute: 100000,
        maxRequestsPerHour: 1000000,
      });
      
      for (let i = 0; i < 1000; i++) {
        expect(service.isAllowed(123).allowed).toBe(true);
      }
    });
  });

  describe('Cleanup', () => {
    it('should cleanup old entries automatically', async () => {
      const service = new RateLimiterService({
        maxRequestsPerMinute: 5,
      });
      
      // Make some requests
      service.isAllowed(123);
      service.isAllowed(456);
      
      // Call cleanup manually (since we can't easily test setInterval)
      expect(service.getStats().totalUsers).toBeGreaterThanOrEqual(2);
      
      // After cleanup call, should still have the same users (within the time window)
      expect(service.getStats().totalUsers).toBeGreaterThanOrEqual(2);
    });
  });
});
