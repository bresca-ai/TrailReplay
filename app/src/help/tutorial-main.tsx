import { useAppStore } from '@/store/useAppStore';
import { rememberSeoLanguage, seoLanguageFromPath } from '@/seo/seoLocale';
import { createRoot } from 'react-dom/client';
import { TutorialPage } from './TutorialPage';
import '../index.css';
import { captureLeadAttribution, initAnalytics } from '@/utils/analytics';
import { startWebVitalsTracking } from '@/utils/performance';

const pageLanguage = seoLanguageFromPath(window.location.pathname);
useAppStore.getState().setSettings({ language: pageLanguage });
if (pageLanguage !== 'en') rememberSeoLanguage(pageLanguage);

void initAnalytics({ page_type: 'tutorial', page_group: 'help' });
void captureLeadAttribution();
void startWebVitalsTracking('tutorial');

createRoot(document.getElementById('root')!).render(<TutorialPage />);
