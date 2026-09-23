import type { RouteLandmark, LandmarkType } from '@/types/landmarks';

// Pinhead map icons (CC0): https://github.com/waysidemapping/pinhead
// Kept locally as path data so map rendering has no runtime icon requests.
export const PINHEAD_PATHS: Record<string, string> = {
  summit: 'm5 1l2 3l3.5-1.5L14.97 13H0z',
  waypoint: 'M3 14H1.5C.67 14 0 13.33 0 12.5V6.7l2.2-5.17c.14-.32.45-.53.8-.53s.66.21.8.53L7 9l.5 1.5c.81.64.98 1.14.5 1.5s-2.14 1.03-5 2m6 0l1-1c1.29-1.29.51-2.28-2.35-2.96L8 9l3.2-7.47c.14-.32.45-.53.8-.53s.66.21.8.53L15 6.7v5.8c0 .83-.67 1.5-1.5 1.5zM3 2.25L1 7l2-1l1 2l1-1zm9 0L10 7l2-1l1 2l1-1z',
  viewpoint: 'M11 2.5C12 4 12 4 12.5 5.34c.5 1.16.5 5.16.5 5.16c0 .5-4 .5-4 0v-1c0-.5-.5-1-.5-1.5v-.5h-2V8c0 .5-.5 1-.5 1.5v1c0 .5-4 .5-4 0c0 0 0-4 .5-5.16C3 4 3 4 4 2.5c0-.5 2-.5 2 0v1h3v-1c0-.5 2-.5 2 0m-8.5 9C1 11.5 1 14 2.5 14h3c1.5 0 1.5-2.5 0-2.5zm7 0C8 11.5 8 14 9.5 14h3c1.5 0 1.5-2.5 0-2.5zM4.5 1c-.75 0-.75 1 0 1h1c.75 0 .75-1 0-1zm5 0c-.75 0-.75 1 0 1h1c.75 0 .75-1 0-1z',
  town: 'M10.651 6.121a.25.25 0 0 0-.314 0L8.092 7.929A.25.25 0 0 0 8 8.122v4.625a.253.253 0 0 0 .253.253h1.494a.253.253 0 0 0 .253-.253V11h1v1.747a.253.253 0 0 0 .253.253h1.494a.253.253 0 0 0 .253-.253V8.12a.25.25 0 0 0-.094-.2zM10 10H9V9h1zm2 0h-1V9h1zM5.71.815a.252.252 0 0 0-.42 0L2.042 4.936a.25.25 0 0 0-.042.14v7.671a.25.25 0 0 0 .251.253h2.5A.25.25 0 0 0 5 12.748V11h1v1.748a.25.25 0 0 0 .252.252H7V7a.5.5 0 0 1 .188-.391L9 5C9 4.95 5.71.815 5.71.815M4 9H3V8h1zm0-3H3V5h1zm2 3H5V8h1zm0-3H5V5h1z',
  water: 'M12 5c.67 1.33 1.42 2 2.25 2c.26 0 .51-.06.75-.19v3.05c-.24.09-.49.14-.75.14Q13.005 10 12 8.5Q10.995 10 9.75 10T7.5 8.5Q6.495 10 5.25 10T3 8.5Q1.995 10 .75 10c-.26 0-.51-.05-.75-.14V6.81c.24.13.49.19.75.19c.83 0 1.58-.67 2.25-2c.67 1.33 1.42 2 2.25 2s1.58-.67 2.25-2c.67 1.33 1.42 2 2.25 2s1.58-.67 2.25-2',
  waterfall: 'M0 3h1c1.09 0 3 .3 3 1.75v3.5c0 2 1.5 3 2.5 3l-.04-.09C6.34 10.87 6 9.9 6 8.25v-3.5C6 3.84 5.35 3.44 5 3c1.09 0 2 .3 2 1.75v3.5c0 2 1.5 3 2.5 3l-.04-.09C9.34 10.87 9 9.9 9 8.25l.1-3.5C9.14 3.84 8.35 3.44 8 3c1.09 0 2 .3 2 1.75v3.5c0 2 1.5 3 2.5 3l-.04-.09c-.12-.29-.46-1.26-.46-2.91v-3.5C12 1.83 9.16 1.04 8.09 1H0zm6.3 11.56l.31-.25a1.44 1.44 0 0 1 1.78 0l.31.25c.36.28.8.44 1.25.44h.1c.45 0 .89-.16 1.25-.44l.31-.25a1.44 1.44 0 0 1 1.78 0l.32.25c.35.28.78.44 1.24.44H15v-2h-.05c-.46 0-.89-.16-1.24-.44l-.32-.25a1.44 1.44 0 0 0-1.78 0l-.31.25c-.36.28-.8.44-1.25.44h-.1c-.45 0-.89-.16-1.25-.44l-.31-.25a1.44 1.44 0 0 0-1.78 0l-.31.25c-.36.28-.8.44-1.25.44h-.1c-.45 0-.89-.16-1.25-.44l-.31-.25a1.44 1.44 0 0 0-1.78 0l-.32.25c-.35.28-.78.44-1.24.44H0v2h.05c.46 0 .89-.16 1.24-.44l.32-.25a1.44 1.44 0 0 1 1.78 0l.31.25c.36.28.8.44 1.25.44h.1c.4 0 .78-.12 1.11-.34z',
  shelter: 'M13.59 6.19c.78.57.38 1.81-.59 1.81v1c.55 0 1 .45 1 1s-.45 1-1 1v1c.55 0 1 .45 1 1s-.45 1-1 1H9v-4H6v4H2c-.55 0-1-.45-1-1s.45-1 1-1v-1c-.55 0-1-.45-1-1s.45-1 1-1V8c-.97 0-1.37-1.24-.59-1.81l5.5-4c.35-.25.83-.25 1.18 0zM3 8v1h9V8zm9 3h-2v1h2zm-9 0v1h2v-1zm4.5-6.76L5.08 6h4.84z',
  camp: 'M14 10.5v1c0 .28-.22.5-.5.5h-12c-.28 0-.5-.22-.5-.5v-1c0-.28.22-.5.5-.5h.75l4.78-8.74c.22-.35.72-.35.94 0L12.75 10h.75c.25 0 .45.18.49.41zm-4-.5L7.5 5L5 10z',
  'aid-station': 'M11.57 9.75C11.89 9.43 12.43 9.21 12.96 9.21C14.14 9.21 15 10.18 15 11.25L15 11.36L15 11.36C15 11.79 14.79 12.32 14.46 13.07C14.46 13.07 13.93 14.14 13.39 14.68L13.39 14.68C13.18 14.89 12.86 15 12.54 15C12.11 15 11.79 14.79 11.57 14.46L11.57 14.46C11.36 14.79 10.93 15 10.61 15C10.29 15 9.96 14.89 9.75 14.68L9.75 14.68C9.32 14.14 8.68 13.07 8.68 13.07C8.36 12.43 8.25 11.89 8.14 11.36L8.14 11.36L8.14 11.25C8.14 10.07 9.11 9.21 10.18 9.21C10.61 9.21 11.14 9.43 11.57 9.75ZM5.36 2.14L2.14 2.14L1.07 3.21L0 3.21L0 15L6.43 15L6.43 3.21L5.36 2.14ZM2.14 7.5L1.07 7.5L1.07 4.29L2.14 4.29L2.14 7.5ZM2.14 0H5.36V1.07H2.14V0ZM10.71 8.57L10.71 7.5L11.79 6.43L12.86 5.36L13.93 5.36L13.93 6.43L11.79 8.57Z',
  jug_and_apple: 'M11.57 9.75C11.89 9.43 12.43 9.21 12.96 9.21C14.14 9.21 15 10.18 15 11.25L15 11.36L15 11.36C15 11.79 14.79 12.32 14.46 13.07C14.46 13.07 13.93 14.14 13.39 14.68L13.39 14.68C13.18 14.89 12.86 15 12.54 15C12.11 15 11.79 14.79 11.57 14.46L11.57 14.46C11.36 14.79 10.93 15 10.61 15C10.29 15 9.96 14.89 9.75 14.68L9.75 14.68C9.32 14.14 8.68 13.07 8.68 13.07C8.36 12.43 8.25 11.89 8.14 11.36L8.14 11.36L8.14 11.25C8.14 10.07 9.11 9.21 10.18 9.21C10.61 9.21 11.14 9.43 11.57 9.75ZM5.36 2.14L2.14 2.14L1.07 3.21L0 3.21L0 15L6.43 15L6.43 3.21L5.36 2.14ZM2.14 7.5L1.07 7.5L1.07 4.29L2.14 4.29L2.14 7.5ZM2.14 0H5.36V1.07H2.14V0ZM10.71 8.57L10.71 7.5L11.79 6.43L12.86 5.36L13.93 5.36L13.93 6.43L11.79 8.57Z',
  pin: 'm7.5 15l.54-.79C11.01 9.81 12.5 6.74 12.5 5c0-2.76-2.24-5-5-5s-5 2.24-5 5c0 1.84 1.67 5.17 5 10',
};

