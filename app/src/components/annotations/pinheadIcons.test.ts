import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { parsePinheadIndex, searchPinheadIcons } from './pinheadIcons';

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
    const require = createRequire(import.meta.url);
    const index = JSON.parse(readFileSync(require.resolve('@waysidemapping/pinhead/dist/icons/index.complete.json'), 'utf8'));
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
    const { results, total } = searchPinheadIcons(icons, 'a', 2);
    expect(results).toHaveLength(2);
    expect(total).toBeGreaterThan(2);
  });

  it('returns nothing for an empty query', () => {
    expect(searchPinheadIcons(icons, '   ', 10)).toEqual({ results: [], total: 0 });
  });
});
