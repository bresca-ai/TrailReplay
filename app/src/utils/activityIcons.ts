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
  kind: 'emoji' | 'svg';
  content: string;
};

const svgIconBasePath = '/media/images/activity-icons';

export const ACTIVITY_ICONS: ActivityIconOption[] = [
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
  return activityIconMap.get(value);
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

  if (icon?.kind === 'svg') {
    return createElement('span', {
      role: 'img',
      'aria-label': '',
      'aria-hidden': true,
      className,
      style: svgMaskStyle(size, color, icon.content),
    });
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

  if (icon?.kind === 'svg') {
    return `<span aria-hidden="true" style="width:${size}px;height:${size}px;display:block;background-color:${escapeHtml(color)};mask-image:url('${escapeHtml(icon.content)}');mask-repeat:no-repeat;mask-position:center;mask-size:contain;-webkit-mask-image:url('${escapeHtml(icon.content)}');-webkit-mask-repeat:no-repeat;-webkit-mask-position:center;-webkit-mask-size:contain;position:relative;z-index:10;"></span>`;
  }

  return `<span style="width:${size}px;height:${size}px;display:inline-flex;align-items:center;justify-content:center;font-size:${size}px;line-height:1;position:relative;z-index:10;">${escapeHtml(icon?.content ?? value)}</span>`;
}
