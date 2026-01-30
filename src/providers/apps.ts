// providers/apps.ts
import { SearchProvider, SearchResult } from '../search-results';
import { registerBatch } from '../actions';
import { getInstalledApps } from 'get-installed-apps';
import { app, nativeImage } from 'electron';
import { existsSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

const execAsync = promisify(exec);

interface AppEntry {
  id: string;
  name: string;
  nameLower: string;
  path: string;
  icon?: string;
}

let cache: AppEntry[] = [];
let ready = false;
const iconCache = new Map<string, string>();

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

// macOS: extract icon from .app bundle
const extractMacIcon = async (appPath: string): Promise<string | null> => {
  try {
    const plistPath = join(appPath, 'Contents', 'Info.plist');
    if (!existsSync(plistPath)) return null;

    const { stdout } = await execAsync(`plutil -convert json -o - "${plistPath}"`);
    const plist = JSON.parse(stdout);

    let iconName = plist.CFBundleIconFile || plist.CFBundleIconName || 'AppIcon';
    if (!iconName.endsWith('.icns')) iconName += '.icns';

    const iconPath = join(appPath, 'Contents', 'Resources', iconName);
    if (!existsSync(iconPath)) return null;

    // Convert icns to png using sips
    const tmpPng = join(tmpdir(), `${randomUUID()}.png`);
    await execAsync(`sips -s format png -z 32 32 "${iconPath}" --out "${tmpPng}" 2>/dev/null`);

    if (existsSync(tmpPng)) {
      const data = readFileSync(tmpPng);
      const base64 = `data:image/png;base64,${data.toString('base64')}`;
      // Cleanup async, don't await
      execAsync(`rm "${tmpPng}"`).catch(() => {});
      return base64;
    }
  } catch {}
  return null;
};

// Windows: extract icon using nativeImage
const extractWinIcon = async (exePath: string): Promise<string | null> => {
  try {
    if (!exePath || !existsSync(exePath)) return null;

    // Use Electron's nativeImage to extract icon
    const icon = await app.getFileIcon(exePath, { size: 'normal' });
    const png = icon.toPNG();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {}
  return null;
};

// Linux: try to find icon from desktop file or icon theme
const extractLinuxIcon = async (appData: any): Promise<string | null> => {
  try {
    const iconName = appData.Icon;
    if (!iconName) return null;

    // If it's an absolute path
    if (iconName.startsWith('/') && existsSync(iconName)) {
      const data = readFileSync(iconName);
      const ext = iconName.endsWith('.svg') ? 'svg+xml' : 'png';
      return `data:image/${ext};base64,${data.toString('base64')}`;
    }

    // Search common icon paths
    const sizes = ['48x48', '32x32', '64x64', '128x128', 'scalable'];
    const themes = ['/usr/share/icons/hicolor', '/usr/share/pixmaps'];
    const exts = ['.png', '.svg'];

    for (const theme of themes) {
      for (const size of sizes) {
        for (const ext of exts) {
          const category = size === 'scalable' ? 'scalable/apps' : `${size}/apps`;
          const iconPath = join(theme, category, `${iconName}${ext}`);
          if (existsSync(iconPath)) {
            const data = readFileSync(iconPath);
            const mime = ext === '.svg' ? 'svg+xml' : 'png';
            return `data:image/${mime};base64,${data.toString('base64')}`;
          }
        }
      }
    }
  } catch {}
  return null;
};

// Lazy icon loading - called per result when displayed
const loadIcon = async (id: string): Promise<string | null> => {
  if (iconCache.has(id)) return iconCache.get(id) || null;

  const entry = cache.find(a => a.id === id);
  if (!entry) return null;

  let icon: string | null = null;

  if (isMac) {
    icon = await extractMacIcon(entry.path);
  } else if (isWin) {
    icon = await extractWinIcon(entry.path);
  }

  if (icon) {
    iconCache.set(id, icon);
    entry.icon = icon;
  }

  return icon;
};

// Batch preload icons in background
const preloadIcons = async () => {
  const BATCH_SIZE = 5;
  const DELAY = 50;

  for (let i = 0; i < cache.length; i += BATCH_SIZE) {
    const batch = cache.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(a => loadIcon(a.id)));
    await new Promise(r => setTimeout(r, DELAY));
  }
  console.log(`[apps] Preloaded ${iconCache.size} icons`);
};

const resolveMacAppPath = (appData: any): string | null => {
  const appFileName = appData.kMDItemFSName || appData._kMDItemDisplayNameWithExtensions;
  if (!appFileName) return null;

  const searchDirs = [
    '/Applications',
    '/System/Applications',
    join(app.getPath('home'), 'Applications'),
    '/System/Applications/Utilities',
  ];

  for (const dir of searchDirs) {
    const fullPath = join(dir, appFileName);
    if (existsSync(fullPath)) return fullPath;
  }
  return null;
};

const resolveWinAppPath = (appData: any): string | null => {
  const displayIcon = appData.DisplayIcon;
  if (displayIcon) {
    const exePath = displayIcon.split(',')[0].replace(/"/g, '');
    if (exePath.endsWith('.exe') && existsSync(exePath)) return exePath;
  }

  const installLoc = appData.InstallLocation;
  if (installLoc) {
    const baseName = appData.appName?.replace(/[^a-zA-Z0-9]/g, '') || '';
    const candidates = [`${baseName}.exe`, `${baseName.toLowerCase()}.exe`, 'app.exe'];

    for (const exe of candidates) {
      const fullPath = join(installLoc, exe);
      if (existsSync(fullPath)) return fullPath;
    }
    return installLoc;
  }
  return null;
};

const resolvePath = (appData: any): string | null => {
  if (isMac) return resolveMacAppPath(appData);
  if (isWin) return resolveWinAppPath(appData);
  return appData.appInstallPath || appData.appExecutePath || null;
};

const buildIndex = async (): Promise<void> => {
  try {
    const apps = (await getInstalledApps()) as any[];
    const seen = new Set<string>();

    cache = apps
      .map((a: any) => {
        const name = a.appName?.trim();
        if (!name) return null;

        const lower = name.toLowerCase();
        if (seen.has(lower)) return null;
        if (lower.includes('uninstall') || lower.includes('helper') || lower.includes('updater')) return null;

        const path = resolvePath(a);
        if (!path) return null;

        seen.add(lower);

        return {
          id: `app:${a.appIdentifier || lower.replace(/\s+/g, '-')}`,
          name,
          nameLower: lower,
          path,
        } as AppEntry;
      })
      .filter((a): a is AppEntry => a !== null);

    registerBatch(cache.map(a => [a.id, { type: 'app:launch' as const, payload: a.path }]));

    ready = true;
    console.log(`[apps] Indexed ${cache.length} apps`);

    // Preload icons in background after index is ready
    preloadIcons();
  } catch (e) {
    console.error('[apps] Index failed:', e);
    cache = [];
    ready = true;
  }
};

export const appsProvider: SearchProvider = {
  name: 'apps',
  priority: 100,

  search(query: string): SearchResult[] {
    if (!ready) return [];
    const q = query.toLowerCase();
    if (!q) return cache.slice(0, 6).map(a => toResult(a, 0.5));

    const scored: { app: AppEntry; score: number }[] = [];

    for (const a of cache) {
      let score = 0;
      if (a.nameLower === q) score = 1;
      else if (a.nameLower.startsWith(q)) score = 0.95;
      else if (a.nameLower.includes(q)) score = 0.7;
      else {
        let qi = 0;
        for (const c of a.nameLower) {
          if (c === q[qi]) qi++;
          if (qi === q.length) break;
        }
        if (qi === q.length) score = 0.4 * (q.length / a.nameLower.length);
      }
      if (score > 0) scored.push({ app: a, score });
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(r => toResult(r.app, r.score));
  },
};

const toResult = (a: AppEntry, score: number): SearchResult => ({
  id: a.id,
  icon: a.icon || '📦',
  title: a.name,
  subtitle: a.path,
  score,
  category: 'app',
});

export const refreshApps = () => buildIndex();
export { loadIcon };
