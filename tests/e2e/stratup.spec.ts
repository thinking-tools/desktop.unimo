// tests/e2e/startup.spec.ts
import { test, expect, _electron as electron, ElectronApplication } from '@playwright/test';
import { platform } from 'os';

const PERF_BUDGET = {
  FIRST_PAINT_MS: 500,
  INTERACTIVE_MS: 800,
  WINDOW_TOGGLE_MS: 50,
} as const;

// Linux needs --no-sandbox unless chrome-sandbox has SUID bit set
const electronArgs = platform() === 'linux' ? ['.', '--no-sandbox'] : ['.'];

let app: ElectronApplication;

test.afterEach(async () => {
  await app?.close();
});

// Run first to warm OS caches (electron binary, shared libs, etc.)
test.describe.serial('Performance', () => {
  test('warmup + window toggle', async () => {
    app = await electron.launch({ args: electronArgs });
    const window = await app.firstWindow();
    await window.waitForSelector('[data-ready="true"]', { timeout: 5000 });

    const hideMs = await app.evaluate(({ BrowserWindow }) => {
      const start = performance.now();
      BrowserWindow.getAllWindows()[0].hide();
      return performance.now() - start;
    });

    const showMs = await app.evaluate(({ BrowserWindow }) => {
      const start = performance.now();
      BrowserWindow.getAllWindows()[0].show();
      return performance.now() - start;
    });

    console.log(`Hide: ${hideMs.toFixed(1)}ms, Show: ${showMs.toFixed(1)}ms`);
    expect(hideMs).toBeLessThan(PERF_BUDGET.WINDOW_TOGGLE_MS);
    expect(showMs).toBeLessThan(PERF_BUDGET.WINDOW_TOGGLE_MS);
  });

  test(`app startup < ${PERF_BUDGET.INTERACTIVE_MS}ms (warm boot)`, async () => {
    app = await electron.launch({ args: electronArgs });
    const window = await app.firstWindow();

    await window.waitForSelector('[data-ready="true"]', { timeout: 3000 });
    const startupMs = await window.locator('#app').getAttribute('data-startup-ms');
    const actualStartup = parseInt(startupMs!, 10);

    console.log(`Internal startup measurement: ${actualStartup}ms`);
    expect(actualStartup, 'Startup exceeds budget').toBeLessThan(PERF_BUDGET.INTERACTIVE_MS);
  });
});
