import { useEffect, useState, useSyncExternalStore } from 'react';
// Served as a static asset and fetched on demand: ~2,300 icon paths are far too
// many to put in the main bundle for a picker most sessions never open.
import pinheadIndexUrl from '@waysidemapping/pinhead/dist/icons/index.complete.json?url';

/** Pinhead map icons (CC0): https://pinhead.ink — pinned in package.json. */
export interface PinheadIcon {
  id: string;
  /** Single path on Pinhead's 15x15 grid. */
  path: string;
  label: string;
  /** Lower-case name and category words, for search. */
  terms: string;
}

interface PinheadIndex {
  icons: Record<string, { svg?: string; srcdir?: string; sensitive?: string[] }>;
}

const PATH_PATTERN = /\sd="([^"]+)"/;

/**
 * Pinhead marks icons some audiences find objectionable as `sensitive`. A replay
 * is made to be shared, so those are left out of the picker altogether.
 */
export function parsePinheadIndex(index: PinheadIndex): PinheadIcon[] {
  return Object.entries(index.icons).flatMap(([id, entry]) => {
    if (entry.sensitive?.length) return [];
    const path = entry.svg?.match(PATH_PATTERN)?.[1];
    if (!path) return [];
    const label = id.replace(/_/g, ' ');
    const category = (entry.srcdir ?? '').replace(/[/_]/g, ' ');
    return [{ id, path, label, terms: `${label} ${category}`.toLowerCase() }];
  });
}

/**
 * English word → the same word in one app language (synonyms space-separated).
 * Pinhead names are built from ~1,650 English words, so translating the words
 * rather than the 2,300 names is what makes every icon findable in every
 * language. Proper names, letters and acronyms that read the same everywhere
 * are left out and match through the English name.
 */
export type PinheadTerms = Record<string, string>;

// Linking words a query can contain in any language; the icon names do not
// use them in a way that narrows the search.
const QUERY_STOPWORDS = new Set([
  'a', 'an', 'and', 'at', 'for', 'from', 'of', 'on', 'the', 'to', 'with',
  'con', 'de', 'del', 'el', 'en', 'la', 'las', 'los', 'para', 'un', 'una', 'y',
  'als', 'amb', 'els', 'i', 'les', 'per',
  'au', 'aux', 'avec', 'des', 'du', 'et', 'le', 'pour', 'une',
  'auf', 'das', 'der', 'die', 'ein', 'eine', 'im', 'mit', 'und', 'von', 'zu',
]);

/** Lower case, no accents, apostrophes and hyphens as spaces: "Camí" finds "cami". */
export function normalizeSearchText(text: string) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/['’\-_]/g, ' ');
}

const localizedCache = new WeakMap<PinheadTerms, Map<string, { label: string; terms: string }>>();

function localized(icon: PinheadIcon, localTerms: PinheadTerms) {
  let cache = localizedCache.get(localTerms);
  if (!cache) {
    cache = new Map();
    localizedCache.set(localTerms, cache);
  }
  let entry = cache.get(icon.id);
  if (!entry) {
    const translate = (words: string) => words.split(' ').map((word) => localTerms[word] ?? word).join(' ');
    entry = { label: normalizeSearchText(translate(icon.label)), terms: normalizeSearchText(translate(icon.terms)) };
    cache.set(icon.id, entry);
  }
  return entry;
}

/**
 * Every query word has to appear in the icon's name or category, in English
 * or — when `localTerms` is given — in the app's language, so "tent" and
 * "tenda" both find the tents and "water tap" narrows to the taps. Name
 * matches rank above category-only ones, and shorter names first: "mountain"
 * before "mountain with greek cross".
 */
export function searchPinheadIcons(icons: PinheadIcon[], query: string, limit: number, localTerms?: PinheadTerms | null) {
  const words = normalizeSearchText(query).split(/\s+/).filter((word) => word && !QUERY_STOPWORDS.has(word));
  if (words.length === 0) return { results: [], total: 0 };

  const phrase = words.join(' ');
  const rankLabel = (label: string) => {
    if (label === phrase) return 0;
    if (label.startsWith(phrase)) return 1;
    if (label.split(' ').some((word) => word.startsWith(words[0]))) return 2;
    if (label.includes(words[0])) return 3;
    return 4;
  };

  const matches = icons.flatMap((icon) => {
    const local = localTerms ? localized(icon, localTerms) : null;
    const found = words.every((word) => icon.terms.includes(word) || (local?.terms.includes(word) ?? false));
    if (!found) return [];
    return [{ icon, rank: Math.min(rankLabel(icon.label), local ? rankLabel(local.label) : 4) }];
  }).sort((a, b) => a.rank - b.rank
    || a.icon.label.length - b.icon.label.length
    || a.icon.label.localeCompare(b.icon.label));

  return { results: matches.slice(0, limit).map(({ icon }) => icon), total: matches.length };
}

const termLoaders = import.meta.glob<PinheadTerms>('./pinheadTerms/*.json', { import: 'default' });

/** The app language's word list, or `null` for English and languages without one. */
export function loadPinheadTerms(language: string): Promise<PinheadTerms | null> {
  const load = termLoaders[`./pinheadTerms/${language}.json`];
  return load ? load() : Promise.resolve(null);
}

let icons: PinheadIcon[] | null = null;
let pathById = new Map<string, string>();
let loading: Promise<PinheadIcon[]> | null = null;
const listeners = new Set<() => void>();

export function loadPinheadIcons(): Promise<PinheadIcon[]> {
  loading ??= fetch(pinheadIndexUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`Pinhead icons failed to load (${response.status})`);
      return response.json() as Promise<PinheadIndex>;
    })
    .then((index) => {
      icons = parsePinheadIndex(index);
      pathById = new Map(icons.map((icon) => [icon.id, icon.path]));
      listeners.forEach((listener) => listener());
      return icons;
    })
    .catch((error: unknown) => {
      // Let the next caller retry, e.g. after a dropped connection.
      loading = null;
      throw error;
    });
  return loading;
}

/** The icon's path once the library has loaded; `null` until then. */
export function pinheadIconPath(id: string) {
  return pathById.get(id) ?? null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * The loaded library, or `null` while it is not. Loads it when `needed`, and
 * re-renders the caller once it arrives so icons drawn from it can be redrawn.
 */
export function usePinheadIcons(needed: boolean) {
  const loaded = useSyncExternalStore(subscribe, () => icons, () => null);
  useEffect(() => {
    if (needed && !icons) loadPinheadIcons().catch(() => { /* callers fall back to the pin */ });
  }, [needed]);
  return loaded;
}

/** The app language's word list once `needed`; English search needs none. */
export function usePinheadTerms(language: string, needed: boolean) {
  const [terms, setTerms] = useState<{ language: string; words: PinheadTerms | null } | null>(null);
  useEffect(() => {
    if (!needed || terms?.language === language) return;
    let cancelled = false;
    loadPinheadTerms(language)
      .then((words) => { if (!cancelled) setTerms({ language, words }); })
      .catch(() => { if (!cancelled) setTerms({ language, words: null }); });
    return () => { cancelled = true; };
  }, [language, needed, terms?.language]);
  return terms?.language === language ? terms.words : null;
}
