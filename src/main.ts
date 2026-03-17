import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  nativeImage,
  shell,
  Tray,
  Menu,
  screen,
} from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
import { localEngine } from './main/search-engine';
import { execute, registerCallback } from './main/actions';
import { loadIcon } from './main/providers/apps';
import { websearch } from './main/providers/websearch';
import { credentials } from './main/credentials';
import { initHistory, recordSelection, recordSeen } from './main/providers/history';
import { getFavicon, prefetchFavicons } from './main/favicon-cache';

const PANEL_WIDTH = 490;
const PANEL_MAX_HEIGHT = 380;
const EDGE_PAD = 16;
const TOP_PAD = 12;
const isMac = process.platform === 'darwin';

let tray: Tray | null = null;
let win: BrowserWindow | null = null;

const icon = nativeImage.createFromDataURL(
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAACTSURBVHgBpZKBCYAgEEV/TeAIjuIIbdQIuUGt0CS1gW1iZ2jIVaTnhw+Cvs8/OYDJA4Y8kR3ZR2/kmazxJbpUEfQ/Dm/UG7wVwHkjlQdMFfDdJMFaACebnjJGyDWgcnZu1/lrCrl6NCoEHJBrDwEr5NrT6ko/UV8xdLAC2N49mlc5CylpYh8wCwqrvbBGLoKGvz8Bfq0QPWEUo/EAAAAASUVORK5CYII=',
);

const mainStartTime = Date.now();
const isDev = process.env.NODE_ENV === 'development';

const gotLock = app.requestSingleInstanceLock();

const createWindow = () => {
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
    return win;
  }

  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, y, width } = display.workArea;

  win = new BrowserWindow({
    width: PANEL_WIDTH,
    height: PANEL_MAX_HEIGHT,
    x: x + width - PANEL_WIDTH - EDGE_PAD,
    y: y + TOP_PAD,
    show: false,
    frame: false,
    transparent: true,

    // transparent: isMac,
    // backgroundColor: isMac ? '#00000000' : nativeTheme.shouldUseDarkColors ? '#1e1e20' : '#f5f5f7',
    // ...(isMac ? { vibrancy: 'fullscreen-ui' as const } : {}),

    alwaysOnTop: true,
    skipTaskbar: true,
    movable: false,
    resizable: false,
    hasShadow: false,
    roundedCorners: true,
    webPreferences: {
      contextIsolation: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: join(__dirname, 'preload.js'),
    },
  });

  if (process.platform === 'darwin') {
    app.dock?.hide();
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  win.loadFile(join(__dirname, 'index.html'));

  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  win.on('blur', () => {
    win?.hide();
  });

  win.on('closed', () => {
    win = null;
  });

  win.once('ready-to-show', () => {
    win?.show();
    win?.focus();
    localEngine.buildIndexes();
  });

  return win;
};

