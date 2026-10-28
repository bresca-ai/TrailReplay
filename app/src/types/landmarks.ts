export type LandmarkType =
  | 'summit' | 'pass' | 'viewpoint' | 'high-point' | 'waterfall'
  | 'trailhead' | 'hut' | 'shelter' | 'camp' | 'water' | 'aid-station'
  | 'finish' | 'town' | 'lake' | 'river-crossing'
  | 'photo' | 'note' | 'challenge' | 'custom'
  | 'highest-point' | 'longest-climb' | 'major-descent' | 'halfway';

export type LandmarkSource = 'automatic' | 'user' | 'enriched' | 'media';
export type LandmarkDisplay = 'subtle' | 'highlight';

export interface NearbyPlacesCoverage {
  complete: boolean;
  source: 'landmark-database' | 'shared-cache' | 'shared-cache-and-overpass' | 'overpass' | 'route-cache';
  tiles: number;
  cacheHits: number;
  fetchedTiles: number;
}

export interface RouteLandmark {
  id: string;
  type: LandmarkType;
  source: LandmarkSource;
  display: LandmarkDisplay;
  lat: number;
  lon: number;
  progress: number | null;
  elevation?: number;
  title: string;
  subtitle?: string;
  importance: 1 | 2 | 3 | 4 | 5;
  /** Built-in glyph, `pinhead:<id>`, or `emoji:<text>`; falls back to the type's glyph. */
  icon?: string;
  routeDistanceMeters?: number;
  color?: string;
  metadata?: {
    osmId?: string;
    tags?: Record<string, string>;
    generatedKind?: 'local-maximum' | 'longest-climb' | 'major-descent' | 'halfway';
  };
}
