import { GA4_DEBUG_MODE, GA4_MEASUREMENT_ID, shouldEnableAnalytics } from '@/config/analytics';
import type { VideoExportSettings, VideoFormat } from '@/types';

let isInitialized = false;
let pendingInitialization = false;

type AnalyticsPrimitive = string | number | boolean;
type AnalyticsParams = Record<string, AnalyticsPrimitive>;

export interface AttributionTouch {
  source: string;
  medium: string;
  campaign: string;
  referrerHost: string;
  landingPage: string;
}

export interface LeadAttribution {
  firstTouch: AttributionTouch;
  lastTouch: AttributionTouch;
}

const FIRST_TOUCH_STORAGE_KEY = 'trailreplay-attribution-v1';
const SESSION_TOUCH_STORAGE_KEY = 'trailreplay-session-attribution-v1';
const ATTRIBUTION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const AI_REFERRERS: Record<string, string> = {
  'chatgpt.com': 'chatgpt.com',
  'chat.openai.com': 'chatgpt.com',
  'perplexity.ai': 'perplexity.ai',
  'claude.ai': 'claude.ai',
  'gemini.google.com': 'gemini.google.com',
  'copilot.microsoft.com': 'copilot.microsoft.com',
  'you.com': 'you.com',
  'poe.com': 'poe.com',
};
const SEARCH_REFERRERS = new Set([
  'google.com', 'bing.com', 'duckduckgo.com', 'search.brave.com', 'yandex.com', 'yandex.ru',
]);

interface StoredFirstTouch {
  expiresAt: number;
  touch: AttributionTouch;
}

export type AnalyticsPageType =
  | 'app'
  | 'tutorial'
  | 'gpx_guide'
  | 'strava_to_video'
  | 'garmin_to_video'
  | 'gpx_animation'
  | 'cycling_route_animation'
  | 'running_route_animation'
  | 'cinematic_camera'
  | 'agents';
export type AnalyticsPageGroup = 'product' | 'help' | 'seo';

export interface AnalyticsPageContext {
  page_type: AnalyticsPageType;
  page_group: AnalyticsPageGroup;
}

const DEFAULT_PAGE_CONTEXT: AnalyticsPageContext = {
  page_type: 'app',
  page_group: 'product',
};

declare global {
  interface Window {
    dataLayer?: Array<IArguments | unknown[]>;
    gtag?: (...args: unknown[]) => void;
    __TRAILREPLAY_ANALYTICS_ENABLED__?: boolean;
  }
}

function sanitizeParamValue(value: unknown): AnalyticsPrimitive | null {
  if (typeof value === 'string') {
    return value.slice(0, 100);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number(value.toFixed(2));
  }

  if (typeof value === 'boolean') {
    return value;
  }

  return null;
}

export function sanitizeAnalyticsParams(params: Record<string, unknown>): AnalyticsParams {
  const safeParams: AnalyticsParams = {};

  Object.entries(params).forEach(([key, value]) => {
    const safeValue = sanitizeParamValue(value);
    if (safeValue !== null) {
      safeParams[key] = safeValue;
    }
  });

  return safeParams;
}

/**
 * Keep only a small, non-identifying attribution record in first-party storage.
 * Query values are allow-listed and normalized; full URLs and query strings are
 * never persisted or sent to GA4.
 */
export function captureLeadAttribution(): LeadAttribution | null {
  if (typeof window === 'undefined') return null;

  const currentTouch = readAttributionTouch();
  if (!currentTouch) return null;

  let firstTouch = currentTouch;
  try {
    const existing = JSON.parse(window.localStorage.getItem(FIRST_TOUCH_STORAGE_KEY) || 'null') as StoredFirstTouch | null;
    if (existing && existing.expiresAt > Date.now() && isAttributionTouch(existing.touch)) {
      firstTouch = existing.touch;
    } else {
      window.localStorage.setItem(FIRST_TOUCH_STORAGE_KEY, JSON.stringify({
        expiresAt: Date.now() + ATTRIBUTION_TTL_MS,
        touch: currentTouch,
      } satisfies StoredFirstTouch));
    }
  } catch {
    // Storage can be disabled. The current visit can still be attributed in memory.
  }

  let lastTouch = currentTouch;
  try {
    const sessionTouch = JSON.parse(window.sessionStorage.getItem(SESSION_TOUCH_STORAGE_KEY) || 'null') as AttributionTouch | null;
    if (sessionTouch && isAttributionTouch(sessionTouch)) {
      lastTouch = sessionTouch;
    } else {
      window.sessionStorage.setItem(SESSION_TOUCH_STORAGE_KEY, JSON.stringify(currentTouch));
    }
  } catch {
    // Keep the current visit's touch if session storage is unavailable.
  }

  return { firstTouch, lastTouch };
}

function readAttributionTouch(): AttributionTouch | null {
  const params = new URLSearchParams(window.location.search);
  const referrer = getExternalReferrer();
  const aiSource = referrer ? AI_REFERRERS[referrer.host] : undefined;
  const searchSource = referrer && isSearchReferrer(referrer.host) ? referrer.host : undefined;
  const utmSource = normalizeAttributionToken(params.get('utm_source'));
  const source = utmSource || aiSource || searchSource || referrer?.host || 'unknown';
  const medium = normalizeAttributionToken(params.get('utm_medium'))
    || (aiSource ? 'ai-assistant' : searchSource ? 'organic' : referrer ? 'referral' : 'unknown');

  return {
    source,
    medium,
    campaign: normalizeAttributionToken(params.get('utm_campaign')) || '',
    referrerHost: referrer?.host || '',
    landingPage: window.location.pathname.slice(0, 180) || '/',
  };
}

