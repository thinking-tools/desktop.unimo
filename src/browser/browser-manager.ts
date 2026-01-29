// browser/browser-manager.ts
import { WebContentsView, BrowserWindow, shell } from 'electron';
import { EventEmitter } from 'events';

export interface Tab {
  id: string;
  view: WebContentsView;
  url: string;
  title: string;
  favicon?: string;
  loading: boolean;
}

class BrowserManager extends EventEmitter {
  private tabs = new Map<string, Tab>();
  private activeTabId: string | null = null;
  private hostWindow: BrowserWindow | null = null;
  private idCounter = 0;

  attach(window: BrowserWindow) {
    this.hostWindow = window;
  }

  detach() {
    for (const tab of this.tabs.values()) {
      tab.view.webContents.close();
    }
    this.tabs.clear();
    this.activeTabId = null;
    this.hostWindow = null;
  }

  createSearchTab(query: string, activate = true): string {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    return this.createTab(searchUrl, activate);
  }

  createTab(url: string, activate = true): string {
    if (!this.hostWindow) throw new Error('No host window');
    console.warn('Creating tab for URL:', url);
    const id = `tab-${++this.idCounter}`;

    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
      },
    });

    const tab: Tab = {
      id,
      view,
      url,
      title: url,
      loading: true,
    };

    const wc = view.webContents;

    wc.on('did-start-loading', () => {
      tab.loading = true;
      this.emit('tab-updated', this.serializeTab(tab));
    });

    wc.on('did-stop-loading', () => {
      tab.loading = false;
      this.emit('tab-updated', this.serializeTab(tab));
    });

    wc.on('did-finish-load', () => {
      tab.loading = false;
      this.emit('tab-updated', this.serializeTab(tab));
    });

    wc.on('page-title-updated', (_e, title) => {
      tab.title = title;
      this.emit('tab-updated', this.serializeTab(tab));
    });

    wc.on('page-favicon-updated', (_e, favicons) => {
      tab.favicon = favicons[0];
      this.emit('tab-updated', this.serializeTab(tab));
    });

    wc.on('did-navigate', (_e, newUrl) => {
      tab.url = newUrl;
      this.emit('tab-updated', this.serializeTab(tab));
    });

    wc.on('did-navigate-in-page', (_e, newUrl) => {
      tab.url = newUrl;
      this.emit('tab-updated', this.serializeTab(tab));
    });

    wc.setWindowOpenHandler(({ url }) => {
      this.createTab(url);
      return { action: 'deny' };
    });

    wc.on('will-navigate', (e, navUrl) => {
      try {
        const parsed = new URL(navUrl);
        if (!['http:', 'https:', 'file:'].includes(parsed.protocol)) {
          e.preventDefault();
          shell.openExternal(navUrl);
        }
      } catch {}
    });

    this.tabs.set(id, tab);
    wc.loadURL(url);

    if (activate) this.activateTab(id);

    this.emit('tab-created', this.serializeTab(tab));
    return id;
  }

  closeTab(id: string): boolean {
    const tab = this.tabs.get(id);
    if (!tab || !this.hostWindow) return false;

    this.hostWindow.contentView.removeChildView(tab.view);

    if (this.activeTabId === id) {
      const ids = [...this.tabs.keys()];
      const idx = ids.indexOf(id);
      const nextId = ids[idx + 1] || ids[idx - 1];

      if (nextId) {
        this.activateTab(nextId);
      } else {
        this.activeTabId = null;
      }
    }

    tab.view.webContents.close();
    this.tabs.delete(id);
    this.emit('tab-closed', id);

    return true;
  }

  activateTab(id: string): boolean {
    const tab = this.tabs.get(id);
    if (!tab || !this.hostWindow) return false;

    if (this.activeTabId && this.activeTabId !== id) {
      const prevTab = this.tabs.get(this.activeTabId);
      if (prevTab) {
        prevTab.view.setVisible(false);
      }
    }

    const contentView = this.hostWindow.contentView;
    if (!contentView.children.includes(tab.view)) {
      contentView.addChildView(tab.view);
    }

    tab.view.setVisible(true);
    this.activeTabId = id;
    this.resizeActiveView();
    this.emit('tab-activated', id);

    return true;
  }

  resizeActiveView(bounds?: { x: number; y: number; width: number; height: number }) {
    if (!this.activeTabId || !this.hostWindow) return;

    const tab = this.tabs.get(this.activeTabId);
    if (!tab) return;

    if (bounds) {
      tab.view.setBounds(bounds);
    } else {
      const { width, height } = this.hostWindow.getContentBounds();
      tab.view.setBounds({ x: 0, y: 80, width, height: height - 80 });
    }
  }

  // Navigation - using navigationHistory API
  goBack(id?: string) {
    const tab = this.tabs.get(id || this.activeTabId || '');
    const nav = tab?.view.webContents.navigationHistory;
    if (nav?.canGoBack()) nav.goBack();
  }

  goForward(id?: string) {
    const tab = this.tabs.get(id || this.activeTabId || '');
    const nav = tab?.view.webContents.navigationHistory;
    if (nav?.canGoForward()) nav.goForward();
  }

  reload(id?: string) {
    const tab = this.tabs.get(id || this.activeTabId || '');
    tab?.view.webContents.reload();
  }

  stop(id?: string) {
    const tab = this.tabs.get(id || this.activeTabId || '');
    tab?.view.webContents.stop();
  }

  navigate(url: string, id?: string) {
    const tab = this.tabs.get(id || this.activeTabId || '');
    if (!tab) return;

    if (!/^https?:\/\//i.test(url)) {
      url = /^[a-z0-9-]+\.[a-z]{2,}/i.test(url)
        ? `https://${url}`
        : `https://www.google.com/search?q=${encodeURIComponent(url)}`;
    }

    tab.view.webContents.loadURL(url);
  }

  getTab(id: string) {
    const tab = this.tabs.get(id);
    return tab ? this.serializeTab(tab) : null;
  }

  getTabs() {
    return [...this.tabs.values()].map(t => this.serializeTab(t));
  }

  getActiveTabId() {
    return this.activeTabId;
  }

  private serializeTab(tab: Tab) {
    const nav = tab.view.webContents.navigationHistory;
    return {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      favicon: tab.favicon,
      loading: tab.loading,
      canGoBack: nav?.canGoBack() ?? false,
      canGoForward: nav?.canGoForward() ?? false,
    };
  }
}

export const browserManager = new BrowserManager();
