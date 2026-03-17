// favicon-cache.ts — persistent favicon cache for web results
import { net } from 'electron';
import Store from 'electron-store';

interface FaviconStore {
  icons: Record<string, string>; // hostname → data:image/png;base64,...
}

const FETCH_TIMEOUT = 4_000;

const store = new Store<FaviconStore>({
  name: 'favicons',
  defaults: { icons: {} },
});

const mem = new Map<string, string>(Object.entries(store.get('icons')));
const inflight = new Map<string, Promise<string | null>>();

const persist = () => store.set('icons', Object.fromEntries(mem));

const hostFromUrl = (url: string): string | null => {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
  } catch {
    return null;
  }
};

const fetchFavicon = async (hostname: string): Promise<string | null> => {
  // DuckDuckGo favicon service — no tracking, no API key, returns ICO/PNG
  const url = `https://icons.duckduckgo.com/ip3/${encodeURIComponent(hostname)}.ico`;
  try {
    const resp = await net.fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!resp.ok) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length < 100) return null; // skip blank/default placeholders
    const mime = resp.headers.get('content-type') ?? 'image/x-icon';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
};

/** Get favicon data URI for a URL. Returns cached or fetches. */
export const getFavicon = (url: string): Promise<string | null> => {
  const host = hostFromUrl(url);
  if (!host) return Promise.resolve(null);

  const cached = mem.get(host);
  if (cached) return Promise.resolve(cached);

  // deduplicate concurrent requests for same host
  const existing = inflight.get(host);
  if (existing) return existing;

  const p = fetchFavicon(host).then(dataUri => {
    inflight.delete(host);
    if (dataUri) {
      mem.set(host, dataUri);
      persist();
    }
    return dataUri;
  });

  inflight.set(host, p);
  return p;
};

/** Prefetch favicons for a batch of URLs (fire-and-forget). */
export const prefetchFavicons = (urls: string[]): void => {
  for (const url of urls) getFavicon(url);
};