/** Every glyph a landmark can be drawn with, in picker order. */
export const LANDMARK_GLYPH_KEYS = [
  'pin', 'summit', 'viewpoint', 'waypoint', 'town', 'shelter', 'camp', 'aid-station', 'water', 'waterfall',
] as const;

export type LandmarkGlyph = (typeof LANDMARK_GLYPH_KEYS)[number];

/** Human label for the icon picker; the glyph keys are drawing names, not places. */
export const LANDMARK_GLYPH_LABELS: Record<LandmarkGlyph, string> = {
  pin: 'Pin',
  summit: 'Peak',
  viewpoint: 'Viewpoint',
  waypoint: 'Signpost',
  town: 'Town',
  shelter: 'Hut',
  camp: 'Camp',
  'aid-station': 'Aid station · apple and water',
  water: 'Water',
  waterfall: 'Waterfall',
};

export function isLandmarkGlyph(value: string | undefined): value is LandmarkGlyph {
  return !!value && (LANDMARK_GLYPH_KEYS as readonly string[]).includes(value);
}

/** The glyph a landmark type falls back to when the landmark has no explicit icon. */
export function glyphForType(type: LandmarkType): LandmarkGlyph {
  if (['summit', 'high-point', 'highest-point'].includes(type)) return 'summit';
  if (['pass', 'halfway', 'finish'].includes(type)) return 'waypoint';
  if (['town', 'trailhead'].includes(type)) return 'town';
  if (type === 'aid-station') return 'aid-station';
  if (type === 'waterfall') return 'waterfall';
  if (['lake', 'water', 'river-crossing'].includes(type)) return 'water';
  if (type === 'camp') return 'camp';
  if (['hut', 'shelter'].includes(type)) return 'shelter';
  if (type === 'viewpoint') return 'viewpoint';
  return 'pin';
}

