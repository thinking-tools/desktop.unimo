const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  search: {
    query: query => ipcRenderer.invoke('search:query', query),
    web: query => ipcRenderer.invoke('search:web', query),
    history: query => ipcRenderer.invoke('search:history', query),
  },
  apps: {
    getIcon: id => ipcRenderer.invoke('apps:icon', id),
  },
  chat: {
    ask: (message, options) => ipcRenderer.invoke('chat:ask', message, options),
    askEphemeral: (message, options) => ipcRenderer.invoke('chat:ephemeral', message, options),
    reply: (id, message) => ipcRenderer.invoke('chat:reply', id, message),
    removeChat: id => ipcRenderer.invoke('chat:remove-chat', id),
    getHistory: () => ipcRenderer.invoke('chat:get-history'),
    clearHistory: () => ipcRenderer.invoke('chat:clear-history'),
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
