/**
 * AuthenticationService.ts
 * User authentication and authorization service
 * Implements whitelist-based access control
 * Follows Clean Architecture - Infrastructure Layer
 */

export interface IAuthResult {
  authorized: boolean;
  userId: number;
  reason?: string;
}

/**
 * Authentication Service
 * Controls access to the bot based on user whitelist
 * 
 * Security Features:
 * - Whitelist-based authorization
 * - Configurable via environment variables
 * - Fast lookup (Set-based)
 * - No authentication required if whitelist is empty (open mode)
 */
export class AuthenticationService {
  private allowedUserIds: Set<number>;
  private isOpenMode: boolean;

  constructor(allowedUserIds?: number[]) {
    // Parse from environment variable or use provided list
    const envUserIds = process.env.ALLOWED_USER_IDS;
    
    if (allowedUserIds) {
      this.allowedUserIds = new Set(allowedUserIds);
      this.isOpenMode = false;
    } else if (envUserIds && envUserIds.trim() !== '') {
      // Parse comma-separated list from environment
      const userIds = envUserIds
        .split(',')
        .map(id => parseInt(id.trim()))
        .filter(id => !isNaN(id));
      
      this.allowedUserIds = new Set(userIds);
      this.isOpenMode = false;
    } else {
      // Open mode: no whitelist configured, allow all users
      this.allowedUserIds = new Set();
      this.isOpenMode = true;
    }
  }

  /**
   * Check if user is authorized
   */
  isAuthorized(userId: number): IAuthResult {
    // Open mode: allow all users
    if (this.isOpenMode) {
      return {
        authorized: true,
        userId,
      };
    }

    // Whitelist mode: check if user is in whitelist
    const authorized = this.allowedUserIds.has(userId);
    
    return {
      authorized,
      userId,
      reason: authorized ? undefined : 'User not in whitelist',
    };
  }

  /**
   * Add user to whitelist (runtime modification)
   */
  addUser(userId: number): void {
    this.allowedUserIds.add(userId);
    this.isOpenMode = false;
  }

  /**
   * Remove user from whitelist
   */
  removeUser(userId: number): void {
    this.allowedUserIds.delete(userId);
  }

  /**
   * Get all authorized user IDs
   */
  getAuthorizedUsers(): number[] {
    return Array.from(this.allowedUserIds);
  }

  /**
   * Check if service is in open mode
   */
  isOpen(): boolean {
    return this.isOpenMode;
  }

  /**
   * Get statistics
   */
  getStats(): { isOpenMode: boolean; whitelistSize: number } {
    return {
      isOpenMode: this.isOpenMode,
      whitelistSize: this.allowedUserIds.size,
    };
  }
}

