import type { LanguageCode } from '@/i18n/languages';
import type { SeoLandingSlug } from './seoPages';
import es from './seoPages.es.json';
import ca from './seoPages.ca.json';
import fr from './seoPages.fr.json';
import zhTW from './seoPages.zh-TW.json';

const copy: Partial<Record<LanguageCode, Record<string, string>>> = { es, ca, fr, 'zh-TW': zhTW };
const translatedSlugs = new Set<SeoLandingSlug>(['gpx-animation', 'strava-to-video']);

export function landingLanguages(slug: SeoLandingSlug): LanguageCode[] {
  return translatedSlugs.has(slug) ? ['en', 'es', 'ca', 'de', 'fr', 'zh-TW'] : ['en', 'de'];
}

export function landingLanguage(slug: SeoLandingSlug, language: LanguageCode): LanguageCode {
  return landingLanguages(slug).includes(language) ? language : 'en';
}

/** Translate copy while preserving identifiers and React icon components. */
export function translateSeoCopy<T>(value: T, language: LanguageCode): T {
  const dictionary = copy[language];
  if (!dictionary) return value;
  function translate(item: unknown, key = ''): unknown {
    if (['slug', 'analyticsPageType', 'heroMedia', 'icon'].includes(key)) return item;
    if (typeof item === 'string') return dictionary![item] ?? item;
    if (Array.isArray(item)) return item.map((child) => translate(child));
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([k, v]) => [k, translate(v, k)]));
    return item;
  }
  return translate(value) as T;
}
