// main.ts
import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';

const mainStartTime = Date.now();
const isDev = process.env.NODE_ENV === 'development';

app.whenReady().then(() => {
  const { screen } = require('electron');
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const centerX = (width - 600) / 2;
  const centerY = (height - 300) / 2;
  const win = new BrowserWindow({
    width: 600,
    height: 300,
    x: centerX,
    y: centerY,
    show: false,
    frame: false,
    transparent: !isDev, // disable transparency in dev for better devtools experience
    alwaysOnTop: !isDev,
    skipTaskbar: !isDev,
    webPreferences: {
      contextIsolation: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: join(__dirname, '../src/preload.js'),
    },
  });
  ipcMain.handle('env:is-dev', () => isDev);
  win.loadFile('src/index.html');
  ipcMain.handle('perf:get-start-time', () => mainStartTime);

  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  win.once('ready-to-show', () => win.show());
});