function getExternalReferrer(): { host: string } | null {
  if (!document.referrer) return null;
  try {
    const url = new URL(document.referrer);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const currentHost = window.location.hostname.toLowerCase().replace(/^www\./, '');
    if (!/^https?:$/.test(url.protocol) || host === currentHost) return null;
    return { host: host.slice(0, 120) };
  } catch {
    return null;
  }
}

function isSearchReferrer(host: string): boolean {
  return [...SEARCH_REFERRERS].some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function normalizeAttributionToken(value: string | null): string {
  if (!value) return '';
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 80);
}

function isAttributionTouch(value: unknown): value is AttributionTouch {
  if (!value || typeof value !== 'object') return false;
  const touch = value as Record<string, unknown>;
  return typeof touch.source === 'string'
    && typeof touch.medium === 'string'
    && typeof touch.campaign === 'string'
    && typeof touch.referrerHost === 'string'
    && typeof touch.landingPage === 'string';
}

export function getLeadAttribution(): LeadAttribution | null {
  return captureLeadAttribution();
}

export function getDistanceBucket(distanceMeters: number) {
  const distanceKm = distanceMeters / 1000;
  if (distanceKm < 10) return 'short';
  if (distanceKm < 42) return 'medium';
  if (distanceKm < 80) return 'long';
  return 'ultra';
}

export function getDurationBucket(durationSeconds: number) {
  if (durationSeconds < 30) return 'short';
  if (durationSeconds <= 90) return 'medium';
  return 'long';
}

export function getVideoExportAnalyticsParams(
  settings: VideoExportSettings,
  actualFormat: VideoFormat,
  durationMs: number,
) {
  const durationSeconds = Math.max(0, durationMs) / 1000;

  return {
    export_format: actualFormat,
    export_requested_format: settings.format,
    export_quality: settings.quality,
    export_quality_mode: settings.qualityMode,
    export_fps: settings.fps,
    export_aspect_ratio: settings.aspectRatio,
    export_resolution: `${settings.resolution.width}x${settings.resolution.height}`,
    export_width: settings.resolution.width,
    export_height: settings.resolution.height,
    export_duration_seconds: durationSeconds,
    export_duration_bucket: getDurationBucket(durationSeconds),
  };
}

export function getBlobSizeBucket(sizeBytes: number) {
  const sizeMb = sizeBytes / (1024 * 1024);
  if (sizeMb < 25) return 'small';
  if (sizeMb < 100) return 'medium';
  if (sizeMb < 250) return 'large';
  return 'xlarge';
}

export function getProgressBucket(progressPercent: number) {
  if (progressPercent < 25) return '0_25';
  if (progressPercent < 50) return '25_50';
  if (progressPercent < 75) return '50_75';
  return '75_100';
}

function installAnalyticsQueue() {
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag(...args: unknown[]) {
      void args;
      // GA's recommended bootstrap queue pushes the raw arguments object.
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer?.push(arguments);
    };
  }
}

function loadAnalyticsScript(measurementId: string) {
  if (document.querySelector('script[data-trailreplay-ga="true"]')) return;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  script.dataset.trailreplayGa = 'true';
  document.head.appendChild(script);
}

function bootAnalytics(pageContext: AnalyticsPageContext) {
  if (isInitialized) return true;

  installAnalyticsQueue();
  loadAnalyticsScript(GA4_MEASUREMENT_ID);

  window.gtag?.('js', new Date());
  window.gtag?.('config', GA4_MEASUREMENT_ID, {
    allow_ad_personalization_signals: false,
    allow_google_signals: false,
    debug_mode: GA4_DEBUG_MODE,
    send_page_view: false,
  });

  window.gtag?.('event', 'page_view', {
    page_title: document.title,
    page_location: window.location.href,
    page_path: `${window.location.pathname}${window.location.search}`,
    app_name: 'TrailReplay',
    ...pageContext,
  });

  window.__TRAILREPLAY_ANALYTICS_ENABLED__ = true;
  isInitialized = true;
  return true;
}

export function initAnalytics(pageContext: AnalyticsPageContext = DEFAULT_PAGE_CONTEXT) {
  if (typeof window === 'undefined') return false;
  if (!shouldEnableAnalytics()) return false;

  if (isInitialized || pendingInitialization) return true;

  if (document.readyState === 'loading') {
    pendingInitialization = true;
    document.addEventListener('DOMContentLoaded', () => {
      pendingInitialization = false;
      bootAnalytics(pageContext);
    }, { once: true });
    return true;
  }

  return bootAnalytics(pageContext);
}

export function trackEvent(eventName: string, parameters: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return;
  if (!shouldEnableAnalytics() || typeof window.gtag !== 'function') return;

  window.gtag('event', eventName, {
    ...sanitizeAnalyticsParams(parameters),
    app_name: 'TrailReplay',
  });
}
