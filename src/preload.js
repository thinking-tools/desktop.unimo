const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  search: {
    query: query => ipcRenderer.invoke('search:query', query),
  },
  execute: {
    command: id => ipcRenderer.invoke('execute:command', id),
  },
  window: {
    hide: () => ipcRenderer.invoke('window:hide'),
    show: () => ipcRenderer.invoke('window:show'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  },
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
