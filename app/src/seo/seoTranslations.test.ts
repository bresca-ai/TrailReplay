import { describe, expect, it } from 'vitest';
import { SEO_LANDING_PAGES } from './seoPages';
import { seoUi } from './seoUi';
import { landingLanguages } from './seoTranslations';
import es from './seoPages.es.json';
import ca from './seoPages.ca.json';
import fr from './seoPages.fr.json';
import zhTW from './seoPages.zh-TW.json';

function strings(value: unknown, key = ''): string[] {
  if (['slug', 'analyticsPageType', 'heroMedia', 'icon'].includes(key)) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((item) => strings(item));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, item]) => strings(item, k));
  return [];
}

describe('localized GPX and Strava landing pages', () => {
  const source = [...strings(seoUi.en), ...strings(SEO_LANDING_PAGES['gpx-animation']), ...strings(SEO_LANDING_PAGES['strava-to-video'])];
  it.each([['es', es], ['ca', ca], ['fr', fr], ['zh-TW', zhTW]])('%s translates every page and interface string', (_language, dictionary) => {
    const values: Record<string, string> = dictionary;
    expect(source.filter((text) => !values[text]?.trim())).toEqual([]);
  });
  it('only advertises additional locales for pages that have complete translations', () => {
    expect(landingLanguages('gpx-animation')).toEqual(['en', 'es', 'ca', 'de', 'fr', 'zh-TW']);
    expect(landingLanguages('garmin-to-video')).toEqual(['en', 'de']);
  });
});
