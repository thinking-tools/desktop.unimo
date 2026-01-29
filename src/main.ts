import { app, BrowserWindow, globalShortcut, ipcMain, nativeImage, Tray, Menu, screen } from 'electron';
import { join } from 'path';
import { search } from './search';

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

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  win = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
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
    win.show();
    win.focus();
  }
};

app.whenReady().then(() => {
  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show/Hide', click: toggleWindow },
    { label: 'Quit', role: 'quit' },
  ]);
  tray.setContextMenu(contextMenu);

  ipcMain.handle('env:is-dev', () => isDev);
  ipcMain.handle('perf:get-start-time', () => mainStartTime);
  ipcMain.handle('search:query', (_event, query: string) => search(query));
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
