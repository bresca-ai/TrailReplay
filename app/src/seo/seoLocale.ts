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

/** Read only a supported language prefix from a localized URL. */
export function seoLanguageFromPath(path: string): LanguageCode {
  const prefix = path.split('/')[1]?.toLowerCase();
  return LANGUAGE_CODES.find((language) => language.toLowerCase() === prefix) ?? 'en';
}

/** Carry the language of a directly visited help page into the main app. */
export function rememberSeoLanguage(language: LanguageCode): void {
  try { localStorage.setItem('trailReplayLang', language); } catch { /* Storage can be disabled. */ }
}
