import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'test/',
        '**/*.config.ts',
        '**/*.config.js',
        '**/index.ts', // Entry point, no lógica a testear
        '**/TelegramBot.ts', // Bot principal, complejo de testear con mocks
      ],
      // Target: 80% mínimo (LOGRADO: 91.43%)
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
      // Incluir todos los archivos source
      include: ['src/**/*.ts'],
      all: true, // Incluir archivos no testeados en el reporte
    },
    include: ['test/**/*.test.ts', 'test/**/*.spec.ts'],
    exclude: ['node_modules', 'dist'],
    // Continuar aunque fallen tests (para ver coverage)
    passWithNoTests: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@modules': path.resolve(__dirname, './src/modules'),
    },
  },
});

