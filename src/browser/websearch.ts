// websearch.ts

export interface KagiSearchResult {
  t: 0;
  url: string;
  title: string;
  snippet?: string;
  published?: string;
  thumbnail?: {
    url: string;
    width?: number;
    height?: number;
  };
}

export interface KagiRelatedSearches {
  t: 1;
  list: string[];
}

export type KagiSearchObject = KagiSearchResult | KagiRelatedSearches;

export interface KagiResponse {
  meta: {
    id: string;
    node: string;
    ms: number;
    api_balance: number;
  };
  data: KagiSearchObject[];
}

export interface SearchResult {
  url: string;
  title: string;
  snippet?: string;
  published?: Date;
  thumbnailUrl?: string;
}

const API_URL = 'https://kagi.com/api/v0/search';

export class WebSearch {
  constructor(private readonly apiKey: string) {}

  async search(query: string, limit = 12): Promise<SearchResult[]> {
    const url = new URL(API_URL);
    url.searchParams.set('q', query);
    url.searchParams.set('limit', String(limit));

    const res = await fetch(url, {
      headers: { Authorization: `Bot ${this.apiKey}` },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Kagi API error ${res.status}: ${text}`);
    }

    const json: KagiResponse = await res.json();
    console.log('Kagi API response:', json);
    return json.data
      .filter((obj): obj is KagiSearchResult => obj.t === 0)
      .map(r => ({
        url: r.url,
        title: r.title,
        snippet: r.snippet,
        published: r.published ? new Date(r.published) : undefined,
        thumbnailUrl: r.thumbnail?.url,
      }));
  }

  async getRelatedSearches(query: string): Promise<string[]> {
    const url = new URL(API_URL);
    url.searchParams.set('q', query);

    const res = await fetch(url, {
      headers: { Authorization: `Bot ${this.apiKey}` },
    });

    if (!res.ok) return [];

    const json: KagiResponse = await res.json();
    const related = json.data.find((obj): obj is KagiRelatedSearches => obj.t === 1);
    return related?.list ?? [];
  }
}
