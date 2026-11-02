import { LANGUAGE_CODES, type LanguageCode } from '@/i18n/languages';

/** Only publish a localized URL after its content and metadata are complete. */
export const SEO_LANGUAGE_CODES = LANGUAGE_CODES;

/** English keeps the existing unprefixed URLs to preserve their search history. */
export function seoLocalizedPath(path: string, language: LanguageCode): string {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('?') || path.includes('#')) {
    throw new Error('Expected an absolute site path without a query or fragment');
  }
  if (language === 'en') return path;
  const prefix = `/${language.toLowerCase()}`;
  return path === '/' ? prefix : `${prefix}${path}`;
}

/** Existing landing pages currently have copy only for these two languages. */
export function existingSeoLanguage(language: LanguageCode): 'en' | 'de' {
  return language === 'de' ? 'de' : 'en';
}
