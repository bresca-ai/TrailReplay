import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { parsePinheadIndex, searchPinheadIcons, type PinheadTerms } from './pinheadIcons';
import ca from './pinheadTerms/ca.json';
import de from './pinheadTerms/de.json';
import es from './pinheadTerms/es.json';
import fr from './pinheadTerms/fr.json';

function readPinnedIndex() {
  const require = createRequire(import.meta.url);
  return JSON.parse(readFileSync(require.resolve('@waysidemapping/pinhead/dist/icons/index.complete.json'), 'utf8'));
}

const svg = (d: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 15 15">\n  <path d="${d}"/>\n</svg>`;

describe('parsePinheadIndex', () => {
  it('extracts each path and leaves out sensitive icons', () => {
    const icons = parsePinheadIndex({
      icons: {
        mountain: { srcdir: 'nature/landforms', svg: svg('M0 0L15 15Z') },
        hidden: { srcdir: 'body', sensitive: ['nudity'], svg: svg('M1 1Z') },
        broken: { srcdir: 'misc' },
      },
    });

    expect(icons).toEqual([
      { id: 'mountain', path: 'M0 0L15 15Z', label: 'mountain', terms: 'mountain nature landforms' },
    ]);
  });

  it('reads the pinned package it ships with', () => {
    const index = readPinnedIndex();
    const icons = parsePinheadIndex(index);

    expect(icons.length).toBeGreaterThan(2000);
    expect(icons.find((icon) => icon.id === 'mountain')?.path).toMatch(/^M/);
    const sensitive = Object.entries(index.icons as Record<string, { sensitive?: string[] }>)
      .filter(([, entry]) => entry.sensitive?.length)
      .map(([id]) => id);
    expect(sensitive.length).toBeGreaterThan(0);
    expect(icons.some((icon) => sensitive.includes(icon.id))).toBe(false);
  });
});

describe('searchPinheadIcons', () => {
  const icons = parsePinheadIndex({
    icons: {
      mountain_with_greek_cross: { srcdir: 'nature/landforms', svg: svg('M1Z') },
      mountain: { srcdir: 'nature/landforms', svg: svg('M2Z') },
      water_tap: { srcdir: 'amenities/water', svg: svg('M3Z') },
      drinking_fountain: { srcdir: 'amenities/water', svg: svg('M4Z') },
      bicycle: { srcdir: 'transport', svg: svg('M5Z') },
    },
  });

  it('puts the exact and shortest names first', () => {
    const { results } = searchPinheadIcons(icons, 'mountain', 10);
    expect(results.map((icon) => icon.id)).toEqual(['mountain', 'mountain_with_greek_cross']);
  });

  it('requires every word, across name and category', () => {
    expect(searchPinheadIcons(icons, 'water tap', 10).results.map((icon) => icon.id)).toEqual(['water_tap']);
    expect(searchPinheadIcons(icons, 'water', 10).results.map((icon) => icon.id)).toEqual(['water_tap', 'drinking_fountain']);
  });

  it('reports the full count when the results are capped', () => {
    const { results, total } = searchPinheadIcons(icons, 'n', 2);
    expect(results).toHaveLength(2);
    expect(total).toBeGreaterThan(2);
  });

  it('returns nothing for an empty query', () => {
    expect(searchPinheadIcons(icons, '   ', 10)).toEqual({ results: [], total: 0 });
  });
});

describe('searching in the app language', () => {
  const icons = parsePinheadIndex({
    icons: {
      wall_tent: { srcdir: 'camping', svg: svg('M1Z') },
      mountain: { srcdir: 'nature/landforms', svg: svg('M2Z') },
      person_wearing_hat: { srcdir: 'people', svg: svg('M3Z') },
    },
  });
  const catalan: PinheadTerms = { wall: 'mur paret', tent: 'tenda de campanya', mountain: 'muntanya', person: 'persona', wearing: 'portant', hat: 'barret', camping: 'càmping', nature: 'natura', landforms: 'relleu', people: 'gent' };

  it('matches the local word and still matches English', () => {
    expect(searchPinheadIcons(icons, 'muntanya', 10, catalan).results.map((icon) => icon.id)).toEqual(['mountain']);
    expect(searchPinheadIcons(icons, 'mountain', 10, catalan).results.map((icon) => icon.id)).toEqual(['mountain']);
  });

  it('lets a query mix both languages and ignores linking words', () => {
    expect(searchPinheadIcons(icons, 'persona amb hat', 10, catalan).results.map((icon) => icon.id)).toEqual(['person_wearing_hat']);
  });

  it('ignores accents on either side', () => {
    expect(searchPinheadIcons(icons, 'camping', 10, catalan).results.map((icon) => icon.id)).toEqual(['wall_tent']);
    expect(searchPinheadIcons(icons, 'MUNTANYÁ', 10, catalan).results.map((icon) => icon.id)).toEqual(['mountain']);
  });

  it('does not match local words when no word list is given', () => {
    expect(searchPinheadIcons(icons, 'muntanya', 10).total).toBe(0);
  });
});

// Proper names, letters, numerals, acronyms and English linking words read the
// same in every language, so they match through the English name.
const SAME_IN_EVERY_LANGUAGE = new Set(`a ahimsa alabama alai alaska and anime ankh arizona arkansas at b baht boba
bohr bundesadler c california carolina cc cesta colorado columbia confucian connecticut d dakota david delaware dharma
dvd e euro f f22 faravahar florida for from g georges georgia h hampshire hawaii i ichthys idaho ii iii indiana into
iowa iv ix j jai jersey jp k kansas kentucky khanda l libre louisiana lu lucha m maine marae maryland massachusetts
michigan minnesota mississippi missouri montana moroni n nebraska nevada o oc of ohio oklahoma om on oregon out p
paifang pennsylvania q r rhode rss s sayana skep sos t temaki tennessee texas than to u ui us utah v vermont vi vii
viii virginia w washington wc wisconsin with within wyoming x xi xii xx y yang yin york z zi madison`.split(/\s+/));

describe('pinhead word lists', () => {
  const lists: Record<string, PinheadTerms> = { ca, de, es, fr };
  const index = readPinnedIndex();
  const vocabulary = new Set(parsePinheadIndex(index).flatMap((icon) => icon.terms.split(' ').filter(Boolean)));

  it.each(Object.keys(lists))('%s covers every word in the pinned Pinhead names', (language) => {
    const missing = [...vocabulary].filter((word) => !SAME_IN_EVERY_LANGUAGE.has(word) && !lists[language][word]);
    expect(missing).toEqual([]);
  });
});
