const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  perf: {
    getStartTime: () => ipcRenderer.invoke('perf:get-start-time'),
  },
  env: {
    isDev: () => ipcRenderer.invoke('env:is-dev'),
  },
  auth: {
    check: () => ipcRenderer.invoke('auth:check'),
    getCredentials: () => ipcRenderer.invoke('auth:get-credentials'),
    storeCredentials: data => ipcRenderer.invoke('auth:store-credentials', data),
    clear: () => ipcRenderer.invoke('auth:clear'),
  },
});
