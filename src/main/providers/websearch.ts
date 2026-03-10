// websearch.ts – persistent WebSocket to Cloudflare search gateway
import WebSocket from 'ws';

export interface SearchResult {
  url: string;
  title: string;
  snippet?: string;
  published?: Date;
  thumbnailUrl?: string;
}

interface PendingRequest {
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const WS_ENDPOINT = process.env.SEARCH_WS_ENDPOINT || '';
const WS_TOKEN = process.env.SEARCH_GATEWAY_TOKEN || '';
const REQUEST_TIMEOUT = 8_000;
const RECONNECT_BASE = 500;
const RECONNECT_MAX = 30_000;
const CONNECT_TIMEOUT = 5_000;

export class WebSearch {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private ready = false;
  private connectPromise: Promise<void> | null = null;
  private reconnectDelay = RECONNECT_BASE;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private idCounter = 0;

  constructor(
    private readonly endpoint: string,
    private readonly token: string,
  ) {
    if (endpoint) this.connect().catch(() => {});
  }

  private nextId(): string {
    return String(++this.idCounter);
  }

  private connect(): Promise<void> {
    if (this.connectPromise) return this.connectPromise;
    if (this.destroyed) return Promise.reject(new Error('WebSearch destroyed'));

    this.connectPromise = new Promise<void>((resolve, reject) => {
      const sep = this.endpoint.includes('?') ? '&' : '?';
      const url = `${this.endpoint}${sep}token=${encodeURIComponent(this.token)}`;
      console.log('[ws] connecting to', url.replace(/token=[^&]+/, 'token=***'));
      const ws = new WebSocket(url);
      this.ws = ws;
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          if (ws.readyState === WebSocket.OPEN) {
            console.log('[ws] no ready msg after', CONNECT_TIMEOUT, 'ms, proceeding anyway');
            this.ready = true;
            this.reconnectDelay = RECONNECT_BASE;
            resolve();
          } else {
            console.log('[ws] connect timeout after', CONNECT_TIMEOUT, 'ms, readyState=', ws.readyState);
            reject(new Error('WS connect timeout'));
            try {
              ws.close();
            } catch {}
          }
        }
      }, CONNECT_TIMEOUT);

      ws.addEventListener('open', () => {
        console.log('[ws] socket opened, waiting for ready');
      });

      ws.addEventListener('message', evt => {
        const raw = typeof evt.data === 'string' ? evt.data : String(evt.data);
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(raw);
        } catch {
          return;
        }

        if (msg.type === 'ready') {
          if (!settled) {
            clearTimeout(timeout);
            settled = true;
            this.ready = true;
            this.reconnectDelay = RECONNECT_BASE;
            resolve();
          }
          return;
        }

        if (msg.type === 'error' && msg.id && !this.pending.has(msg.id as string)) {
          console.error('[ws] server error:', msg.error);
          return;
        }

        this.handleResponse(msg);
      });

      ws.addEventListener('close', evt => {
        console.log('[ws] closed, code:', evt.code, 'reason:', evt.reason, 'settled:', settled);
        clearTimeout(timeout);
        if (!settled) {
          settled = true;
          reject(new Error('WS closed before ready'));
        }
        this.onDisconnect();
      });

      ws.addEventListener('error', evt => {
        console.error('[ws] error event:', (evt as any).message || evt);
      });
    });

    return this.connectPromise;
  }

  private handleResponse(msg: Record<string, unknown>) {
    const p = this.pending.get(msg.id as string);
    if (!p) return;
    this.pending.delete(msg.id as string);
    clearTimeout(p.timer);

    if (msg.type === 'error') {
      p.reject(new Error(msg.error as string));
    } else if (msg.type === 'results') {
      p.resolve(this.mapResults(msg.data));
    } else if (msg.type === 'suggestions') {
      p.resolve((msg.suggestions as string[]) ?? []);
    }
  }

  private mapResults(data: any): SearchResult[] {
    const results = data?.web?.results ?? data?.results ?? (Array.isArray(data) ? data : []);
    if (!Array.isArray(results)) return [];

    return results
      .filter((r: any) => r.url && r.title)
      .map((r: any) => ({
        url: r.url,
        title: r.title,
        snippet: r.description ?? r.snippet,
        published: r.page_age ? new Date(r.page_age) : undefined,
        thumbnailUrl: r.thumbnail?.src ?? r.thumbnail?.url,
      }));
  }

  private onDisconnect() {
    this.ready = false;
    this.connectPromise = null;
    this.ws = null;

    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error('Disconnected'));
    }
    this.pending.clear();

    if (!this.destroyed) this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {});
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX);
  }

  private ensureConnected(): Promise<void> {
    if (this.ready && this.ws?.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    return this.connect();
  }

  async search(query: string, limit = 12): Promise<SearchResult[]> {
    if (!this.endpoint) return [];
    await this.ensureConnected();

    const id = this.nextId();

    return new Promise<SearchResult[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Search timeout'));
      }, REQUEST_TIMEOUT);

      this.pending.set(id, {
        resolve: resolve as (data: unknown) => void,
        reject,
        timer,
      });

      this.ws!.send(
        JSON.stringify({
          type: 'search',
          id,
          query,
          params: { count: String(limit) },
        }),
      );
    });
  }

  async suggest(query: string): Promise<string[]> {
    if (!this.endpoint || !query.trim()) return [];
    await this.ensureConnected();

    const id = this.nextId();
    const SUGGEST_TIMEOUT = 3_000;

    return new Promise<string[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve([]);
      }, SUGGEST_TIMEOUT);

      this.pending.set(id, {
        resolve: resolve as (data: unknown) => void,
        reject,
        timer,
      });

      this.ws!.send(JSON.stringify({ type: 'typing', id, query }));
    });
  }

  destroy() {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.connectPromise = null;
    this.ready = false;

    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error('Destroyed'));
    }
    this.pending.clear();

    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }
}

export const websearch = WS_ENDPOINT ? new WebSearch(WS_ENDPOINT, WS_TOKEN) : null;
