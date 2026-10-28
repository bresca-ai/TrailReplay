export const LANGUAGE_CODES = ['en', 'es', 'ca', 'de', 'fr', 'zh-TW'] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

/** Require the complete English key structure while allowing translated text. */
export type LocaleMessages<T> = {
  readonly [Key in keyof T]: T[Key] extends string ? string : LocaleMessages<T[Key]>;
};
