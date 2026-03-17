import type { ActionSuggestion } from './query-classifier.js';

export interface SearchResult {
  id: string;
  icon: string;
  title: string;
  subtitle?: string;
  shortcut?: string;
  category?: string;
}

interface StoreState {
  query: string;
  results: SearchResult[];
  actions: ActionSuggestion[];
  suggestions: string[];
  active: number;
}

const bus = new EventTarget();
const raw: StoreState = { query: '', results: [], actions: [], suggestions: [], active: 0 };

let batching = false;
let pending: Array<[string, unknown]> = [];

export const state = new Proxy(raw, {
  set(t, k, v) {
    const key = k as keyof StoreState;
    if (Object.is(t[key], v)) return true;
    Reflect.set(t, k, v);
    const name = String(k);
    if (batching) pending.push([name, v]);
    else bus.dispatchEvent(new CustomEvent(`change:${name}`, { detail: v }));
    return true;
  },
});

export const on = (evt: string, fn: (e: CustomEvent) => void) => bus.addEventListener(evt, fn as EventListener);

export const emit = (evt: string, detail?: unknown) => bus.dispatchEvent(new CustomEvent(evt, { detail }));

export const batch = (fn: () => void) => {
  batching = true;
  fn();
  batching = false;
  const q = pending;
  pending = [];
  for (const [k, v] of q) bus.dispatchEvent(new CustomEvent(`change:${k}`, { detail: v }));
};
