import { describe, expect, it } from 'vitest';
import { createWikilocBookmarkletHref } from './wikilocBookmarklet';

describe('createWikilocBookmarkletHref', () => {
  it('creates a Wikiloc bookmarklet that requests the original GPX and opens TrailReplay', () => {
    const href = createWikilocBookmarkletHref('https://trailreplay.example');
    const source = decodeURIComponent(href.slice('javascript:'.length));

    expect(() => new Function(source)).not.toThrow();
    expect(href).toMatch(/^javascript:/);
    expect(source).toContain('wikilocImport=1');
    expect(source).toContain('/wikiloc/download.do?id=');
    expect(source).toContain('/wikiloc/downloadToFile.do');
    expect(source).toContain('fetchOriginalGpx()');
    expect(source).toContain('/original/i');
    expect(source).toContain('response.headers.get("content-type")');
    expect(source).toContain('slice(0,140)');
    expect(source).toContain('fetchGpx("simplified500")');
    expect(source).toContain('Wikiloc returned no GPX. ');
    expect(source).toContain('Please send these details so I can fix the importer.');
    expect(source).toContain('simplified},appOrigin');
    expect(source).toContain('trailreplay:wikiloc-gpx');
    expect(source).toContain('https://trailreplay.example');
  });
});
