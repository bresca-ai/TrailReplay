import { createContext, useCallback, useContext } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { translate, translations, type LanguageCode } from './translations';
import { isLocalizedHomePath, localizedHomePath } from '@/seo/seoLocale';

export const PrerenderLanguageContext = createContext<LanguageCode | null>(null);

export function useI18n() {
  const override = useContext(PrerenderLanguageContext);
  const storedLanguage = useAppStore((state) => state.settings.language);
  const language = override ?? storedLanguage;
  const setSettings = useAppStore((state) => state.setSettings);

  const setLanguage = useCallback((lang: LanguageCode) => {
    setSettings({ language: lang });
    if (typeof window !== 'undefined' && isLocalizedHomePath(window.location.pathname)) {
      const { search, hash } = window.location;
      window.history.replaceState(window.history.state, '', `${localizedHomePath(lang)}${search}${hash}`);
    }
    try {
      localStorage.setItem('trailReplayLang', lang);
    } catch {
      return;
    }
  }, [setSettings]);

  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    return translate(language, key, params);
  }, [language]);

  return {
    t,
    language,
    setLanguage,
    languages: Object.keys(translations) as LanguageCode[],
  };
}
