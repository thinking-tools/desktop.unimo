// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  workers: 1, // Electron enforces single instance (SingletonLock)
  use: { trace: 'on-first-retry' }
});