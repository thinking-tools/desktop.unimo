// providers/history.ts — frecency-based learning from picked results
// Scope: apps, web, urls, commands, files, contacts. NOT notes/SQIP/LLM.
// Data encrypted at rest via safeStorage.
import { safeStorage } from 'electron';
import Store from 'electron-store';
import { SearchProvider, SearchResult } from '../search-results.ts';

interface HistoryEntry {
  query: string;
  resultId: string;
  resultTitle: string;
  resultSubtitle?: string;
  resultIcon: string;
  resultCategory: string;
  count: number;
  lastUsed: number;
  picked?: boolean; // false = seen only, true = user selected it
}

const TRACKABLE: Set<string> = new Set(['app', 'web', 'command', 'file']);
const MAX_ENTRIES = 500;
const DECAY_HALF_LIFE = 7 * 24 * 60 * 60 * 1000; // 7 days

const store = new Store<{ data: string }>({
  name: 'history',
  fileExtension: 'enc',
});

let cache: HistoryEntry[] = [];

const pack = (entries: HistoryEntry[]): string => safeStorage.encryptString(JSON.stringify(entries)).toString('base64');

const unpack = (): HistoryEntry[] => {
  const raw = store.get('data');
  if (!raw) return [];
  try {
    return JSON.parse(safeStorage.decryptString(Buffer.from(raw, 'base64')));
  } catch {
    return [];
  }
};

const persist = () => store.set('data', pack(cache));

const frecency = (e: HistoryEntry): number => {
  const age = Date.now() - e.lastUsed;
  return e.count * Math.pow(0.5, age / DECAY_HALF_LIFE);
};

/** Call once at startup (after app ready / safeStorage available) */
export const initHistory = (): void => {
  cache = unpack();
};

/** Record a user pick. Only tracks categories in TRACKABLE. */
export const recordSelection = (query: string, result: SearchResult): void => {
  const cat = result.category ?? '';
  if (!TRACKABLE.has(cat)) return;

  const q = query.toLowerCase().trim();
  if (!q) return;

  const existing = cache.find(e => e.query === q && e.resultId === result.id);
  if (existing) {
    existing.count++;
    existing.picked = true;
    existing.lastUsed = Date.now();
    existing.resultTitle = result.title;
    existing.resultSubtitle = result.subtitle;
    existing.resultIcon = result.icon;
  } else {
    cache.push({
      query: q,
      resultId: result.id,
      resultTitle: result.title,
      resultSubtitle: result.subtitle,
      resultIcon: result.icon,
      resultCategory: cat,
      count: 1,
      lastUsed: Date.now(),
      picked: true,
    });
  }

  if (cache.length > MAX_ENTRIES) {
    cache.sort((a, b) => frecency(b) - frecency(a));
    cache = cache.slice(0, MAX_ENTRIES);
  }

  persist();
};

const SEEN_DECAY_HALF_LIFE = 3 * 24 * 60 * 60 * 1000; // 3 days — seen results fade faster

/** Record results the user saw but didn't pick. */
export const recordSeen = (query: string, results: SearchResult[]): void => {
  const q = query.toLowerCase().trim();
  if (!q) return;

  let changed = false;
  for (const result of results) {
    const cat = result.category ?? '';
    if (!TRACKABLE.has(cat)) continue;

    const existing = cache.find(e => e.query === q && e.resultId === result.id);
    if (existing) {
      // don't downgrade a picked entry; just refresh timestamp
      existing.lastUsed = Date.now();
      existing.resultTitle = result.title;
      existing.resultSubtitle = result.subtitle;
      existing.resultIcon = result.icon;
    } else {
      cache.push({
        query: q,
        resultId: result.id,
        resultTitle: result.title,
        resultSubtitle: result.subtitle,
        resultIcon: result.icon,
        resultCategory: cat,
        count: 1,
        lastUsed: Date.now(),
        picked: false,
      });
    }
    changed = true;
  }

  if (!changed) return;

  if (cache.length > MAX_ENTRIES) {
    cache.sort((a, b) => frecency(b) - frecency(a));
    cache = cache.slice(0, MAX_ENTRIES);
  }

  persist();
};

export const historyProvider: SearchProvider = {
  name: 'history',
  priority: 110,

  search(query: string): SearchResult[] {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    const matches: { entry: HistoryEntry; score: number }[] = [];

    for (const entry of cache) {
      let relevance: number;

      if (entry.query === q) {
        // exact query match — strongest signal
        relevance = 1.0;
      } else if (entry.query.startsWith(q)) {
        // prefix: "s" matches stored query "si" (→ Signal)
        relevance = 0.6 + 0.4 * (q.length / entry.query.length);
      } else if (q.startsWith(entry.query)) {
        // extension: "sig" matches stored query "s" (→ Signal)
        relevance = 0.5 * (entry.query.length / q.length);
      } else if (entry.resultTitle.toLowerCase().startsWith(q)) {
        // title prefix: "sig" matches result "Signal"
        relevance = 0.4;
      } else {
        continue;
      }

      const age = Date.now() - entry.lastUsed;
      const halfLife = entry.picked ? DECAY_HALF_LIFE : SEEN_DECAY_HALF_LIFE;
      const f = entry.count * Math.pow(0.5, age / halfLife);

      // Picked: base 2 (above apps 0–1). Seen: base 0.3 (mixes with apps, below top matches).
      const base = entry.picked ? 2 : 0.3;
      const score = base + relevance * Math.min(f, entry.picked ? 20 : 3);
      matches.push({ entry, score });
    }

    // deduplicate by result id — keep highest score
    const best = new Map<string, { entry: HistoryEntry; score: number }>();
    for (const m of matches) {
      const prev = best.get(m.entry.resultId);
      if (!prev || m.score > prev.score) best.set(m.entry.resultId, m);
    }

    return [...best.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ entry, score }) => ({
        id: entry.resultId,
        icon: entry.resultIcon,
        title: entry.resultTitle,
        subtitle: entry.resultSubtitle,
        score,
        category: entry.resultCategory as SearchResult['category'],
      }));
  },
};

export const clearHistory = (): void => {
  cache = [];
  persist();
};
