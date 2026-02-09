// tests/e2e/helpers/memory.ts
import type { ElectronApplication, CDPSession } from '@playwright/test';

export interface MemorySnapshot {
  mainHeapUsedMB: number;
  mainHeapTotalMB: number;
  mainRssMB: number;
  rendererHeapUsedMB: number;
  rendererHeapTotalMB: number;
  timestamp: number;
  label: string;
}

const MB = 1024 * 1024;

/**
 * Force GC in main process (requires --js-flags=--expose-gc)
 * and renderer process (via CDP), then wait for stabilization.
 * Double-pass: first GC collects objects, finalizers may free more,
 * second pass collects those.
 */
export async function forceGC(app: ElectronApplication, cdp: CDPSession): Promise<void> {
  await app.evaluate(() => {
    if (typeof global.gc === 'function') global.gc();
  });
  await cdp.send('HeapProfiler.collectGarbage');
  await new Promise(r => setTimeout(r, 200));

  await app.evaluate(() => {
    if (typeof global.gc === 'function') global.gc();
  });
  await cdp.send('HeapProfiler.collectGarbage');
  await new Promise(r => setTimeout(r, 100));
}

/**
 * Capture memory metrics from both main and renderer processes.
 */
export async function takeSnapshot(
  app: ElectronApplication,
  cdp: CDPSession,
  label: string,
): Promise<MemorySnapshot> {
  const mainMem = await app.evaluate(() => {
    const m = process.memoryUsage();
    return { heapUsed: m.heapUsed, heapTotal: m.heapTotal, rss: m.rss };
  });

  const rendererMem: { usedSize: number; totalSize: number } =
    await cdp.send('Runtime.getHeapUsage');

  return {
    mainHeapUsedMB: mainMem.heapUsed / MB,
    mainHeapTotalMB: mainMem.heapTotal / MB,
    mainRssMB: mainMem.rss / MB,
    rendererHeapUsedMB: rendererMem.usedSize / MB,
    rendererHeapTotalMB: rendererMem.totalSize / MB,
    timestamp: Date.now(),
    label,
  };
}

/**
 * Force GC, then take a snapshot. Standard "clean measurement" call.
 */
export async function measureAfterGC(
  app: ElectronApplication,
  cdp: CDPSession,
  label: string,
): Promise<MemorySnapshot> {
  await forceGC(app, cdp);
  return takeSnapshot(app, cdp, label);
}

/**
 * Compute heap growth between two snapshots.
 */
export function heapGrowth(
  before: MemorySnapshot,
  after: MemorySnapshot,
): { mainMB: number; rendererMB: number } {
  return {
    mainMB: after.mainHeapUsedMB - before.mainHeapUsedMB,
    rendererMB: after.rendererHeapUsedMB - before.rendererHeapUsedMB,
  };
}

/**
 * Print a table of snapshots for human-readable CI output.
 */
export function printSnapshots(snapshots: MemorySnapshot[]): void {
  console.log('\n  Memory Snapshots:');
  console.log(
    '  ' +
      'Label'.padEnd(24) +
      'Main Heap'.padEnd(14) +
      'Main RSS'.padEnd(14) +
      'Renderer Heap',
  );
  console.log('  ' + '-'.repeat(65));
  for (const s of snapshots) {
    console.log(
      '  ' +
        s.label.padEnd(24) +
        `${s.mainHeapUsedMB.toFixed(2)} MB`.padEnd(14) +
        `${s.mainRssMB.toFixed(2)} MB`.padEnd(14) +
        `${s.rendererHeapUsedMB.toFixed(2)} MB`,
    );
  }
  console.log('');
}
