export type QueryIntent = 'local' | 'question' | 'navigation' | 'search';

export interface QueryClassification {
  intent: QueryIntent;
  query: string;
  actions: ActionSuggestion[];
}

export interface ActionSuggestion {
  type: 'open' | 'web-search' | 'sqip' | 'add-note';
  label: string;
  priority: number;
  autoFetchSuggestions: boolean;
}

const QUESTION_PREFIXES = new RegExp(
  '^(' +
    [
      'who', 'what', 'when', 'where', 'why', 'how', 'is', 'are', 'can', 'do', 'does', 'will', 'should', 'could', 'would', 'which',
      'quién', 'qué', 'cuándo', 'dónde', 'por qué', 'cómo', 'cuál', 'cuánto',
      'qui', 'quoi', 'quand', 'où', 'pourquoi', 'comment', 'quel', 'quelle', 'est-ce',
      'wer', 'was', 'wann', 'wo', 'warum', 'wie', 'welche', 'welcher', 'welches', 'ist', 'sind', 'kann', 'haben',
      'quem', 'quando', 'onde', 'por que', 'como', 'qual', 'quanto',
      'chi', 'cosa', 'quando', 'dove', 'perché', 'come', 'quale', 'quanto',
      'wie', 'wat', 'wanneer', 'waar', 'waarom', 'hoe', 'welk', 'welke',
      'kto', 'co', 'kiedy', 'gdzie', 'dlaczego', 'jak', 'czy', 'który', 'która', 'które', 'ile',
      'kdo', 'kdy', 'kde', 'proč', 'kolik', 'jaký', 'která',
      'kim', 'ne', 'neden', 'niçin', 'nasıl', 'nerede', 'hangi', 'kaç',
    ].join('|') +
    ')\\b',
  'i',
);

const QUESTION_SUFFIXES = /[?？¿﹖⁇⁈⁉]\s*$/;
const CJK_QUESTION_PARTICLE = /[吗嗎么呢か까]\s*$/;

const isQuestion = (q: string): boolean =>
  QUESTION_SUFFIXES.test(q) || CJK_QUESTION_PARTICLE.test(q) || QUESTION_PREFIXES.test(q.trim());

const isUrl = (q: string): boolean => !q.includes(' ') && /\.[a-z]{2,}$/i.test(q);

const isShort = (q: string): boolean => q.trim().split(/\s+/).length <= 3;

export const classify = (query: string, hasLocalMatches: boolean): QueryClassification => {
  const q = query.trim();

  // Rule 1: URL pattern
  if (isUrl(q)) {
    return {
      intent: 'navigation',
      query: q,
      actions: [
        { type: 'open', label: `Open "${q}" in browser`, priority: 0, autoFetchSuggestions: false },
        { type: 'web-search', label: `Search web "${q}"`, priority: 1, autoFetchSuggestions: false },
      ],
    };
  }

  // Rule 2: Has local matches
  if (hasLocalMatches) {
    return {
      intent: 'local',
      query: q,
      actions: [
        { type: 'web-search', label: `Search web "${q}"`, priority: 0, autoFetchSuggestions: false },
        { type: 'sqip', label: `Ask SQIP "${q}"`, priority: 1, autoFetchSuggestions: false },
      ],
    };
  }

  // Rule 3: No local matches + question
  if (isQuestion(q)) {
    return {
      intent: 'question',
      query: q,
      actions: [
        { type: 'sqip', label: `Ask SQIP "${q}"`, priority: 0, autoFetchSuggestions: false },
        { type: 'web-search', label: `Search web "${q}"`, priority: 1, autoFetchSuggestions: false },
        { type: 'add-note', label: `Add note "${q}"`, priority: 2, autoFetchSuggestions: false },
      ],
    };
  }

  // Rule 4: No local matches + short query
  if (isShort(q)) {
    return {
      intent: 'search',
      query: q,
      actions: [
        { type: 'web-search', label: `Search web "${q}"`, priority: 0, autoFetchSuggestions: true },
        { type: 'add-note', label: `Add note "${q}"`, priority: 1, autoFetchSuggestions: false },
        { type: 'sqip', label: `Ask SQIP "${q}"`, priority: 2, autoFetchSuggestions: false },
      ],
    };
  }

  // Rule 5: No local matches + long query
  return {
    intent: 'search',
    query: q,
    actions: [
      { type: 'web-search', label: `Search web "${q}"`, priority: 0, autoFetchSuggestions: true },
      { type: 'sqip', label: `Ask SQIP "${q}"`, priority: 1, autoFetchSuggestions: false },
      { type: 'add-note', label: `Add note "${q}"`, priority: 2, autoFetchSuggestions: false },
    ],
  };
};
