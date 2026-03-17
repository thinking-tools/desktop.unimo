import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  search: {
    query: (opts: { type: string; query: string; seq?: number }) => ipcRenderer.invoke('search:query', opts),
    suggest: (query: string, seq: number) => ipcRenderer.invoke('search:suggest', query, seq),
  },
  apps: {
    getIcon: (id: string) => ipcRenderer.invoke('apps:icon', id),
  },
  favicon: {
    get: (url: string) => ipcRenderer.invoke('favicon:get', url),
  },
  chat: {
    ask: (message: string, options?: unknown) => ipcRenderer.invoke('chat:ask', message, options),
    askEphemeral: (message: string, options?: unknown) => ipcRenderer.invoke('chat:ephemeral', message, options),
    reply: (id: string, message: string) => ipcRenderer.invoke('chat:reply', id, message),
    removeChat: (id: string) => ipcRenderer.invoke('chat:remove-chat', id),
    getHistory: () => ipcRenderer.invoke('chat:get-history'),
    clearHistory: () => ipcRenderer.invoke('chat:clear-history'),
  },
  execute: {
    command: (id: string, query?: string, result?: unknown) =>
      ipcRenderer.invoke('execute:command', id, query, result),
    action: (action: string, query: string) => ipcRenderer.invoke('execute:action', action, query),
  },
  window: {
    hide: () => ipcRenderer.invoke('window:hide'),
    show: () => ipcRenderer.invoke('window:show:search'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    setIgnoreMouse: (ignore: boolean) => ipcRenderer.invoke('window:set-ignore-mouse', ignore),
    onShowSearch: (cb: (_e: IpcRendererEvent) => void) => ipcRenderer.on('window:show:search', cb),
    onShowWeb: (cb: (_e: IpcRendererEvent) => void) => ipcRenderer.on('window:show:web', cb),
  },
  perf: {
    getStartTime: () => ipcRenderer.invoke('perf:get-start-time'),
  },
  env: {
    isDev: () => ipcRenderer.invoke('env:is-dev'),
  },
  auth: {
    list: () => ipcRenderer.invoke('auth:list'),
    get: (id: string, pin: string) => ipcRenderer.invoke('auth:get', id, pin),
    store: (name: string, endpoint: string, data: unknown, pin: string) =>
      ipcRenderer.invoke('auth:store', name, endpoint, data, pin),
    remove: (id: string) => ipcRenderer.invoke('auth:remove', id),
    clear: () => ipcRenderer.invoke('auth:clear'),
  },
});
