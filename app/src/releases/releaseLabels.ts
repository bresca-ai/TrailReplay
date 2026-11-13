import type { LanguageCode } from '@/i18n/translations';

export const releaseLabels: Record<LanguageCode, { title: string; description: string }> = {
  en: { title: 'What’s new', description: 'Explore release notes and updates (English).' },
  es: { title: 'Novedades', description: 'Consulta las notas de las versiones (en inglés).' },
  ca: { title: 'Novetats', description: 'Consulta les notes de les versions (en anglès).' },
  de: { title: 'Neuigkeiten', description: 'Versionshinweise und Updates ansehen (auf Englisch).' },
  fr: { title: 'Nouveautés', description: 'Consultez les notes de version (en anglais).' },
  'zh-TW': { title: '最新消息', description: '查看版本說明與更新（英文）。' },
};
