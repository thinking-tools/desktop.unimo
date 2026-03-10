// search-result.ts
export interface SearchResult {
  id: string;
  icon: string;
  title: string;
  subtitle?: string;
  shortcut?: string;
  score: number;
  category: 'app' | 'note' | 'command' | 'file' | 'web';
}

export interface SearchProvider {
  readonly name: string;
  readonly priority: number;
  search(query: string): Promise<SearchResult[]> | SearchResult[];
}
