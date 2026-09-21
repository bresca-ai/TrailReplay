import type { CameraSettings, AppSettings, LanguageCode, RouteTimingMode, SocialShareSettings, VideoExportSettings } from '@/types';
import type { LandmarkType } from '@/types/landmarks';

/**
 * A recipe is the agent-facing input: a short JSON file describing what a
 * replay should contain, dropped on the page alongside the GPX files it names.
 *
 * It carries intent rather than geometry — "the aid station at km 6.5", not a
 * latitude — so the app resolves positions with its own track maths. That is
 * the point of the format: an author never has to reimplement the distance
 * accumulation, and can never disagree with it.
 *
 * The schema is documented for authors at app/public/replay-file.md.
 */
export interface Recipe {
  /** Marks the file as a recipe. Any casing, and the `.trailreplay` suffix is optional. */
  trailreplay?: string | number;
  name?: string;
  /** Default marker icon for every track that does not set its own. */
  activityIcon?: string;

  tracks?: RecipeTrackSpec[] | RecipeTrackGlob;
  comparisonTracks?: RecipeTrackSpec[];

  /**
   * How the tracks relate. `stitch` plays them one after another as one
   * journey; `alternatives` loads them all but plays only the active one, which
   * is what separate courses of the same race are.
   */
  mode?: 'stitch' | 'alternatives';
  /**
   * How screen time is shared between stitched legs. `by-distance` is the
   * default and the reason a 35 km day does not get the same seconds as an
   * 8 km one.
   */
  legDuration?: 'by-distance' | 'equal' | number;
  /** Total replay length in ms when legs are stitched. */
  totalDuration?: number;

  landmarks?: RecipeLandmark[];
  annotations?: RecipeAnnotation[];
  iconChanges?: RecipeIconChange[];

  activeTrack?: string | number;
  routeTimingMode?: RouteTimingMode;
  showAutomaticLandmarks?: boolean;
  nearbyPlaceTypes?: LandmarkType[] | null;

  settings?: DeepPartial<AppSettings>;
  cameraSettings?: Partial<CameraSettings>;
  videoExportSettings?: Partial<VideoExportSettings>;
  socialShareSettings?: Partial<SocialShareSettings>;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export interface RecipeTrackSpec {
  /** File name of a GPX/KML dropped alongside the recipe. Matched loosely — see matchTrackFiles. */
  file: string;
  name?: string;
  color?: string;
  activityIcon?: string;
  visible?: boolean;
  /** This leg's screen time in ms; overrides `legDuration`. */
  duration?: number;
  /** comparisonTracks only: start offset in seconds. */
  offset?: number;
}

/** `{ files: "*.gpx", order: "chronological" }` — take whatever was dropped. */
export interface RecipeTrackGlob {
  files: string;
  order?: 'chronological' | 'as-dropped' | 'name';
  color?: string | string[];
  activityIcon?: string;
}

/** Where something sits on the route. Exactly one of these forms is required. */
export interface RecipeAnchor {
  /** Distance along its track, in kilometres. What sources publish. */
  km?: number;
  lat?: number;
  lon?: number;
  /** Fraction of the whole replay, 0–1. */
  progress?: number;
  /** Which track a `km` is measured along: index, or name. Defaults to the first. */
  track?: string | number;
}

export interface RecipeLandmark extends RecipeAnchor {
  id?: string;
  title?: string;
  subtitle?: string;
  type?: LandmarkType;
  icon?: string;
  color?: string;
  importance?: 1 | 2 | 3 | 4 | 5;
  display?: 'subtle' | 'highlight';
  /**
   * Derive a set of landmarks instead of placing one. `overnight-stops` marks
   * where consecutive legs meet — the end of one day and the start of the next
   * is where you slept.
   */
  auto?: 'overnight-stops' | 'start' | 'finish' | 'start-finish';
}

export interface RecipeAnnotation extends RecipeAnchor {
  id?: string;
  title?: string;
  subtitle?: string;
  code?: string;
  meta?: string;
  description?: string;
  color?: string;
  /** How long the card is on screen before the replay reaches the point, in ms. */
  displayDuration?: number;
  presentation?: 'map-card' | 'side-panel';
  logo?: string;
  holdDuration?: number;
  translations?: Partial<Record<LanguageCode, { title: string; subtitle?: string; meta?: string; description?: string }>>;
  auto?: 'overnight-stops';
}

export interface RecipeIconChange extends RecipeAnchor {
  id?: string;
  icon: string;
  label?: string;
}

/** What the app resolved, so a person can see the recipe did what was meant. */
export interface RecipeReport {
  trackCount: number;
  totalDistanceMeters: number;
  stitched: boolean;
  landmarks: RecipeResolvedEntry[];
  annotations: RecipeResolvedEntry[];
  iconChanges: RecipeResolvedEntry[];
  warnings: string[];
}

export interface RecipeResolvedEntry {
  title: string;
  trackName: string;
  km: number;
  progress: number;
  /** When the replay reaches this, in seconds. */
  atSeconds: number;
  /** When a card comes on screen, in seconds. Absent for pins. */
  onScreenFromSeconds?: number;
  /**
   * How far the marker is from this entry's point on the route at the moment it
   * appears. Anything but ~0 means the entry is timed to a different part of
   * the replay than the place it names — the one number that catches a card
   * bound to the wrong route, or to the wrong lap of a repeated one.
   */
  markerOffMeters: number;
  /** Set when the entry was anchored by coordinate, so a bad pick is visible. */
  offRouteMeters?: number;
  /** Set when the entry was derived rather than authored. */
  derived?: boolean;
}

export class RecipeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecipeError';
  }
}
