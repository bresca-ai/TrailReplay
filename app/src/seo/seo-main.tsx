import { createRoot } from 'react-dom/client';
import '../index.css';
import { captureLeadAttribution, initAnalytics } from '@/utils/analytics';
import { startWebVitalsTracking } from '@/utils/performance';
import { SeoLandingPage } from './SeoLandingPage';
import { isSeoLandingSlug, SEO_LANDING_PAGES } from './seoPages';

const slug = window.location.pathname.replace(/^\//, '').replace(/\.html$/, '');

if (!isSeoLandingSlug(slug)) {
  window.location.replace('/404.html');
} else {
  const page = SEO_LANDING_PAGES[slug];
  void initAnalytics({ page_type: page.analyticsPageType, page_group: 'seo' });
  void captureLeadAttribution();
  void startWebVitalsTracking(page.analyticsPageType);
  createRoot(document.getElementById('root')!).render(<SeoLandingPage page={page} />);
}
