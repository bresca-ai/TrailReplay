import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SeoLandingPage } from './SeoLandingPage';
import { SEO_LANDING_PAGES } from './seoPages';

const state = vi.hoisted(() => ({ language: 'es' }));
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ language: state.language, setLanguage: vi.fn() }) }));
vi.mock('@/help/RouteImportWalkthrough', () => ({ RouteImportWalkthrough: () => null }));
vi.mock('@/utils/analytics', () => ({ trackEvent: vi.fn() }));

afterEach(() => {
  cleanup();
  document.documentElement.lang = 'en';
});

describe('SEO landing page language', () => {
  it('declares the language actually displayed, including fallback and language changes', () => {
    state.language = 'es';
    const { rerender } = render(<SeoLandingPage page={SEO_LANDING_PAGES['gpx-animation']} />);
    expect(document.documentElement.lang).toBe('en');

    state.language = 'de';
    rerender(<SeoLandingPage page={SEO_LANDING_PAGES['gpx-animation']} />);
    expect(document.documentElement.lang).toBe('de');

    state.language = 'fr';
    rerender(<SeoLandingPage page={SEO_LANDING_PAGES['gpx-animation']} />);
    expect(document.documentElement.lang).toBe('en');
  });
});
