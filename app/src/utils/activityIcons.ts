import { Marker3DThumbnail } from '@/components/sidebar/Marker3DThumbnail';
import { CUSTOM_ANIMATION_PREFIX, CUSTOM_MODEL_PREFIX, customAnimationKey, getCustomAnimation } from './customMarker';
import { createElement } from 'react';
import type { CSSProperties, ReactElement } from 'react';

export const SVG_ACTIVITY_ICON_VALUES = {
  walking: 'svg-walking',
  running: 'svg-running',
  biking: 'svg-biking',
  swimming: 'svg-swimming',
} as const;

export const DEFAULT_ACTIVITY_ICON = SVG_ACTIVITY_ICON_VALUES.walking;

type ActivityIconOption = {
  value: string;
  labelKey: string;
  kind: 'emoji' | 'svg' | 'animated' | 'upload' | '3d';
  label?: string;
  content: string;
};

const svgIconBasePath = '/media/images/activity-icons';

export const RUNNER_3D_ICON = '3d-runner';
export const MODEL_3D_ICONS = [RUNNER_3D_ICON, '3d-motorbike', '3d-motocross', '3d-race-motorbike', '3d-paraglider', '3d-race-car', '3d-rally', '3d-road-runner', '3d-trail-runner', '3d-hiker', '3d-swimmer', '3d-road-bike', '3d-gravel-bike', '3d-mountain-bike'] as const;
export function is3DActivityIcon(value: string): boolean { return value.startsWith(CUSTOM_MODEL_PREFIX) || (MODEL_3D_ICONS as readonly string[]).includes(value); }

