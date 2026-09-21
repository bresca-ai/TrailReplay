import { useEffect, useSyncExternalStore } from 'react';
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
 * Every query word has to appear in the icon's name or category, so "tent"
 * finds the tents and "water tap" narrows to the taps. Name matches rank above
 * category-only ones, and shorter names first: "mountain" before
 * "mountain with greek cross".
 */
export function searchPinheadIcons(icons: PinheadIcon[], query: string, limit: number) {
  const words = query.toLowerCase().split(/[\s_]+/).filter(Boolean);
  if (words.length === 0) return { results: [], total: 0 };

  const phrase = words.join(' ');
  const rank = (icon: PinheadIcon) => {
    if (icon.label === phrase) return 0;
    if (icon.label.startsWith(phrase)) return 1;
    if (icon.label.split(' ').some((word) => word.startsWith(words[0]))) return 2;
    if (icon.label.includes(words[0])) return 3;
    return 4;
  };

  const matches = icons
    .filter((icon) => words.every((word) => icon.terms.includes(word)))
    .map((icon) => ({ icon, rank: rank(icon) }))
    .sort((a, b) => a.rank - b.rank
      || a.icon.label.length - b.icon.label.length
      || a.icon.label.localeCompare(b.icon.label));

  return { results: matches.slice(0, limit).map(({ icon }) => icon), total: matches.length };
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
