import { app, BrowserWindow, globalShortcut, ipcMain, nativeImage, Tray, Menu, screen } from 'electron';
import { join } from 'path';
import { localEngine } from './search-engine';
import { execute, registerCallback } from './actions';
import { loadIcon } from './providers/apps';

let tray: Tray | null = null;
let win: BrowserWindow | null = null;

const icon = nativeImage.createFromDataURL(
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAACTSURBVHgBpZKBCYAgEEV/TeAIjuIIbdQIuUGt0CS1gW1iZ2jIVaTnhw+Cvs8/OYDJA4Y8kR3ZR2/kmazxJbpUEfQ/Dm/UG7wVwHkjlQdMFfDdJMFaACebnjJGyDWgcnZu1/lrCrl6NCoEHJBrDwEr5NrT6ko/UV8xdLAC2N49mlc5CylpYh8wCwqrvbBGLoKGvz8Bfq0QPWEUo/EAAAAASUVORK5CYII=',
);

const mainStartTime = Date.now();
const isDev = process.env.NODE_ENV === 'development';

const createWindow = () => {
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
    return win;
  }

  const cursor = screen.getCursorScreenPoint();
  const currentDisplay = screen.getDisplayNearestPoint(cursor);
  const { x, y, width, height } = currentDisplay.workArea;

  win = new BrowserWindow({
    width,
    height,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    movable: true,
    resizable: true,
    hasShadow: false,

    webPreferences: {
      contextIsolation: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: join(__dirname, '../src/preload.js'),
    },
  });

  if (process.platform === 'darwin') {
    app.dock?.hide();
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  win.loadFile('src/index.html');

  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  win.on('blur', () => {
    if (!isDev) win?.hide();
  });

  win.on('closed', () => {
    win = null;
  });

  win.once('ready-to-show', () => win?.show());

  return win;
};

const toggleWindow = () => {
  if (!win || win.isDestroyed()) {
    createWindow();
  } else if (win.isVisible()) {
    win.hide();
  } else {
    const cursor = screen.getCursorScreenPoint();
    const currentDisplay = screen.getDisplayNearestPoint(cursor);
    const { x, y, width, height } = currentDisplay.workArea;

    // Set position with animate=false, then size, then show
    win.setPosition(x, y, false);
    win.setSize(width, height, false);
    win.show();
    win.focus();
  }
};

registerCallback('app:quit', () => app.quit());
registerCallback('window:reload', () => win?.reload());
registerCallback('devtools:toggle', () => win?.webContents.toggleDevTools());
registerCallback('settings:open', () => {
  // TODO: implement settings window
  console.log('Settings requested');
});

app.whenReady().then(() => {
  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show/Hide', click: toggleWindow },
    { label: 'Quit', role: 'quit' },
  ]);
  tray.setContextMenu(contextMenu);

  ipcMain.handle('env:is-dev', () => isDev);
  ipcMain.handle('perf:get-start-time', () => mainStartTime);
  ipcMain.handle('search:query', (_e, query: string) => localEngine.search(query));
  ipcMain.handle('search:web', (_e, query: string) => console.warn(query));
  ipcMain.handle('search:history', (_e, _query: string) => []); // TODO: implement
  ipcMain.handle('apps:icon', (_e, id: string) => loadIcon(id));
  ipcMain.handle('chat:ask', (_e, _msg: string, _opts: unknown) => ({ id: '', response: '' }));
  ipcMain.handle('chat:ephemeral', (_e, _msg: string, _opts: unknown) => ({ response: '' }));
  ipcMain.handle('chat:reply', (_e, _id: string, _msg: string) => ({ response: '' }));
  ipcMain.handle('chat:remove-chat', (_e, _id: string) => true);
  ipcMain.handle('chat:get-history', () => []);
  ipcMain.handle('chat:clear-history', () => true);

  // Execute
  ipcMain.handle('execute:command', (_e, id: string) => execute(id));

  ipcMain.handle('window:hide', () => {
    win?.hide();
  });

  globalShortcut.register('CommandOrControl+Space', toggleWindow);

  createWindow();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // prevent quit on macOS
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!win || win.isDestroyed()) createWindow();
});
