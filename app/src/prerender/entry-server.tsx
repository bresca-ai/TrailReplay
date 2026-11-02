import { renderToString } from 'react-dom/server';
import { GpxDownloadGuidePage } from '@/help/GpxDownloadGuidePage';
import { TutorialPage } from '@/help/TutorialPage';
import { AgentsPage } from '@/help/AgentsPage';
import { HomeStaticContent } from '@/prerender/HomeStaticContent';
import { SeoLandingPage } from '@/seo/SeoLandingPage';
import { SEO_LANDING_PAGES, type SeoLandingSlug } from '@/seo/seoPages';
import { SEO_LANDING_PAGES_DE } from '@/seo/seoPages.de';
import { landingLanguages, translateSeoCopy } from '@/seo/seoTranslations';
import { LANGUAGE_CODES } from '@/i18n/languages';
import { translate } from '@/i18n/translations';
import { PrerenderLanguageContext } from '@/i18n/useI18n';
import { HOME_TRANSLATIONS } from '@/prerender/homeTranslations';

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
  const result = Object.fromEntries(Object.entries(pages).map(([file, render]) => [file, render()]));
  const helpComponents = { tutorial: TutorialPage, 'gpx-download-guide': GpxDownloadGuidePage, agents: AgentsPage };
  for (const language of LANGUAGE_CODES.filter((code) => code !== 'en')) {
    result[`${language.toLowerCase()}/index.html`] = renderToString(<HomeStaticContent language={language} />);
    for (const [slug, Component] of Object.entries(helpComponents)) {
      result[`${language.toLowerCase()}/${slug}.html`] = renderToString(
        <PrerenderLanguageContext.Provider value={language}><Component /></PrerenderLanguageContext.Provider>,
      );
    }
  }
  for (const slug of seoSlugs) {
    for (const language of landingLanguages(slug).filter((code) => code !== 'en')) {
      result[`${language.toLowerCase()}/${slug}.html`] = renderToString(
        <PrerenderLanguageContext.Provider value={language}><SeoLandingPage page={SEO_LANDING_PAGES[slug]} /></PrerenderLanguageContext.Provider>,
      );
    }
  }
  return result;
}

export function localizedHelpMetadata(language: (typeof LANGUAGE_CODES)[number], slug: string) {
  const key = slug === 'gpx-download-guide' ? 'gpxGuide' : slug;
  return {
    title: translate(language, `help.${key}.title`),
    description: translate(language, `help.${key}.description`),
  };
}

export function localizedLandingMetadata(language: (typeof LANGUAGE_CODES)[number], slug: SeoLandingSlug) {
  const page = language === 'de' ? SEO_LANDING_PAGES_DE[slug] : translateSeoCopy(SEO_LANDING_PAGES[slug], language);
  return { title: page.title, description: page.description };
}

export function localizedHomeMetadata(language: Exclude<(typeof LANGUAGE_CODES)[number], 'en'>) {
  return HOME_TRANSLATIONS[language];
}