/** An explicit icon always wins, so an edited landmark keeps the icon the user picked. */
export function glyphForLandmark(landmark: Pick<RouteLandmark, 'type' | 'icon'>): LandmarkGlyph {
  return isLandmarkGlyph(landmark.icon) ? landmark.icon : glyphForType(landmark.type);
}

export function colorForLandmark(landmark: Pick<RouteLandmark, 'type' | 'source' | 'color'>) {
  if (landmark.color) return landmark.color;
  // A restrained alpine palette: category hues remain clear over satellite
  // imagery without competing with the route's orange accent.
  if (landmark.source === 'user') return '#E86F51';
  if (['summit', 'high-point', 'highest-point'].includes(landmark.type)) return '#E86F51';
  if (['pass', 'finish', 'halfway'].includes(landmark.type)) return '#6D7E96';
  if (['town', 'trailhead', 'aid-station'].includes(landmark.type)) return '#F7F2E8';
  if (landmark.type === 'waterfall') return '#63C5D9';
  if (['lake', 'water', 'river-crossing'].includes(landmark.type)) return '#3C9DCC';
  if (['hut', 'shelter', 'camp'].includes(landmark.type)) return '#B85E3C';
  if (landmark.type === 'viewpoint') return '#3E9DB0';
  return '#536B65';
}

/** Colors offered when recoloring a landmark, drawn from the palette above. */
export const LANDMARK_COLORS = [
  '#E86F51', '#F7F2E8', '#6D7E96', '#3C9DCC', '#63C5D9', '#B85E3C', '#3E9DB0', '#536B65',
] as const;