export const ACTIVITY_ICONS: ActivityIconOption[] = [
  { value: RUNNER_3D_ICON, labelKey: 'activities.runner', label: 'Runner', kind: '3d', content: '/media/images/animated-markers/runner-steady.svg' },
  { value: '3d-road-runner', labelKey: 'activities.running', label: 'Road runner', kind: '3d', content: '/media/images/animated-markers/runner-steady.svg' },
  { value: '3d-trail-runner', labelKey: 'activities.running', label: 'Trail runner', kind: '3d', content: '/media/images/animated-markers/runner-steady.svg' },
  { value: '3d-hiker', labelKey: 'activities.hiking', label: 'Hiker', kind: '3d', content: '/media/images/animated-markers/hiker-steady.svg' },
  { value: '3d-swimmer', labelKey: 'activities.swimming', label: 'Swimmer', kind: '3d', content: '/media/images/animated-markers/swimmer-steady.svg' },
  { value: '3d-road-bike', labelKey: 'activities.cycling', label: 'Road cyclist', kind: '3d', content: '/media/images/animated-markers/cyclist-steady.svg' },
  { value: '3d-gravel-bike', labelKey: 'activities.cycling', label: 'Gravel cyclist', kind: '3d', content: '/media/images/animated-markers/cyclist-steady.svg' },
  { value: '3d-mountain-bike', labelKey: 'activities.cycling', label: 'Mountain biker', kind: '3d', content: '/media/images/animated-markers/cyclist-steady.svg' },
  { value: '3d-motorbike', labelKey: 'activities.motorcycle', label: 'Motorbike', kind: '3d', content: '/media/images/animated-markers/motorbike-steady.svg' },
  { value: '3d-motocross', labelKey: 'activities.motorcycle', label: 'Motocross', kind: '3d', content: '/media/images/animated-markers/motorbike-steady.svg' },
  { value: '3d-race-motorbike', labelKey: 'activities.motorcycle', label: 'Race motorbike', kind: '3d', content: '/media/images/animated-markers/motorbike-steady.svg' },
  { value: '3d-paraglider', labelKey: 'activities.paragliding', label: 'Paraglider', kind: '3d', content: '/media/images/animated-markers/runner-steady.svg' },
  { value: '3d-race-car', labelKey: 'activities.car', label: 'Race car', kind: '3d', content: '/media/images/animated-markers/race-car-steady.svg' },
  { value: '3d-rally', labelKey: 'activities.car', label: 'Rally car', kind: '3d', content: '/media/images/animated-markers/rally-steady.svg' },
  { value: 'animated-runner-steady', labelKey: 'activities.running', label: 'Runner Steady', kind: 'animated', content: '/media/images/animated-markers/runner-steady.svg' },
  { value: 'animated-runner-tired', labelKey: 'activities.running', label: 'Runner Tired', kind: 'animated', content: '/media/images/animated-markers/runner-tired.svg' },
  { value: 'animated-runner-finish', labelKey: 'activities.running', label: 'Runner Finish', kind: 'animated', content: '/media/images/animated-markers/runner-finish.svg' },
  { value: 'animated-hiker-steady', labelKey: 'activities.hiking', label: 'Hiker Steady', kind: 'animated', content: '/media/images/animated-markers/hiker-steady.svg' },
  { value: 'animated-hiker-tired', labelKey: 'activities.hiking', label: 'Hiker Tired', kind: 'animated', content: '/media/images/animated-markers/hiker-tired.svg' },
  { value: 'animated-hiker-summit', labelKey: 'activities.hiking', label: 'Hiker Summit', kind: 'animated', content: '/media/images/animated-markers/hiker-summit.svg' },
  { value: 'animated-cyclist-steady', labelKey: 'activities.cycling', label: 'Cyclist Steady', kind: 'animated', content: '/media/images/animated-markers/cyclist-steady.svg' },
  { value: 'animated-cyclist-tired', labelKey: 'activities.cycling', label: 'Cyclist Tired', kind: 'animated', content: '/media/images/animated-markers/cyclist-tired.svg' },
  { value: 'animated-cyclist-finish', labelKey: 'activities.cycling', label: 'Cyclist Finish', kind: 'animated', content: '/media/images/animated-markers/cyclist-finish.svg' },
  { value: 'animated-swimmer-steady', labelKey: 'activities.swimming', label: 'Swimmer Steady', kind: 'animated', content: '/media/images/animated-markers/swimmer-steady.svg' },
  { value: 'animated-swimmer-tired', labelKey: 'activities.swimming', label: 'Swimmer Tired', kind: 'animated', content: '/media/images/animated-markers/swimmer-tired.svg' },
  { value: 'animated-swimmer-finish', labelKey: 'activities.swimming', label: 'Swimmer Finish', kind: 'animated', content: '/media/images/animated-markers/swimmer-finish.svg' },
  { value: 'animated-skier-steady', labelKey: 'activities.skiing', label: 'Skier Steady', kind: 'animated', content: '/media/images/animated-markers/skier-steady.svg' },
  { value: 'animated-snowboarder-steady', labelKey: 'activities.snowboard', label: 'Snowboarder Steady', kind: 'animated', content: '/media/images/animated-markers/snowboarder-steady.svg' },
  { value: 'animated-offroad-bike-steady', labelKey: 'activities.cycling', label: 'Offroad Bike Steady', kind: 'animated', content: '/media/images/animated-markers/offroad-bike-steady.svg' },
  { value: 'animated-motorbike-steady', labelKey: 'activities.motorcycle', label: 'Motorbike Steady', kind: 'animated', content: '/media/images/animated-markers/motorbike-steady.svg' },
  { value: 'animated-rally-steady', labelKey: 'activities.car', label: 'Rally Steady', kind: 'animated', content: '/media/images/animated-markers/rally-steady.svg' },
  { value: 'animated-race-car-steady', labelKey: 'activities.car', label: 'Race Car Steady', kind: 'animated', content: '/media/images/animated-markers/race-car-steady.svg' },

  { value: SVG_ACTIVITY_ICON_VALUES.walking, labelKey: 'activities.walking', kind: 'svg', content: `${svgIconBasePath}/walking.svg` },
  { value: SVG_ACTIVITY_ICON_VALUES.running, labelKey: 'activities.running', kind: 'svg', content: `${svgIconBasePath}/running.svg` },
  { value: SVG_ACTIVITY_ICON_VALUES.biking, labelKey: 'activities.cycling', kind: 'svg', content: `${svgIconBasePath}/biking.svg` },
  { value: SVG_ACTIVITY_ICON_VALUES.swimming, labelKey: 'activities.swimming', kind: 'svg', content: `${svgIconBasePath}/swimming.svg` },
  { value: '🏃', labelKey: 'activities.running', kind: 'emoji', content: '🏃' },
  { value: '🏃‍♂️', labelKey: 'activities.runner', kind: 'emoji', content: '🏃‍♂️' },
  { value: '🚴', labelKey: 'activities.cycling', kind: 'emoji', content: '🚴' },
  { value: '🚴‍♂️', labelKey: 'activities.cyclist', kind: 'emoji', content: '🚴‍♂️' },
  { value: '🥾', labelKey: 'activities.hiking', kind: 'emoji', content: '🥾' },
  { value: '🚶', labelKey: 'activities.walking', kind: 'emoji', content: '🚶' },
  { value: '🚶‍♂️', labelKey: 'activities.walker', kind: 'emoji', content: '🚶‍♂️' },
  { value: '⛷️', labelKey: 'activities.skiing', kind: 'emoji', content: '⛷️' },
  { value: '🏊', labelKey: 'activities.swimming', kind: 'emoji', content: '🏊' },
  { value: '🧗', labelKey: 'activities.climbing', kind: 'emoji', content: '🧗' },
  { value: '🏇', labelKey: 'activities.horse', kind: 'emoji', content: '🏇' },
  { value: '🛶', labelKey: 'activities.kayak', kind: 'emoji', content: '🛶' },
  { value: '🛹', labelKey: 'activities.skate', kind: 'emoji', content: '🛹' },
  { value: '🎿', labelKey: 'activities.ski', kind: 'emoji', content: '🎿' },
  { value: '🏂', labelKey: 'activities.snowboard', kind: 'emoji', content: '🏂' },
  { value: '🏍️', labelKey: 'activities.motorcycle', kind: 'emoji', content: '🏍️' },
  { value: '🚗', labelKey: 'activities.car', kind: 'emoji', content: '🚗' },
  { value: '✈️', labelKey: 'activities.plane', kind: 'emoji', content: '✈️' },
  { value: '🚂', labelKey: 'activities.train', kind: 'emoji', content: '🚂' },
];

