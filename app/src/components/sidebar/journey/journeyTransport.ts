import type { TransportMode } from '@/types';
import { createElement } from 'react';
import { renderActivityIcon, SVG_ACTIVITY_ICON_VALUES } from '@/utils/activityIcons';
import { Car, Bus, Train, Plane, Bike, Ship, Footprints } from 'lucide-react';

export const TRANSPORT_MODES: { mode: TransportMode; icon: typeof Car; labelKey: string; color: string }[] = [
  { mode: 'car', icon: Car, labelKey: 'stats.transportLabels.car', color: '#3B82F6' },
  { mode: 'bus', icon: Bus, labelKey: 'stats.transportLabels.bus', color: '#8B5CF6' },
  { mode: 'train', icon: Train, labelKey: 'stats.transportLabels.train', color: '#10B981' },
  { mode: 'plane', icon: Plane, labelKey: 'stats.transportLabels.plane', color: '#06B6D4' },
  { mode: 'bike', icon: Bike, labelKey: 'stats.transportLabels.bike', color: '#F59E0B' },
  { mode: 'walk', icon: Footprints, labelKey: 'stats.transportLabels.walk', color: '#EC4899' },
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
