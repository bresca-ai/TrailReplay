import type { TransportMode } from '@/types';
import { createElement } from 'react';
import { is3DActivityIcon, renderActivityIcon, SVG_ACTIVITY_ICON_VALUES } from '@/utils/activityIcons';
import { TRANSPORT_MARKERS } from '@/utils/journeyUtils';
import { Car, Bus, Train, Plane, Bike, Ship, Footprints, Camera } from 'lucide-react';

export const TRANSPORT_MODES: { mode: TransportMode; icon: typeof Car; labelKey: string; color: string }[] = [
  { mode: 'car', icon: Car, labelKey: 'stats.transportLabels.car', color: '#3B82F6' },
  { mode: 'bus', icon: Bus, labelKey: 'stats.transportLabels.bus', color: '#8B5CF6' },
  { mode: 'train', icon: Train, labelKey: 'stats.transportLabels.train', color: '#10B981' },
  { mode: 'plane', icon: Plane, labelKey: 'stats.transportLabels.plane', color: '#06B6D4' },
  { mode: 'bike', icon: Bike, labelKey: 'stats.transportLabels.bike', color: '#F59E0B' },
  { mode: 'walk', icon: Footprints, labelKey: 'stats.transportLabels.walk', color: '#EC4899' },
  { mode: 'camera', icon: Camera, labelKey: 'stats.transportLabels.camera', color: '#6366F1' },
  { mode: 'ferry', icon: Ship, labelKey: 'stats.transportLabels.ferry', color: '#6366F1' },
];

export function renderJourneyTransportIcon(mode: TransportMode, size = 24, color?: string) {
  const option = TRANSPORT_MODES.find((entry) => entry.mode === mode);
  if (mode === 'bike' || mode === 'walk') {
    return renderActivityIcon(mode === 'bike' ? SVG_ACTIVITY_ICON_VALUES.biking : SVG_ACTIVITY_ICON_VALUES.walking, {
      size, color: color ?? option?.color,
    });
  }
  return createElement(option?.icon ?? Car, { size, color: color ?? option?.color });
}

/** Match the marker used during playback, including the route's dot setting. */
export function renderJourneyTransportPreview(mode: TransportMode, size: number, color: string, markerType: 'dot' | 'icon') {
  if (mode === 'camera') return createElement(Camera, { size: Math.round(size * 0.5), color });
  const marker = TRANSPORT_MARKERS[mode] ?? TRANSPORT_MARKERS.car;
  if (markerType === 'dot' && !is3DActivityIcon(marker)) {
    const dotSize = Math.round(size * 0.42);
    return createElement('span', { 'aria-hidden': true, style: { display: 'block', width: dotSize, height: dotSize, borderRadius: '50%', backgroundColor: color, border: '2px solid white', boxShadow: '0 2px 6px #0004' } });
  }
  return renderActivityIcon(marker, { size, color });
}