const activityIconMap = new Map(ACTIVITY_ICONS.map((icon) => [icon.value, icon]));

// Inline the SVG so its primary ink can follow the route while CSS animation remains live.
const animatedSvgSources = import.meta.glob<string>('../assets/animated-markers/*.svg', { eager: true, query: '?raw', import: 'default' });
const coloredSvgCache = new Map<string, string>();
export function animatedIconUrl(url: string, color: string): string {
  if (url.startsWith('data:image/svg+xml,') && /^#[0-9a-f]{6}$/i.test(color)) {
    return url.replace(/%23C1652F/gi, `%23${color.slice(1)}`);
  }
  const name = url.split('/').pop();
  const svg = animatedSvgSources[`../assets/animated-markers/${name}`];
  if (!svg || !/^#[0-9a-f]{6}$/i.test(color)) return url;
  const key = `${name}:${color.toLowerCase()}`;
  let result = coloredSvgCache.get(key);
  if (!result) {
    result = `data:image/svg+xml,${encodeURIComponent(svg.replaceAll('#C1652F', color))}`;
    if (coloredSvgCache.size >= 100) coloredSvgCache.delete(coloredSvgCache.keys().next().value!);
    coloredSvgCache.set(key, result);
  }
  return result;
}


function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function iconFrameStyle(size: number): CSSProperties {
  return {
    width: size,
    height: size,
    display: 'block',
    objectFit: 'contain',
  };
}

function svgMaskStyle(size: number, color: string, url: string): CSSProperties {
  return {
    width: size,
    height: size,
    display: 'block',
    backgroundColor: color,
    maskImage: `url(${url})`,
    maskRepeat: 'no-repeat',
    maskPosition: 'center',
    maskSize: 'contain',
    WebkitMaskImage: `url(${url})`,
    WebkitMaskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    WebkitMaskSize: 'contain',
  };
}

export function getActivityIconOption(value: string): ActivityIconOption | undefined {
  if (value.startsWith(CUSTOM_MODEL_PREFIX)) return { value, labelKey: '', kind: '3d', content: '/media/images/animated-markers/runner-steady.svg' };
  if (value.startsWith(CUSTOM_ANIMATION_PREFIX)) { const animation = getCustomAnimation(value); if (animation) return { value, labelKey: '', kind: 'animated', content: animation.svg }; }
  if (value.startsWith('data:image/png;base64,')) return { value, labelKey: '', kind: 'upload', content: value };
  return activityIconMap.get(value);
}

export function getActivityIconBackingUrl(value: string): string | undefined {
  const icon = getActivityIconOption(value);
  return icon?.kind === 'svg' ? icon.content.replace(/\.svg$/, '-backing.svg') : undefined;
}

function svgBackingStyle(size: number, url: string): CSSProperties {
  return {
    width: size,
    height: size,
    display: 'block',
    backgroundImage: `url("${url}")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center',
    backgroundSize: 'contain',
  };
}

export function isSvgActivityIcon(value: string): boolean {
  return getActivityIconOption(value)?.kind === 'svg';
}

export function renderActivityIcon(
  value: string,
  options: { size?: number; className?: string; color?: string } = {},
): ReactElement {
  const { size = 24, className, color = 'currentColor' } = options;
  const icon = getActivityIconOption(value);

  if (icon?.kind === '3d') {
    const src = (MODEL_3D_ICONS as readonly string[]).includes(value)
      ? `/media/images/3d-marker-previews/${value.slice(3)}.png?v=3` : undefined;
    return createElement(Marker3DThumbnail, { value, src, color, size, className });
  }

  if (icon?.kind === 'animated' || icon?.kind === 'upload') {
    return createElement('img', { src: icon.kind === 'upload' ? icon.content : animatedIconUrl(icon.content, color), alt: '', 'aria-hidden': true, className, style: iconFrameStyle(size) });
  }

  if (icon?.kind === 'svg') {
    return createElement('span', {
      role: 'img',
      'aria-label': '',
      'aria-hidden': true,
      className,
      style: svgBackingStyle(size, getActivityIconBackingUrl(value)!),
    }, createElement('span', {
      style: svgMaskStyle(size, color, icon.content),
    }));
  }

  return createElement(
    'span',
    {
      'aria-hidden': true,
      className,
      style: {
        ...iconFrameStyle(size),
        alignItems: 'center',
        display: 'inline-flex',
        color,
        fontSize: size,
        justifyContent: 'center',
        lineHeight: 1,
      } satisfies CSSProperties,
    },
    icon?.content ?? value,
  );
}

// Apply to a wrapper: a filter on the masked span itself is clipped by its mask.
// Share the same silhouette treatment with the canvas exporter (scaled to output).
export function markerIconContrastFilter(scale = 1): string {
  const edge = 0.75 * scale;
  return `drop-shadow(${edge}px 0 0 white) drop-shadow(${-edge}px 0 0 white) drop-shadow(0 ${edge}px 0 white) drop-shadow(0 ${-edge}px 0 white) drop-shadow(0 ${2 * scale}px ${3 * scale}px rgba(0,0,0,0.65))`;
}

export function getActivityIconMarkerHtml(value: string, size: number, color: string): string {
  const icon = getActivityIconOption(value);

  if (icon?.kind === '3d') {
    return `<span data-runner-3d style="width:${size}px;height:${size}px;display:block;position:relative;"><canvas aria-hidden="true" style="position:absolute;bottom:15%;left:50%;transform:translateX(-50%);width:200%;height:200%;"></canvas></span>`;
  }

  if (icon?.kind === 'animated' && value.startsWith(CUSTOM_ANIMATION_PREFIX)) {
    return `<span data-custom-animation="${customAnimationKey(value)}" data-marker-color="${escapeHtml(color)}" data-animated-icon="${escapeHtml(icon.content)}" style="width:${size}px;height:${size}px;display:block;"><img src="${escapeHtml(animatedIconUrl(icon.content, color))}" alt="" style="width:100%;height:100%;object-fit:contain;"></span>`;
  }

  if (icon?.kind === 'animated' || icon?.kind === 'upload') {
    return `<span data-animated-icon="${escapeHtml(icon.content)}" data-marker-color="${escapeHtml(color)}" style="width:${size}px;height:${size}px;display:block;"><img src="${escapeHtml(icon.kind === 'animated' ? animatedIconUrl(icon.content, color) : icon.content)}" alt="" style="width:100%;height:100%;object-fit:contain;"></span>`;
  }

  if (icon?.kind === 'svg') {
    return `<div style="width:${size}px;height:${size}px;background-image:url('${escapeHtml(getActivityIconBackingUrl(value)!)}');background-repeat:no-repeat;background-position:center;background-size:contain;"><span data-icon-backing="${escapeHtml(getActivityIconBackingUrl(value)!)}" aria-hidden="true" style="width:${size}px;height:${size}px;display:block;background-color:${escapeHtml(color)};mask-image:url('${escapeHtml(icon.content)}');mask-repeat:no-repeat;mask-position:center;mask-size:contain;-webkit-mask-image:url('${escapeHtml(icon.content)}');-webkit-mask-repeat:no-repeat;-webkit-mask-position:center;-webkit-mask-size:contain;position:relative;z-index:10;"></span></div>`;
  }

  return `<span style="width:${size}px;height:${size}px;display:inline-flex;align-items:center;justify-content:center;font-size:${size}px;line-height:1;position:relative;z-index:10;">${escapeHtml(icon?.content ?? value)}</span>`;
}

export function isSingleEmoji(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || !/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(trimmed)) return false;
  return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(trimmed)].length === 1;
}


export function resolvePlaybackMarkerColor(
  configuredMarkerColor: string,
  activeTrackColor: string | null | undefined,
  currentTrackColor: string | null | undefined,
): string {
  const markerFollowsTrackColors = !!activeTrackColor
    && configuredMarkerColor.toLowerCase() === activeTrackColor.toLowerCase();
  return markerFollowsTrackColors && currentTrackColor
    ? currentTrackColor
    : configuredMarkerColor;
}
