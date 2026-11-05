import { createRoot } from 'react-dom/client';
import '../index.css';
import { captureLeadAttribution, initAnalytics } from '@/utils/analytics';
import { startWebVitalsTracking } from '@/utils/performance';
import { SeoLandingPage } from './SeoLandingPage';
import { isSeoLandingSlug, SEO_LANDING_PAGES } from './seoPages';
import { seoLanguageFromPath, rememberSeoLanguage } from './seoLocale';
import { useAppStore } from '@/store/useAppStore';

const language = seoLanguageFromPath(window.location.pathname);
const path = language === 'en' ? window.location.pathname : window.location.pathname.slice(language.length + 1);
const slug = path.replace(/^\//, '').replace(/\.html$/, '');
useAppStore.getState().setSettings({ language });
if (language !== 'en') rememberSeoLanguage(language);

if (!isSeoLandingSlug(slug)) {
  window.location.replace('/404.html');
} else {
  const page = SEO_LANDING_PAGES[slug];
  void initAnalytics({ page_type: page.analyticsPageType, page_group: 'seo' });
  void captureLeadAttribution();
  void startWebVitalsTracking(page.analyticsPageType);
  createRoot(document.getElementById('root')!).render(<SeoLandingPage page={page} />);
}
