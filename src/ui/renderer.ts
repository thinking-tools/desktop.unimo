import { state, on, emit, batch, type SearchResult } from './store.js';
import { classify, type ActionSuggestion } from './query-classifier.js';

interface ElectronAPI {
  platform: string;
  search: {
    query: (opts: { type: string; query: string }) => Promise<SearchResult[]>;
    suggest: (query: string, seq: number) => Promise<string[]>;
  };
  apps: {
    getIcon: (id: string) => Promise<string | null>;
  };
  favicon: {
    get: (url: string) => Promise<string | null>;
  };
  execute: {
    command: (id: string, query?: string, result?: SearchResult) => Promise<boolean>;
    action: (action: string, query: string) => Promise<unknown>;
  };
  window: {
    hide: () => void;
    onShowSearch: (cb: () => void) => void;
    onShowWeb: (cb: () => void) => void;
  };
  perf: {
    getStartTime: () => Promise<number>;
  };
  env: {
    isDev: () => Promise<boolean>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

const $ = (s: string) => document.querySelector(s);
const input = $('#input') as HTMLInputElement;
const list = $('#results') as HTMLElement;
const tpl = $('#tpl-item') as HTMLTemplateElement;
const tplAction = $('#tpl-action') as HTMLTemplateElement;
const app = $('#app') as HTMLElement;

const api = window.electronAPI;

// ── action icons ───────────────────────────────────────────
const ACTION_ICONS: Record<string, string> = {
  open: '↗',
  'web-search': '🔍',
  sqip: '✦',
  'add-note': '📝',
};

// ── web suggestion cache by prefix ─────────────────────────
const suggestCache = new Map<string, string[]>();

let suggestSeq = 0;
let suggestTimer: ReturnType<typeof setTimeout> | null = null;

const cancelSuggestions = () => {
  if (suggestTimer) {
    clearTimeout(suggestTimer);
    suggestTimer = null;
  }
};

// ── render ──────────────────────────────────────────────────

const render = () => {
  const frag = document.createDocumentFragment();
  const totalResults = state.results.length;
  const totalActions = state.actions.length;

  // render local results
  for (let i = 0; i < totalResults; i++) {
    const r = state.results[i];
    const el = tpl.content.firstElementChild!.cloneNode(true) as HTMLElement;
    el.dataset.idx = String(i);
    el.dataset.id = r.id;
    if (i === state.active) el.setAttribute('aria-selected', 'true');

    const icon = el.querySelector('i') as HTMLElement;
    if (r.icon?.startsWith('data:')) {
      icon.innerHTML = `<img src="${r.icon}">`;
    } else {
      icon.textContent = r.icon ?? '';
    }

    (el.querySelector('b') as HTMLElement).textContent = r.title;
    (el.querySelector('small') as HTMLElement).textContent = r.subtitle ?? '';
    frag.appendChild(el);
  }

  // divider between results and actions
  if (totalResults > 0 && totalActions > 0) {
    const hr = document.createElement('hr');
    hr.className = 'results-divider';
    frag.appendChild(hr);
  }

  // render action suggestions
  for (let i = 0; i < totalActions; i++) {
    const a = state.actions[i];
    const el = tplAction.content.firstElementChild!.cloneNode(true) as HTMLElement;
    const combinedIdx = totalResults + i;
    el.dataset.idx = String(combinedIdx);
    el.dataset.actionType = a.type;
    if (combinedIdx === state.active) el.setAttribute('aria-selected', 'true');

    (el.querySelector('i') as HTMLElement).textContent = ACTION_ICONS[a.type] ?? '→';
    (el.querySelector('b') as HTMLElement).textContent = a.label;
    frag.appendChild(el);
  }

  list.replaceChildren(frag);
  loadIcons();
};

const loadIcons = () => {
  for (const r of state.results) {
    if (r.icon?.startsWith('data:')) continue;

    if (r.id.startsWith('app:')) {
      api.apps.getIcon(r.id).then(dataUrl => {
        if (!dataUrl) return;
        r.icon = dataUrl;
        const el = list.querySelector(`[data-id="${CSS.escape(r.id)}"] > i`);
        if (el) el.innerHTML = `<img src="${dataUrl}">`;
      });
    } else if (r.id.startsWith('web:')) {
      const url = r.id.slice(4);
      api.favicon.get(url).then(dataUrl => {
        if (!dataUrl) return;
        r.icon = dataUrl;
        const el = list.querySelector(`[data-id="${CSS.escape(r.id)}"] > i`);
        if (el) el.innerHTML = `<img src="${dataUrl}">`;
      });
    }
  }
};

// ── store → DOM ─────────────────────────────────────────────

on('change:results', render);
on('change:actions', render);

on('change:active', e => {
  const prev = list.querySelector('[aria-selected]');
  if (prev) prev.removeAttribute('aria-selected');
  const allItems = list.querySelectorAll('[role="option"]');
  const next = allItems[e.detail as number];
  if (next) {
    next.setAttribute('aria-selected', 'true');
    next.scrollIntoView({ block: 'nearest' });
  }
});

// ── input → store ───────────────────────────────────────────

let inputTimer: ReturnType<typeof setTimeout>;
input.addEventListener('input', () => {
  clearTimeout(inputTimer);
  inputTimer = setTimeout(() => {
    state.query = input.value.trim();
  }, 100);
});

// ── navigable item count ────────────────────────────────────
const totalItems = () => state.results.length + state.actions.length;

input.addEventListener('keydown', e => {
  const len = totalItems();
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      state.active = Math.min(state.active + 1, len - 1);
      break;
    case 'ArrowUp':
      e.preventDefault();
      state.active = Math.max(state.active - 1, 0);
      break;
    case 'Enter':
      e.preventDefault();
      if (state.active < state.results.length) {
        // selected a local result
        emit('execute', state.results[state.active]);
      } else if (state.active < totalItems()) {
        // selected an action
        const actionIdx = state.active - state.results.length;
        emit('execute-action', state.actions[actionIdx]);
      } else if (state.actions.length > 0) {
        // nothing selected — run primary action
        emit('execute-action', state.actions[0]);
      }
      break;
    case 'Escape':
      e.preventDefault();
      emit('hide');
      break;
  }
});

// ── click / hover ───────────────────────────────────────────

list.addEventListener('click', e => {
  const target = e.target as HTMLElement;

  // "more" button — open context menu (placeholder, wired later)
  const moreBtn = target.closest('[data-action="more"]') as HTMLElement | null;
  if (moreBtn) {
    e.stopPropagation();
    const el = moreBtn.closest('[role="option"]') as HTMLElement | null;
    if (el) emit('context-menu', { idx: +el.dataset.idx!, anchor: moreBtn });
    return;
  }

  const el = target.closest('[role="option"]') as HTMLElement | null;
  if (!el) return;
  const idx = +el.dataset.idx!;
  if (idx < state.results.length) {
    emit('execute', state.results[idx]);
  } else {
    const actionIdx = idx - state.results.length;
    emit('execute-action', state.actions[actionIdx]);
  }
});

list.addEventListener('mousedown', e => {
  if ((e.target as HTMLElement).closest('button')) e.preventDefault();
});

list.addEventListener('mousemove', e => {
  const el = (e.target as HTMLElement).closest('[role="option"]') as HTMLElement | null;
  if (!el) return;
  const idx = +el.dataset.idx!;
  if (idx !== state.active) state.active = idx;
});

// ── context menu (placeholder — actions wired later) ────────

on('context-menu', e => {
  const { idx, anchor } = e.detail as { idx: number; anchor: HTMLElement };
  // TODO: populate with result-specific actions (copy link, open folder, share, etc.)
  console.log('context-menu requested for idx', idx, 'at', anchor);
});

// ── unified search flow ─────────────────────────────────────

on('change:query', async e => {
  const q = e.detail as string;
  cancelSuggestions();

  if (!q) {
    batch(() => {
      state.results = [];
      state.actions = [];
      state.suggestions = [];
      state.active = 0;
    });
    return;
  }

  // 1. Always run local search
  const localResults = await api.search.query({ type: 'search', query: q });
  const results = (localResults || []).slice(0, 12);

  // 2. Classify
  const classification = classify(q, results.length > 0);

  // 3. Render local results + actions
  batch(() => {
    state.results = results;
    state.actions = classification.actions;
    state.active = 0;
  });

  // 4. Auto-fetch web suggestions if classification says so
  const shouldFetch = classification.actions.some(a => a.autoFetchSuggestions) && q.length >= 2;
  if (shouldFetch) {
    // check prefix cache first
    const cached = findCachedSuggestions(q);
    if (cached) {
      state.suggestions = cached;
      return;
    }

    const seq = ++suggestSeq;
    suggestTimer = setTimeout(async () => {
      suggestTimer = null;
      try {
        const suggestions = await api.search.suggest(q, seq);
        if (seq !== suggestSeq) return;
        suggestCache.set(q.toLowerCase(), suggestions);
        state.suggestions = suggestions;
      } catch {
        // ignore
      }
    }, 500);
  }
});

const findCachedSuggestions = (q: string): string[] | undefined => {
  const lower = q.toLowerCase();
  // check exact match first, then progressively shorter prefixes
  for (let len = lower.length; len >= 2; len--) {
    const prefix = lower.slice(0, len);
    const cached = suggestCache.get(prefix);
    if (cached) {
      // filter to those still matching current query
      const filtered = cached.filter(s => s.toLowerCase().startsWith(lower));
      if (filtered.length > 0) return filtered;
    }
  }
};

// ── execute result ──────────────────────────────────────────

on('execute', async e => {
  const item = e.detail as SearchResult | undefined;
  if (!item) return;
  const ok = await api.execute.command(item.id, state.query, item);
  if (ok) {
    batch(() => {
      state.results = [];
      state.actions = [];
      state.suggestions = [];
      state.active = 0;
    });
    input.value = '';
    api.window.hide();
  }
});

// ── execute action ──────────────────────────────────────────

on('execute-action', async e => {
  const action = e.detail as ActionSuggestion;
  if (!action) return;
  const q = state.query;

  switch (action.type) {
    case 'open': {
      const url = q.startsWith('http') ? q : `https://${q}`;
      await api.execute.command(`web:${url}`, q, {
        id: `web:${url}`,
        icon: '↗',
        title: q,
        subtitle: url,
        category: 'web',
      });
      break;
    }
    case 'web-search': {
      // fetch full web results and display them
      const results = await api.search.query({ type: 'web', query: q });
      batch(() => {
        state.results = (results || []).slice(0, 12);
        state.actions = [];
        state.active = 0;
      });
      return; // don't hide — show results
    }
    case 'sqip': {
      await api.execute.action('chat', q);
      break;
    }
    case 'add-note': {
      await api.execute.action('note', q);
      break;
    }
  }

  batch(() => {
    state.results = [];
    state.actions = [];
    state.suggestions = [];
    state.active = 0;
  });
  input.value = '';
  api.window.hide();
});

on('hide', () => api.window.hide());

// ── init ────────────────────────────────────────────────────

document.body.dataset.platform = api.platform;

const isDev = await api.env.isDev();
if (isDev) document.documentElement.classList.add('dev-mode');

const t0 = await api.perf.getStartTime();
app.dataset.startupMs = String(Date.now() - t0);
app.dataset.ready = 'true';

const resetState = () => {
  input.focus();
  input.value = '';
  cancelSuggestions();
  batch(() => {
    state.results = [];
    state.actions = [];
    state.suggestions = [];
    state.active = 0;
  });
};

api.window.onShowSearch(resetState);
api.window.onShowWeb(resetState);

input.focus();
