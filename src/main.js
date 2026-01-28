// main.js
const { app, BrowserWindow, screen, ipcMain } = require("electron");

const mainStartTime = Date.now();

app.whenReady().then(() => {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      preload: require("path").join(__dirname, "preload.js"),
    },
  });
  win.loadFile("src/index.html");
  ipcMain.handle("perf:get-start-time", () => mainStartTime);
  win.once("ready-to-show", () => win.show());
});
