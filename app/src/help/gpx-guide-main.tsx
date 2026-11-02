import { useAppStore } from '@/store/useAppStore';
import { rememberSeoLanguage, seoLanguageFromPath } from '@/seo/seoLocale';
import { createRoot } from 'react-dom/client';
import { GpxDownloadGuidePage } from './GpxDownloadGuidePage';
import '../index.css';
import { captureLeadAttribution, initAnalytics } from '@/utils/analytics';
import { startWebVitalsTracking } from '@/utils/performance';

const pageLanguage = seoLanguageFromPath(window.location.pathname);
useAppStore.getState().setSettings({ language: pageLanguage });
if (pageLanguage !== 'en') rememberSeoLanguage(pageLanguage);

void initAnalytics({ page_type: 'gpx_guide', page_group: 'help' });
void captureLeadAttribution();
void startWebVitalsTracking('gpx_guide');

createRoot(document.getElementById('root')!).render(<GpxDownloadGuidePage />);
