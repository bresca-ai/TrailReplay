import { describe, expect, it } from 'vitest';
import { createWikilocBookmarkletHref } from './wikilocBookmarklet';

describe('createWikilocBookmarkletHref', () => {
  it('creates a Wikiloc bookmarklet that requests the original GPX and opens TrailReplay', () => {
    const href = createWikilocBookmarkletHref('https://trailreplay.example');
    const source = decodeURIComponent(href.slice('javascript:'.length));

    expect(href).toMatch(/^javascript:/);
    expect(source).toContain('wikilocImport=1');
    expect(source).toContain('/wikiloc/downloadToFile.do');
    expect(source).toContain('fetchGpx("original")');
    expect(source).toContain('fetchGpx("simplified500")');
    expect(source).toContain('Wikiloc responded without a GPX file. Try the importer again');
    expect(source).toContain('simplified},appOrigin');
    expect(source).toContain('trailreplay:wikiloc-gpx');
    expect(source).toContain('https://trailreplay.example');
  });
});
