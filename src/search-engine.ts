// search-engine.ts
import { SearchProvider, SearchResult } from './search-results.ts';
import { refreshApps } from './providers/apps.ts';

class LocalSearchEngine {
  private providers: SearchProvider[] = [];

  register(provider: SearchProvider): void {
    this.providers.push(provider);
    this.providers.sort((a, b) => b.priority - a.priority);
  }

  async search(query: string): Promise<SearchResult[]> {
    const results = await Promise.all(
      this.providers.map(async p => {
        try {
          return await p.search(query);
        } catch {
          return [];
        }
      }),
    );

    return results
      .flat()
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
  }

  async buildIndexes() {
    refreshApps();
  }
}

export const localEngine = new LocalSearchEngine();

// Register local providers
import { appsProvider } from './providers/apps.ts';
import { commandsProvider } from './providers/commands.ts';

localEngine.register(appsProvider);
localEngine.register(commandsProvider);

// Re-export web search separately
// export { searchWeb, warmConnection } from './providers/web-provider';
