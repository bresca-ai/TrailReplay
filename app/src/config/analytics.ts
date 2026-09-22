const DEFAULT_GA4_MEASUREMENT_ID = 'G-0JN6P31VV9';

export const GA4_MEASUREMENT_ID =
  import.meta.env.VITE_GA_MEASUREMENT_ID || DEFAULT_GA4_MEASUREMENT_ID;

export const GA4_DEBUG_MODE = import.meta.env.VITE_GA_DEBUG_MODE === 'true';

export function shouldEnableAnalytics() {
  if (typeof window === 'undefined') return false;

  const hostname = window.location.hostname;
  const isNonProductionHost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.vercel.app') ||
    hostname.endsWith('.pages.dev');

  if (isNonProductionHost && import.meta.env.VITE_ENABLE_ANALYTICS_IN_DEVELOPMENT !== 'true') {
    return false;
  }

  return Boolean(GA4_MEASUREMENT_ID);
}