const toggleWindow = () => {
  if (!win || win.isDestroyed()) {
    createWindow();
    return;
  }
  if (win.isVisible()) {
    win.hide();
    return;
  }
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, y, width } = display.workArea;

  win.setPosition(x + width - PANEL_WIDTH - EDGE_PAD, y + TOP_PAD, false);
  win.show();
  win.webContents.send('window:show:search');
  win.focus();
};

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Focus existing window when second instance attempted
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    } else {
      createWindow();
    }
  });

  app.whenReady().then(() => {
    tray = new Tray(icon);
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show/Hide', click: () => toggleWindow() },
      { label: 'Quit', role: 'quit' },
    ]);
    tray.setContextMenu(contextMenu);

    ipcMain.handle('env:is-dev', () => isDev);
    ipcMain.handle('perf:get-start-time', () => mainStartTime);
    let lastSearchSeq = 0;
    let lastSuggestSeq = 0;

    ipcMain.handle('search:query', async (_e, { type, query, seq }) => {
      try {
        if (type === 'web') {
          if (seq != null) lastSearchSeq = seq;
          const raw = await websearch?.search(query);

          if (seq != null && seq !== lastSearchSeq) return [];
          if (!raw?.length) return [];
          const results = raw.map((r, i) => {
            let host = r.url;
            try {
              host = new URL(r.url).hostname;
            } catch {}
            return {
              id: `web:${r.url}`,
              icon: '🌐',
              title: r.title,
              subtitle: r.snippet || host,
              score: 100 - i,
              category: 'web' as const,
            };
          });
          recordSeen(query, results);
          prefetchFavicons(raw.map(r => r.url));
          return results;
        }
        return await localEngine.search(type, query);
      } catch (err) {
        console.warn('[search] query error:', (err as Error).message);
        return [];
      }
    });
    let suggestTimer: ReturnType<typeof setTimeout> | null = null;
    let suggestPrev: ((v: string[]) => void) | null = null;

    ipcMain.handle('search:suggest', (_e, query: string, seq?: number) => {
      if (seq != null) lastSuggestSeq = seq;
      if (suggestTimer) {
        clearTimeout(suggestTimer);
        suggestPrev?.([]);
      }
      return new Promise<string[]>(resolve => {
        suggestPrev = resolve;
        suggestTimer = setTimeout(async () => {
          suggestTimer = null;
          suggestPrev = null;
          try {
            const results = (await websearch?.suggest(query)) ?? [];
            resolve(seq != null && seq !== lastSuggestSeq ? [] : results);
          } catch {
            resolve([]);
          }
        }, 200);
      });
    });
    ipcMain.handle('apps:icon', (_e, id: string) => loadIcon(id));
    ipcMain.handle('favicon:get', (_e, url: string) => getFavicon(url));
    ipcMain.handle('chat:ask', (_e, _msg: string, _opts: unknown) => ({ id: '', response: '' }));
    ipcMain.handle('chat:ephemeral', (_e, _msg: string, _opts: unknown) => ({ response: '' }));
    ipcMain.handle('chat:reply', (_e, _id: string, _msg: string) => ({ response: '' }));
    ipcMain.handle('chat:remove-chat', (_e, _id: string) => true);
    ipcMain.handle('chat:get-history', () => []);
    ipcMain.handle('chat:clear-history', () => true);
    // Execute
    ipcMain.handle(
      'execute:command',
      async (_e, id: string, query?: string, result?: import('./main/search-results').SearchResult) => {
        if (query && result) recordSelection(query, result);

        if (id.startsWith('web:')) {
          await shell.openExternal(id.slice(4));
          return true;
        }
        return execute(id);
      },
    );
    ipcMain.handle('execute:action', (_e, action: string, query: string) => {
      console.log('Executing action:', action, 'with query:', query);
      switch (action) {
        case 'note': {
        }
        case 'web': {
          // browserManager.createSearchTab(query, false);
          return websearch?.search(query);
        }
        case 'chat': {
        }
      }
    });

    ipcMain.handle('window:set-ignore-mouse', (_e, ignore: boolean) => {
      win?.setIgnoreMouseEvents(ignore, { forward: true });
    });

    ipcMain.handle('window:hide', () => {
      win?.hide();
    });

    credentials.init();
    initHistory();
    ipcMain.handle('auth:list', () => credentials.list());
    ipcMain.handle('auth:get', (_e, id: string, pin?: string) => credentials.get(id, pin));
    ipcMain.handle('auth:store', (_e, name: string, endpoint: string, data: Record<string, unknown>, pin?: string) =>
      credentials.store(name, endpoint, data, pin),
    );
    ipcMain.handle('auth:remove', (_e, id: string) => credentials.remove(id));
    ipcMain.handle('auth:clear', () => credentials.clear());

    globalShortcut.register('CommandOrControl+Space', () => toggleWindow());

    createWindow();
  });
}

registerCallback('app:quit', () => app.quit());
registerCallback('window:reload', () => win?.reload());
registerCallback('devtools:toggle', () => win?.webContents.toggleDevTools());
registerCallback('settings:open', () => {
  // TODO: implement settings window
  console.log('Settings requested');
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  websearch?.destroy();
});

app.on('window-all-closed', () => {
  // prevent quit on macOS
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!win || win.isDestroyed()) createWindow();
});
