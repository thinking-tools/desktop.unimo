// tests/e2e/memory-leak.spec.ts
import { test, expect, _electron as electron, ElectronApplication, Page, CDPSession } from '@playwright/test';
import { platform } from 'os';
import { measureAfterGC, heapGrowth, printSnapshots, MemorySnapshot } from './helpers/memory';

// After warmup, repeated identical operations should NOT grow the heap.
// Allow tolerance for V8 bookkeeping and JIT artifacts.
const LEAK_THRESHOLD = {
  MAIN_HEAP_GROWTH_MB: 2.0,
  RENDERER_HEAP_GROWTH_MB: 1.5,
} as const;

const ITERATIONS = {
  SEARCH_CYCLES: 30,
  SHOW_HIDE_CYCLES: 40,
  ICON_LOAD_CYCLES: 20,
} as const;

// --js-flags=--expose-gc enables global.gc() in main process
const electronArgs =
  platform() === 'linux' ? ['.', '--no-sandbox', '--js-flags=--expose-gc'] : ['.', '--js-flags=--expose-gc'];

let app: ElectronApplication;
let window: Page;
let cdp: CDPSession;

test.afterEach(async () => {
  if (cdp) await cdp.detach().catch(() => {});
  await app?.close();
});

test.describe.serial('Memory leak detection', () => {
  test.describe.configure({ timeout: 120_000 });

  test('repeated search cycles do not leak', async () => {
    app = await electron.launch({ args: electronArgs });
    window = await app.firstWindow();
    await window.waitForSelector('[data-ready="true"]', { timeout: 10_000 });
    cdp = await window.context().newCDPSession(window);

    const input = window.locator('#search-input');
    const results = window.locator('.results .result-item');

    // Wait for index to be ready
    await expect(async () => {
      await input.fill('a');
      await expect(results.first()).toBeVisible();
    }).toPass({ timeout: 15_000 });
    await input.fill('');

    // Warmup: populate caches, JIT compile hot paths
    const warmupQueries = ['s', 'set', 're', 'dev', 'fi', 'te', 'cal', 'vi'];
    for (const q of warmupQueries) {
      await input.fill(q);
      await expect(results.first()).toBeVisible({ timeout: 1000 });
      await input.fill('');
    }
    for (const q of warmupQueries) {
      await input.fill(q);
      await expect(results.first()).toBeVisible({ timeout: 500 });
      await input.fill('');
    }

    // Baseline after warmup + GC
    const snapshots: MemorySnapshot[] = [];
    const baseline = await measureAfterGC(app, cdp, 'baseline');
    snapshots.push(baseline);

    // Stress: 60 search cycles (2 x 30)
    const queries = ['s', 'set', 're', 'dev', 'fi', 'te', 'a', 'b'];
    for (let i = 0; i < ITERATIONS.SEARCH_CYCLES; i++) {
      await input.fill(queries[i % queries.length]);
      await expect(results.first()).toBeVisible({ timeout: 500 });
      await input.fill('');
    }

    const mid = await measureAfterGC(app, cdp, `mid (${ITERATIONS.SEARCH_CYCLES})`);
    snapshots.push(mid);

    for (let i = 0; i < ITERATIONS.SEARCH_CYCLES; i++) {
      await input.fill(queries[i % queries.length]);
      await expect(results.first()).toBeVisible({ timeout: 500 });
      await input.fill('');
    }

    const final_ = await measureAfterGC(app, cdp, 'final');
    snapshots.push(final_);

    // Analysis
    printSnapshots(snapshots);
    const growth = heapGrowth(baseline, final_);
    console.log(`  Growth: main=${growth.mainMB.toFixed(2)} MB, renderer=${growth.rendererMB.toFixed(2)} MB`);

    expect(
      growth.mainMB,
      `Main heap grew ${growth.mainMB.toFixed(2)} MB over ${ITERATIONS.SEARCH_CYCLES * 2} search cycles (limit: ${LEAK_THRESHOLD.MAIN_HEAP_GROWTH_MB} MB)`,
    ).toBeLessThan(LEAK_THRESHOLD.MAIN_HEAP_GROWTH_MB);

    expect(
      growth.rendererMB,
      `Renderer heap grew ${growth.rendererMB.toFixed(2)} MB over ${ITERATIONS.SEARCH_CYCLES * 2} search cycles (limit: ${LEAK_THRESHOLD.RENDERER_HEAP_GROWTH_MB} MB)`,
    ).toBeLessThan(LEAK_THRESHOLD.RENDERER_HEAP_GROWTH_MB);
  });

  test('repeated show/hide cycles do not leak', async () => {
    app = await electron.launch({ args: electronArgs });
    window = await app.firstWindow();
    await window.waitForSelector('[data-ready="true"]', { timeout: 10_000 });
    cdp = await window.context().newCDPSession(window);

    const input = window.locator('#search-input');
    const results = window.locator('.results .result-item');

    // Wait for index
    await expect(async () => {
      await input.fill('a');
      await expect(results.first()).toBeVisible();
    }).toPass({ timeout: 15_000 });
    await input.fill('');

    // Warmup show/hide
    for (let i = 0; i < 5; i++) {
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].hide();
      });
      await new Promise(r => setTimeout(r, 50));
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        win.show();
        win.webContents.send('window:show:search');
      });
      await new Promise(r => setTimeout(r, 50));
    }

    const snapshots: MemorySnapshot[] = [];
    const baseline = await measureAfterGC(app, cdp, 'baseline');
    snapshots.push(baseline);

    // Stress: hide → show → type → clear, repeat
    for (let i = 0; i < ITERATIONS.SHOW_HIDE_CYCLES; i++) {
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].hide();
      });
      await new Promise(r => setTimeout(r, 30));
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        win.show();
        win.webContents.send('window:show:search');
      });
      await new Promise(r => setTimeout(r, 30));
      await input.fill('s');
      await new Promise(r => setTimeout(r, 20));
      await input.fill('');
    }

    const final_ = await measureAfterGC(app, cdp, 'final');
    snapshots.push(final_);

    printSnapshots(snapshots);
    const growth = heapGrowth(baseline, final_);
    console.log(`  Growth: main=${growth.mainMB.toFixed(2)} MB, renderer=${growth.rendererMB.toFixed(2)} MB`);

    expect(
      growth.mainMB,
      `Main heap grew ${growth.mainMB.toFixed(2)} MB over ${ITERATIONS.SHOW_HIDE_CYCLES} show/hide cycles (limit: ${LEAK_THRESHOLD.MAIN_HEAP_GROWTH_MB} MB)`,
    ).toBeLessThan(LEAK_THRESHOLD.MAIN_HEAP_GROWTH_MB);

    expect(
      growth.rendererMB,
      `Renderer heap grew ${growth.rendererMB.toFixed(2)} MB over ${ITERATIONS.SHOW_HIDE_CYCLES} show/hide cycles (limit: ${LEAK_THRESHOLD.RENDERER_HEAP_GROWTH_MB} MB)`,
    ).toBeLessThan(LEAK_THRESHOLD.RENDERER_HEAP_GROWTH_MB);
  });

  test('repeated icon loading does not leak beyond cache', async () => {
    app = await electron.launch({ args: electronArgs });
    window = await app.firstWindow();
    await window.waitForSelector('[data-ready="true"]', { timeout: 10_000 });
    cdp = await window.context().newCDPSession(window);

    const input = window.locator('#search-input');
    const results = window.locator('.results .result-item');

    // Wait for index
    await expect(async () => {
      await input.fill('a');
      await expect(results.first()).toBeVisible();
    }).toPass({ timeout: 15_000 });
    await input.fill('');

    // Warmup: trigger icon loading for diverse queries
    const iconQueries = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 's', 't', 'v'];
    for (const q of iconQueries) {
      await input.fill(q);
      await expect(results.first()).toBeVisible({ timeout: 1000 });
      await new Promise(r => setTimeout(r, 300));
      await input.fill('');
    }
    // Second pass to ensure all icons are cached
    for (const q of iconQueries) {
      await input.fill(q);
      await expect(results.first()).toBeVisible({ timeout: 500 });
      await new Promise(r => setTimeout(r, 200));
      await input.fill('');
    }

    // Baseline: all icons cached
    const snapshots: MemorySnapshot[] = [];
    const baseline = await measureAfterGC(app, cdp, 'baseline (cache warm)');
    snapshots.push(baseline);

    // Stress: repeat cached queries many times
    for (let i = 0; i < ITERATIONS.ICON_LOAD_CYCLES; i++) {
      for (const q of iconQueries.slice(0, 5)) {
        await input.fill(q);
        await expect(results.first()).toBeVisible({ timeout: 500 });
        await input.fill('');
      }
    }

    const final_ = await measureAfterGC(app, cdp, 'final');
    snapshots.push(final_);

    // Log app-level process metrics for diagnostics
    const metrics = await app.evaluate(({ app: electronApp }) =>
      electronApp.getAppMetrics().map((m: any) => ({
        type: m.type,
        memoryMB: (m.memory.workingSetSize / 1024).toFixed(1),
      })),
    );
    console.log('  App Metrics:', JSON.stringify(metrics));

    printSnapshots(snapshots);
    const growth = heapGrowth(baseline, final_);
    console.log(`  Growth: main=${growth.mainMB.toFixed(2)} MB, renderer=${growth.rendererMB.toFixed(2)} MB`);

    expect(
      growth.mainMB,
      `Main heap grew ${growth.mainMB.toFixed(2)} MB during ${ITERATIONS.ICON_LOAD_CYCLES} icon reload cycles (limit: ${LEAK_THRESHOLD.MAIN_HEAP_GROWTH_MB} MB)`,
    ).toBeLessThan(LEAK_THRESHOLD.MAIN_HEAP_GROWTH_MB);

    expect(
      growth.rendererMB,
      `Renderer heap grew ${growth.rendererMB.toFixed(2)} MB during ${ITERATIONS.ICON_LOAD_CYCLES} icon reload cycles (limit: ${LEAK_THRESHOLD.RENDERER_HEAP_GROWTH_MB} MB)`,
    ).toBeLessThan(LEAK_THRESHOLD.RENDERER_HEAP_GROWTH_MB);
  });
});
