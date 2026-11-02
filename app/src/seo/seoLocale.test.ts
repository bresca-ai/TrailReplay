import { describe, expect, it } from 'vitest';
import { SEO_LANGUAGE_CODES, existingSeoLanguage, seoLocalizedPath } from './seoLocale';
import { LANGUAGE_CODES } from '@/i18n/languages';

describe('SEO language paths', () => {
  it('keeps the app language list as the source of truth', () => {
    expect(SEO_LANGUAGE_CODES).toEqual(LANGUAGE_CODES);
  });

  it('preserves existing English URLs and gives each translation a distinct path', () => {
    expect(seoLocalizedPath('/gpx-animation', 'en')).toBe('/gpx-animation');
    expect(seoLocalizedPath('/gpx-animation', 'de')).toBe('/de/gpx-animation');
    expect(seoLocalizedPath('/gpx-animation', 'zh-TW')).toBe('/zh-tw/gpx-animation');
    expect(seoLocalizedPath('/', 'ca')).toBe('/ca');
    expect(new Set(SEO_LANGUAGE_CODES.map((language) => seoLocalizedPath('/gpx-animation', language))).size).toBe(6);
  });

  it('rejects external or ambiguous paths', () => {
    for (const path of ['https://example.com', '//example.com', '/page?lang=fr', '/page#section']) {
      expect(() => seoLocalizedPath(path, 'fr')).toThrow();
    }
  });

  it('does not mislabel the current English fallback as a translation', () => {
    expect(existingSeoLanguage('de')).toBe('de');
    expect(existingSeoLanguage('es')).toBe('en');
  });
});

it('recognizes localized URL prefixes case insensitively', async () => {
  const { seoLanguageFromPath } = await import('./seoLocale');
  expect(seoLanguageFromPath('/zh-tw/tutorial')).toBe('zh-TW');
  expect(seoLanguageFromPath('/es/tutorial')).toBe('es');
  expect(seoLanguageFromPath('/tutorial')).toBe('en');
});

it('links to published pages in the selected language and preserves fragments', async () => {
  const { localizedSitePath } = await import('./seoLocale');
  expect(localizedSitePath('/tutorial#sample-routes', 'es')).toBe('/es/tutorial#sample-routes');
  expect(localizedSitePath('/gpx-animation', 'zh-TW')).toBe('/zh-tw/gpx-animation');
  expect(localizedSitePath('/garmin-to-video', 'fr')).toBe('/garmin-to-video');
  expect(localizedSitePath('/garmin-to-video', 'de')).toBe('/de/garmin-to-video');
});
