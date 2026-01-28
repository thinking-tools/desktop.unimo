// tests/e2e/startup.spec.ts
import {
  test,
  expect,
  _electron as electron,
  ElectronApplication,
} from "@playwright/test";

const PERF_BUDGET = {
  // Actual Electron time (excludes test harness)
  FIRST_PAINT_MS: 500, // Main process → visible window
  INTERACTIVE_MS: 800, // Main process → app ready
  WINDOW_TOGGLE_MS: 50,
} as const;

let app: ElectronApplication;

test.afterEach(async () => {
  await app?.close();
});

test.describe("Startup Performance", () => {
  test(`app startup < ${PERF_BUDGET.INTERACTIVE_MS}ms (measured internally)`, async () => {
    app = await electron.launch({ args: ["."] });
    const window = await app.firstWindow();

    // Wait for app's own measurement
    await window.waitForSelector('[data-ready="true"]', { timeout: 3000 });

    const startupMs = await window
      .locator("#app")
      .getAttribute("data-startup-ms");
    const actualStartup = parseInt(startupMs!, 10);

    console.log(`Internal startup measurement: ${actualStartup}ms`);
    expect(actualStartup, "Startup exceeds budget").toBeLessThan(
      PERF_BUDGET.INTERACTIVE_MS,
    );
  });
});

test.describe("Runtime Performance", () => {
  test.beforeEach(async () => {
    app = await electron.launch({ args: ["."] });
    const window = await app.firstWindow();
    await window.waitForSelector('[data-ready="true"]', { timeout: 3000 });
  });

  test(`window toggle < ${PERF_BUDGET.WINDOW_TOGGLE_MS}ms`, async () => {
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
});
