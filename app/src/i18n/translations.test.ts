import { afterEach, describe, expect, it, vi } from 'vitest';
import { getInitialLanguage, languageLabels, translate, translations } from './translations';
import { LANGUAGE_CODES } from './languages';

interface TranslationNode {
  readonly [key: string]: string | TranslationNode;
}

function getLeafKeys(source: TranslationNode, prefix = ''): string[] {
  return Object.entries(source).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? [path] : getLeafKeys(value, path);
  });
}

function getLeafValues(source: TranslationNode, prefix = ''): Record<string, string> {
  return Object.fromEntries(Object.entries(source).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? [[path, value]] : Object.entries(getLeafValues(value, path));
  }));
}

function getPlaceholders(value: string): string[] {
  return value.match(/\{\{?\w+\}?\}/g)?.sort() ?? [];
}

describe('translations', () => {
  it('registers every supported language once, with a Taiwan Traditional Chinese label', () => {
    expect(Object.keys(translations).sort()).toEqual([...LANGUAGE_CODES].sort());
    expect(languageLabels['zh-TW']).toBe('正體中文（台灣）');
  });

  it('uses Taiwanese terminology and interpolates single and double braces', () => {
    expect(translate('zh-TW', 'common.save')).toBe('儲存');
    expect(translate('zh-TW', 'trackTrim.title')).toBe('裁切軌跡');
    expect(translate('zh-TW', 'trackTrim.selection', { distance: '5 km', count: 300 })).toBe('5 km · 保留 300 個軌跡點');
    expect(translate('zh-TW', 'feedback.minimumLengthHint', { count: 20 })).toBe('至少 20 個字元。');
    expect(translate('zh-TW', 'help.gpxGuide.openProvider', { provider: 'Strava' })).toBe('開啟 Strava');
    expect(translate('en', 'feedback.minimumLengthHint', { count: 20 })).toBe('Minimum 20 characters.');
  });

  it('does not leave English interface copy in the Traditional Chinese locale', () => {
    const unchanged = new Set(['Trail Replay', 'GitHub', 'Esri Clarity', 'GPS', 'bpm', 'rpm', '{fps} FPS', 'email@example.com', 'you@example.com', '(WebM)', '(CC-BY-SA) ·']);
    const english = getLeafValues(translations.en);
    const chinese = getLeafValues(translations['zh-TW']);
    const missing = Object.keys(english).filter((key) => english[key] === chinese[key]
      && /[A-Za-z]{2}/.test(english[key].replace(/\{\{?\w+\}?\}/g, ''))
      && !unchanged.has(english[key]));
    expect(missing).toEqual([]);
  });
  it('keeps every locale aligned with the English translation contract', () => {
    const englishKeys = getLeafKeys(translations.en).sort();

    for (const [language, locale] of Object.entries(translations)) {
      expect(getLeafKeys(locale).sort(), language).toEqual(englishKeys);
    }
  });

  it('preserves interpolation placeholders in every locale', () => {
    const englishValues = getLeafValues(translations.en);

    for (const [language, locale] of Object.entries(translations)) {
      const localeValues = getLeafValues(locale);
      for (const [key, englishValue] of Object.entries(englishValues)) {
        expect(getPlaceholders(localeValues[key]), `${language}:${key}`)
          .toEqual(getPlaceholders(englishValue));
      }
    }
  });
});

describe('initial language selection', () => {
  afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  function browser(language: string, languages = [language]) {
    localStorage.clear();
    vi.stubGlobal('navigator', { language, languages });
  }

  it.each(['zh-TW', 'zh-tw', 'zh_TW', 'zh-Hant', 'zh-Hant-TW', 'zh-Hant-HK'])("recognizes '%s' without reducing it to 'zh'", (language) => {
    browser(language);
    expect(getInitialLanguage()).toBe('zh-TW');
  });

  it('uses a saved explicit preference before the browser language', () => {
    browser('zh-TW');
    localStorage.setItem('trailReplayLang', 'en');
    expect(getInitialLanguage()).toBe('en');
    localStorage.setItem('trailReplayLang', 'zh-TW');
    expect(getInitialLanguage()).toBe('zh-TW');
  });

  it.each(['zh-CN', 'zh-Hans', 'zh-Hans-TW', 'zh'])('does not assume that %s requests Traditional Chinese', (language) => {
    browser(language);
    expect(getInitialLanguage()).toBe('en');
  });

  it('tries the rest of the preferred language list and keeps existing regional matches', () => {
    browser('ja-JP', ['ja-JP', 'zh-Hant', 'en-US']);
    expect(getInitialLanguage()).toBe('zh-TW');
    browser('fr-CA');
    expect(getInitialLanguage()).toBe('fr');
    browser('es-MX');
    expect(getInitialLanguage()).toBe('es');
  });

  it('ignores invalid stored values and still detects the browser if storage is unavailable', () => {
    browser('zh-TW');
    localStorage.setItem('trailReplayLang', '__proto__');
    expect(getInitialLanguage()).toBe('zh-TW');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    expect(getInitialLanguage()).toBe('zh-TW');
  });
});
