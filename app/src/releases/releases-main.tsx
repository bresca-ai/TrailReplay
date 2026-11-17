import { createRoot } from 'react-dom/client';
import '../index.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/source-serif-4/latin-400.css';
import '@fontsource/source-serif-4/latin-600.css';
import { ReleasePage } from './ReleasePage';
import { useAppStore } from '@/store/useAppStore';
import { rememberSeoLanguage, seoLanguageFromPath } from '@/seo/seoLocale';

const language = seoLanguageFromPath(window.location.pathname);
useAppStore.getState().setSettings({ language });
if (language !== 'en') rememberSeoLanguage(language);
document.documentElement.lang = language;

createRoot(document.getElementById('root')!).render(<ReleasePage />);
