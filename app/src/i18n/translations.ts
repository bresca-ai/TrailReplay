import { ca } from './locales/ca';
import { de } from './locales/de';
import { en } from './locales/en';
import { es } from './locales/es';
import { fr } from './locales/fr';
import { zhTW } from './locales/zhTW';
import { LANGUAGE_CODES, type LanguageCode } from './languages';
export type { LanguageCode } from './languages';

export const translations = {
  en,
  es,
  ca,
  de,
  fr,
  'zh-TW': zhTW,
} as const;

export type TranslationTree = (typeof translations)[LanguageCode];

export const languageLabels: Record<LanguageCode, string> = {
  en: 'English',
  es: 'Español',
  ca: 'Català',
  de: 'Deutsch',
  fr: 'Français',
  'zh-TW': '正體中文（台灣）',
};

function supportedLanguage(value: string): LanguageCode | undefined {
  const tag = value.toLowerCase().replace(/_/g, '-');
  // Explicit script takes precedence over region: zh-Hans-TW is not Traditional Chinese.
  if (/^zh-hant(?:-|$)/.test(tag) || tag === 'zh-tw') return 'zh-TW';
  if (tag.startsWith('zh')) return undefined;
  return LANGUAGE_CODES.find((language) => language === tag.split('-')[0]);
}

export function getInitialLanguage(): LanguageCode {
  if (typeof window === 'undefined') return 'en';

  try {
    const saved = localStorage.getItem('trailReplayLang');
    if (saved && LANGUAGE_CODES.includes(saved as LanguageCode)) {
      return saved as LanguageCode;
    }
  } catch {
    // Ignore storage access failures and fall back to browser/default language.
  }

  for (const preference of [navigator.language, ...(navigator.languages ?? [])]) {
    if (!preference) continue;
    const language = supportedLanguage(preference);
    if (language) return language;
  }
  return 'en';
}

function resolveTranslationValue(source: TranslationTree, key: string): string | undefined {
  return key
    .split('.')
    .reduce<unknown>((current, part) => {
      if (current && typeof current === 'object' && part in current) {
        return (current as Record<string, unknown>)[part];
      }
      return undefined;
    }, source) as string | undefined;
}

export function translate(
  lang: LanguageCode,
  key: string,
  params: Record<string, string | number> = {}
): string {
  const raw = resolveTranslationValue(translations[lang], key)
    ?? resolveTranslationValue(translations.en, key);

  if (typeof raw !== 'string') return key;

  return raw.replace(/\{\{?(\w+)\}?\}/g, (_match, token) => String(params[token] ?? `{${token}}`));
}
