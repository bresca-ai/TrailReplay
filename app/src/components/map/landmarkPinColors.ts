import type { RouteLandmark } from '@/types/landmarks';

const WATER_TYPES = new Set<RouteLandmark['type']>(['lake', 'water', 'waterfall', 'river-crossing']);
const NATURAL_TYPES = new Set<RouteLandmark['type']>(['summit', 'high-point', 'highest-point', 'viewpoint', 'pass', 'camp']);

/** Use separate hues for water and land, while respecting a chosen pin color. */
export function landmarkPinColors(landmark: Pick<RouteLandmark, 'type' | 'color'>) {
  const water = WATER_TYPES.has(landmark.type);
  const natural = NATURAL_TYPES.has(landmark.type);
  return {
    pin: landmark.color ?? (water ? '#1674c5' : natural ? '#1a9f6c' : '#788f9a'),
    label: water ? '#b4ddff' : natural ? '#bfe2bd' : '#ffffff',
  };
}
