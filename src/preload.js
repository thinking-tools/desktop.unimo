const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  search: {
    query: ({ type, query, seq }) => ipcRenderer.invoke('search:query', { type, query, seq }),
    suggest: (query, seq) => ipcRenderer.invoke('search:suggest', query, seq),
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
    action: (action, query) => ipcRenderer.invoke('execute:action', action, query),
  },
  window: {
    hide: () => ipcRenderer.invoke('window:hide'),
    show: () => ipcRenderer.invoke('window:show:search'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),

    setIgnoreMouse: ignore => ipcRenderer.invoke('window:set-ignore-mouse', ignore),
    onShowSearch: callback => ipcRenderer.on('window:show:search', callback),
    onShowWeb: callback => ipcRenderer.on('window:show:web', callback),
  },
  perf: {
    getStartTime: () => ipcRenderer.invoke('perf:get-start-time'),
  },
  env: {
    isDev: () => ipcRenderer.invoke('env:is-dev'),
  },
  auth: {
    list: () => ipcRenderer.invoke('auth:list'),
    get: (id, pin) => ipcRenderer.invoke('auth:get', id, pin),
    store: (name, endpoint, data, pin) => ipcRenderer.invoke('auth:store', name, endpoint, data, pin),
    remove: id => ipcRenderer.invoke('auth:remove', id),
    clear: () => ipcRenderer.invoke('auth:clear'),
  },
});
