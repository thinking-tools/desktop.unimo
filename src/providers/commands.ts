// providers/commands.ts
import { SearchProvider, SearchResult } from '../search-results.ts';
import { register, registerCallback, Action } from '../actions.ts';

interface Command {
  id: string;
  title: string;
  subtitle?: string;
  shortcut?: string;
  keywords: string[];
  action: Action;
}

const commands: Command[] = [
  {
    id: 'cmd:settings',
    title: 'Settings',
    subtitle: 'Open preferences',
    shortcut: '⌘,',
    keywords: ['config', 'prefs', 'options'],
    action: { type: 'callback', payload: 'settings:open' },
  },
  {
    id: 'cmd:reload',
    title: 'Reload',
    subtitle: 'Refresh window',
    shortcut: '⌘R',
    keywords: ['refresh'],
    action: { type: 'callback', payload: 'window:reload' },
  },
  {
    id: 'cmd:quit',
    title: 'Quit',
    subtitle: 'Exit application',
    shortcut: '⌘Q',
    keywords: ['exit', 'close'],
    action: { type: 'callback', payload: 'app:quit' },
  },
  {
    id: 'cmd:devtools',
    title: 'Developer Tools',
    subtitle: 'Toggle DevTools',
    shortcut: '⌘⌥I',
    keywords: ['debug', 'inspect'],
    action: { type: 'callback', payload: 'devtools:toggle' },
  },
];

// Pre-register actions
for (const cmd of commands) register(cmd.id, cmd.action);

export const commandsProvider: SearchProvider = {
  name: 'commands',
  priority: 90,

  search(query: string): SearchResult[] {
    const q = query.toLowerCase();
    if (!q) return [];

    const scored: { cmd: Command; score: number }[] = [];

    for (const cmd of commands) {
      const titleLower = cmd.title.toLowerCase();
      let score = 0;

      if (titleLower === q) score = 1;
      else if (titleLower.startsWith(q)) score = 0.95;
      else if (titleLower.includes(q)) score = 0.8;
      else if (cmd.keywords.some(k => k.startsWith(q))) score = 0.7;
      else if (cmd.keywords.some(k => k.includes(q))) score = 0.5;

      if (score > 0) scored.push({ cmd, score });
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ cmd, score }) => ({
        id: cmd.id,
        icon: '⚡',
        title: cmd.title,
        subtitle: cmd.subtitle,
        shortcut: cmd.shortcut,
        score,
        category: 'command',
      }));
  },
};

export { registerCallback };
