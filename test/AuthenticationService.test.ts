/**
 * AuthenticationService.test.ts
 * Unit tests for AuthenticationService
 * Tests whitelist-based access control and open mode
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ProcessEnv } from 'node:process';
import { AuthenticationService } from '../src/infrastructure/services/AuthenticationService';

describe('AuthenticationService', () => {
  let originalEnv: ProcessEnv;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };
    // Clear env vars
    delete process.env.ALLOWED_USER_IDS;
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe('Constructor', () => {
    it('should create instance in open mode when no whitelist provided', () => {
      const service = new AuthenticationService();
      expect(service.isOpen()).toBe(true);
    });

    it('should create instance in whitelist mode when users provided', () => {
      const service = new AuthenticationService([123, 456]);
      expect(service.isOpen()).toBe(false);
    });

    it('should parse ALLOWED_USER_IDS from environment variables', () => {
      process.env.ALLOWED_USER_IDS = '123,456,789';
      const service = new AuthenticationService();
      
      expect(service.isOpen()).toBe(false);
      expect(service.getAuthorizedUsers()).toEqual([123, 456, 789]);
    });

    it('should handle empty ALLOWED_USER_IDS environment variable', () => {
      process.env.ALLOWED_USER_IDS = '';
      const service = new AuthenticationService();
      
      expect(service.isOpen()).toBe(true);
    });

    it('should handle malformed ALLOWED_USER_IDS environment variable', () => {
      process.env.ALLOWED_USER_IDS = '123,abc,456,xyz';
      const service = new AuthenticationService();
      
      // Should parse valid IDs and ignore invalid ones
      expect(service.getAuthorizedUsers()).toEqual([123, 456]);
    });

    it('should handle whitespace in ALLOWED_USER_IDS', () => {
      process.env.ALLOWED_USER_IDS = ' 123 , 456 , 789 ';
      const service = new AuthenticationService();
      
      expect(service.getAuthorizedUsers()).toEqual([123, 456, 789]);
    });

    it('should prioritize constructor parameter over environment variable', () => {
      process.env.ALLOWED_USER_IDS = '999,888';
      const service = new AuthenticationService([123, 456]);
      
      expect(service.getAuthorizedUsers()).toEqual([123, 456]);
    });
  });

  describe('isAuthorized', () => {
    it('should allow all users in open mode', () => {
      const service = new AuthenticationService();
      
      const result1 = service.isAuthorized(123);
      const result2 = service.isAuthorized(999);
      const result3 = service.isAuthorized(0);
      
      expect(result1.authorized).toBe(true);
      expect(result2.authorized).toBe(true);
      expect(result3.authorized).toBe(true);
    });

    it('should allow authorized users in whitelist mode', () => {
      const service = new AuthenticationService([123, 456, 789]);
      
      expect(service.isAuthorized(123).authorized).toBe(true);
      expect(service.isAuthorized(456).authorized).toBe(true);
      expect(service.isAuthorized(789).authorized).toBe(true);
    });

    it('should deny unauthorized users in whitelist mode', () => {
      const service = new AuthenticationService([123, 456]);
      
      const result = service.isAuthorized(999);
      expect(result.authorized).toBe(false);
      expect(result.reason).toBe('User not in whitelist');
    });

    it('should include userId in result', () => {
      const service = new AuthenticationService([123]);
      
      const result = service.isAuthorized(123);
      expect(result.userId).toBe(123);
    });

    it('should return no reason for authorized users', () => {
      const service = new AuthenticationService([123]);
      
      const result = service.isAuthorized(123);
      expect(result.reason).toBeUndefined();
    });

    it('should return reason for unauthorized users', () => {
      const service = new AuthenticationService([123]);
      
      const result = service.isAuthorized(999);
      expect(result.reason).toBeDefined();
      expect(result.reason).toBe('User not in whitelist');
    });
  });

  describe('addUser', () => {
    it('should add user to whitelist', () => {
      const service = new AuthenticationService([123]);
      
      service.addUser(456);
      
      expect(service.isAuthorized(456).authorized).toBe(true);
      expect(service.getAuthorizedUsers()).toContain(456);
    });

    it('should disable open mode when adding first user', () => {
      const service = new AuthenticationService();
      expect(service.isOpen()).toBe(true);
      
      service.addUser(123);
      
      expect(service.isOpen()).toBe(false);
    });

    it('should not allow unauthorized users after first user added', () => {
      const service = new AuthenticationService();
      service.addUser(123);
      
      expect(service.isAuthorized(999).authorized).toBe(false);
    });

    it('should handle duplicate user additions', () => {
      const service = new AuthenticationService([123]);
      
      service.addUser(123);
      service.addUser(123);
      
      // Should not create duplicates
      expect(service.getAuthorizedUsers()).toEqual([123]);
    });
  });

  describe('removeUser', () => {
    it('should remove user from whitelist', () => {
      const service = new AuthenticationService([123, 456]);
      
      service.removeUser(456);
      
      expect(service.isAuthorized(456).authorized).toBe(false);
      expect(service.getAuthorizedUsers()).not.toContain(456);
    });

    it('should allow remaining users after removal', () => {
      const service = new AuthenticationService([123, 456, 789]);
      
      service.removeUser(456);
      
      expect(service.isAuthorized(123).authorized).toBe(true);
      expect(service.isAuthorized(789).authorized).toBe(true);
    });

    it('should handle removing non-existent user', () => {
      const service = new AuthenticationService([123]);
      
      // Should not throw error
      expect(() => service.removeUser(999)).not.toThrow();
    });
  });

  describe('getAuthorizedUsers', () => {
    it('should return empty array in open mode', () => {
      const service = new AuthenticationService();
      
      expect(service.getAuthorizedUsers()).toEqual([]);
    });

    it('should return all whitelisted users', () => {
      const service = new AuthenticationService([123, 456, 789]);
      
      const users = service.getAuthorizedUsers();
      expect(users).toContain(123);
      expect(users).toContain(456);
      expect(users).toContain(789);
      expect(users.length).toBe(3);
    });

    it('should return updated list after modifications', () => {
      const service = new AuthenticationService([123]);
      
      service.addUser(456);
      let users = service.getAuthorizedUsers();
      expect(users.length).toBe(2);
      
      service.removeUser(123);
      users = service.getAuthorizedUsers();
      expect(users).toEqual([456]);
    });
  });

  describe('isOpen', () => {
    it('should return true for open mode', () => {
      const service = new AuthenticationService();
      expect(service.isOpen()).toBe(true);
    });

    it('should return false for whitelist mode', () => {
      const service = new AuthenticationService([123]);
      expect(service.isOpen()).toBe(false);
    });

    it('should reflect state changes', () => {
      const service = new AuthenticationService();
      expect(service.isOpen()).toBe(true);
      
      service.addUser(123);
      expect(service.isOpen()).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle negative user IDs', () => {
      const service = new AuthenticationService([-1, -999]);
      
      expect(service.isAuthorized(-1).authorized).toBe(true);
      expect(service.isAuthorized(-999).authorized).toBe(true);
    });

    it('should handle zero user ID', () => {
      const service = new AuthenticationService([0]);
      
      expect(service.isAuthorized(0).authorized).toBe(true);
    });

    it('should handle very large user IDs', () => {
      const largeId = 2147483647; // Max 32-bit int
      const service = new AuthenticationService([largeId]);
      
      expect(service.isAuthorized(largeId).authorized).toBe(true);
    });

    it('should handle concurrent user checks', () => {
      const service = new AuthenticationService([123, 456]);
      
      const results = [123, 456, 999, 123, 456].map(id => service.isAuthorized(id));
      
      expect(results[0].authorized).toBe(true);
      expect(results[1].authorized).toBe(true);
      expect(results[2].authorized).toBe(false);
      expect(results[3].authorized).toBe(true);
      expect(results[4].authorized).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should check authorization quickly with large whitelist', () => {
      // Create service with 10,000 users
      const users = Array.from({ length: 10000 }, (_, i) => i);
      const service = new AuthenticationService(users);
      
      const startTime = performance.now();
      
      // Check many times
      for (let i = 0; i < 10000; i++) {
        service.isAuthorized(i);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should be very fast (< 100ms for 10,000 checks)
      expect(duration).toBeLessThan(100);
    });
  });
});
