// search-engine.ts
import { SearchProvider, SearchResult } from './search-results.ts';
import { refreshApps } from './providers/apps.ts';

class LocalSearchEngine {
  private providers: SearchProvider[] = [];

  register(provider: SearchProvider): void {
    this.providers.push(provider);
    this.providers.sort((a, b) => b.priority - a.priority);
  }

  async search(type: string, query: string): Promise<SearchResult[]> {
    const results = await Promise.all(
      this.providers.map(async p => {
        try {
          return await p.search(query);
        } catch {
          return [];
        }
      }),
    );

    const flat = results.flat().sort((a, b) => b.score - a.score);
    const seen = new Set<string>();
    const deduped: SearchResult[] = [];
    for (const r of flat) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      deduped.push(r);
      if (deduped.length >= 12) break;
    }
    return deduped;
  }

  async buildIndexes() {
    refreshApps();
  }
}

export const localEngine = new LocalSearchEngine();

// Register local providers
import { appsProvider } from './providers/apps.ts';
import { commandsProvider } from './providers/commands.ts';
import { historyProvider } from './providers/history.ts';

localEngine.register(appsProvider);
localEngine.register(commandsProvider);
localEngine.register(historyProvider);

// Re-export web search separately
// export { searchWeb, warmConnection } from './providers/web-provider';
