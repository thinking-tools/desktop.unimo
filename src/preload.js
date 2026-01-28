const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronPerf", {
  getStartTime: () => ipcRenderer.invoke("perf:get-start-time"),
});
