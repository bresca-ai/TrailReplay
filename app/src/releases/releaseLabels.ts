import type { LanguageCode } from '@/i18n/translations';

export const releaseLabels: Record<LanguageCode, { title: string; description: string }> = {
  en: { title: 'What’s new', description: 'Explore release notes and updates.' },
  es: { title: 'Novedades', description: 'Consulta las notas de las versiones.' },
  ca: { title: 'Novetats', description: 'Consulta les notes de les versions.' },
  de: { title: 'Neuigkeiten', description: 'Versionshinweise und Updates ansehen.' },
  fr: { title: 'Nouveautés', description: 'Consultez les notes de version.' },
  'zh-TW': { title: '最新消息', description: '查看版本說明與更新。' },
};
