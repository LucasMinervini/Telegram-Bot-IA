import { vi } from 'vitest';
import { ILogger } from '@/domain/interfaces/ILogger';

export const createLoggerMock = (): ILogger => ({
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  audit: vi.fn(),
});
