export interface SearchResult {
  id: string;
  icon: string;
  title: string;
  subtitle?: string;
  shortcut?: string;
  score: number;
  action: string;
}

interface SearchableItem {
  id: string;
  icon: string;
  title: string;
  subtitle?: string;
  shortcut?: string;
  keywords?: string[];
  action: string;
}
const fuzzyScore = (query: string, target: string): number => {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (q.length === 0) return 1;
  if (t.includes(q)) return 0.9 + (q.length / t.length) * 0.1; // substring bonus

  let qi = 0,
    consecutive = 0,
    maxConsecutive = 0,
    firstMatchBonus = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (qi === 0 && ti === 0) firstMatchBonus = 0.1;
      consecutive++;
      maxConsecutive = Math.max(maxConsecutive, consecutive);
      qi++;
    } else {
      consecutive = 0;
    }
  }
  if (qi < q.length) return 0;
  return (qi / t.length) * 0.5 + (maxConsecutive / q.length) * 0.4 + firstMatchBonus;
};

const scoreItem = (query: string, item: SearchableItem): number => {
  const titleScore = fuzzyScore(query, item.title) * 1.0;
  const subtitleScore = item.subtitle ? fuzzyScore(query, item.subtitle) * 0.6 : 0;
  const keywordScores = item.keywords?.map(k => fuzzyScore(query, k) * 0.8) ?? [];
  return Math.max(titleScore, subtitleScore, ...keywordScores);
};

// mock data - replace with your actual data source
const items: SearchableItem[] = [
  {
    id: '1',
    icon: '📁',
    title: 'Open Project',
    subtitle: '~/code/lattice-sdk',
    shortcut: '⏎',
    keywords: ['folder', 'directory'],
    action: 'openProject',
  },
  {
    id: '2',
    icon: '⚙️',
    title: 'Settings',
    subtitle: 'App preferences',
    keywords: ['config', 'options'],
    action: 'openSettings',
  },
  { id: '3', icon: '🔍', title: 'Search Files', subtitle: 'Find in workspace', shortcut: '⌘F', action: 'searchFiles' },
  { id: '4', icon: '📝', title: 'New Note', subtitle: 'Create markdown note', shortcut: '⌘N', action: 'newNote' },
  { id: '5', icon: '🚀', title: 'Run Command', subtitle: 'Execute shell command', action: 'runCommand' },
  {
    id: '6',
    icon: '🔐',
    title: 'Vault',
    subtitle: 'Encrypted storage',
    keywords: ['encrypt', 'secure', 'lattice'],
    action: 'openVault',
  },
];

export const search = (query: string): SearchResult[] => {
  if (!query.trim()) return items.slice(0, 6).map(i => ({ ...i, score: 1 }));

  return items
    .map(item => ({ ...item, score: scoreItem(query, item) }))
    .filter(r => r.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
};
