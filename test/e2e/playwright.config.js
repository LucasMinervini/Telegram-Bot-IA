import { defineConfig } from '@playwright/test';
export default defineConfig({
    testDir: './',
    timeout: 30000,
    fullyParallel: false,
    retries: 0,
    reporter: 'list',
    use: {
        baseURL: 'http://127.0.0.1',
    },
});
