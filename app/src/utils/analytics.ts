import { GA4_DEBUG_MODE, GA4_MEASUREMENT_ID, shouldEnableAnalytics } from '@/config/analytics';
import type { CameraSettings, VideoExportSettings, VideoFormat } from '@/types';

let isInitialized = false;
let pendingInitialization = false;
let eventSequence = 0;
let activePageContext: AnalyticsPageContext;
const pendingEvents: Array<[string, Record<string, unknown>]> = [];

type AnalyticsPrimitive = string | number | boolean;
type AnalyticsParams = Record<string, AnalyticsPrimitive>;

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

/** A snapshot of settings actually used, including defaults that were never changed. */
export function getCameraUsageAnalyticsParams(camera: CameraSettings) {
  const stability = Math.max(0, Math.min(1, camera.cameraStability));
  const zoom = Math.max(0, Math.min(100, camera.followBehindZoomLevel));

  return {
    camera_stability_bucket: camera.mode === 'overview' ? 'not_applicable'
      : stability < 0.35 ? 'stable' : stability > 0.65 ? 'reactive' : 'balanced',
    // This is the follow-behind distance slider, not the map's transient zoom.
    camera_zoom_bucket: camera.mode === 'follow-behind'
      ? zoom < 25 ? 'far' : zoom < 50 ? 'medium_far' : zoom < 75 ? 'medium_close' : 'close'
      : 'not_applicable',
  };
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

export function safeAnalyticsUrl(value: string) {
  const url = new URL(value);
  url.hash = '';
  // Retain acquisition attribution, never application query strings or tokens.
  for (const key of [...url.searchParams.keys()]) {
    if (!['utm_source', 'utm_medium', 'utm_campaign', 'utm_id', 'utm_term', 'utm_content', 'gclid', 'dclid'].includes(key)) url.searchParams.delete(key);
  }
  return url.href;
}

function bootAnalytics(pageContext: AnalyticsPageContext) {
  if (isInitialized) return true;

  activePageContext = pageContext;
  installAnalyticsQueue();
  loadAnalyticsScript(GA4_MEASUREMENT_ID);

  window.gtag?.('js', new Date());
  window.gtag?.('config', GA4_MEASUREMENT_ID, {
    allow_ad_personalization_signals: false,
    allow_google_signals: false,
    debug_mode: GA4_DEBUG_MODE,
    send_page_view: false,
    page_location: safeAnalyticsUrl(window.location.href),
    page_referrer: document.referrer ? safeAnalyticsUrl(document.referrer) : '',
  });

  window.gtag?.('event', 'page_view', {
    page_title: document.title,
    page_location: safeAnalyticsUrl(window.location.href),
    page_path: window.location.pathname,
    app_name: 'TrailReplay',
    ...pageContext,
  });

  window.__TRAILREPLAY_ANALYTICS_ENABLED__ = true;
  isInitialized = true;
  for (const [name, params] of pendingEvents.splice(0)) trackEvent(name, params);
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
  if (typeof window === 'undefined' || !shouldEnableAnalytics()) return;
  if (!isInitialized) {
    if (pendingEvents.length < 100) pendingEvents.push([eventName, { ...parameters }]);
    return;
  }
  const commonParams = {
    app_name: 'TrailReplay',
    page_type: activePageContext.page_type,
    analytics_version: 2,
    event_sequence: ++eventSequence,
  };
  const params = sanitizeAnalyticsParams({ ...commonParams, ...parameters, ...commonParams });
  // GA4 accepts 25 parameters per event. Reserve common fields first.
  if (Object.keys(params).length > 25 && GA4_DEBUG_MODE) {
    console.warn(`Analytics parameter budget exceeded: ${eventName}`);
  }
  window.gtag?.('event', eventName, Object.fromEntries(Object.entries(params).slice(0, 25)));
}
