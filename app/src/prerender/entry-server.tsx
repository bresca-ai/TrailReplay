import { renderToString } from 'react-dom/server';
import { GpxDownloadGuidePage } from '@/help/GpxDownloadGuidePage';
import { TutorialPage } from '@/help/TutorialPage';
import { AgentsPage } from '@/help/AgentsPage';
import { HomeStaticContent } from '@/prerender/HomeStaticContent';
import { SeoLandingPage } from '@/seo/SeoLandingPage';
import { SEO_LANDING_PAGES, type SeoLandingSlug } from '@/seo/seoPages';

/**
 * Build-time prerendering of every crawlable document.
 *
 * The client entries mount into `#root` and replace whatever is already there,
 * so this markup only ever reaches crawlers and first paint — it never has to
 * stay in sync with runtime state.
 */
const seoSlugs = Object.keys(SEO_LANDING_PAGES) as SeoLandingSlug[];

const pages: Record<string, () => string> = {
  'index.html': () => renderToString(<HomeStaticContent />),
  'tutorial.html': () => renderToString(<TutorialPage />),
  'agents.html': () => renderToString(<AgentsPage />),
  'gpx-download-guide.html': () => renderToString(<GpxDownloadGuidePage />),
  ...Object.fromEntries(
    seoSlugs.map((slug) => [
      `${slug}.html`,
      () => renderToString(<SeoLandingPage page={SEO_LANDING_PAGES[slug]} />),
    ]),
  ),
};

export function renderAllPages(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(pages).map(([file, render]) => [file, render()]),
  );
}
