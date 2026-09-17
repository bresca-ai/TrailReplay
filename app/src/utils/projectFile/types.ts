import type {
  AppSettings,
  CameraSettings,
  IconChange,
  Journey,
  JourneySegment,
  RouteTimingMode,
  SocialShareSettings,
  TextAnnotation,
  VideoExportSettings,
} from '@/types';
import type { LandmarkType, RouteLandmark } from '@/types/landmarks';
import type { CinematicCameraKeyframe } from '@/utils/cinematicCameraPlan';
import type { Recipe } from '@/utils/recipe/types';

export const CURRENT_FORMAT_VERSION = 1;
export const SUPPORTED_FORMAT_VERSIONS = [1];

// This must match the root and app package versions. It is diagnostic metadata
// in saved archives rather than a project-format compatibility switch.
export const APP_VERSION = '1.0.0';

export const MAX_ARCHIVE_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB

export interface ReplayManifest {
  formatVersion: number;
  appVersion: string;
  projectName: string;
  createdAt: string;
  savedAt: string;
  trackCount: number;
  pictureCount: number;
  videoCount: number;
}

/**
 * Only `routeFile` is structural. The rest is presentation the app can supply
 * itself, so a hand-authored project (see docs/AGENT_REPLAY_FILE.md) can name a
 * route file and nothing else.
 */
export interface ReplayTrackMeta {
  id?: string;
  name?: string;
  activityIcon?: string;
  color?: string;
  visible?: boolean;
  routeFile: string;
}

export interface ReplayComparisonTrackMeta {
  id?: string;
  name?: string;
  color?: string;
  visible?: boolean;
  offset?: number;
  routeFile: string;
}

export interface SerializedPicture {
  id: string;
  originalFileName: string;
  lat?: number;
  lon?: number;
  timestamp?: string;
  progress: number;
  position: number;
  /**
   * Distance from the start of the journey, in metres. `progress` depends on
   * the timing mode; this does not, so it is what lets a reopened project be
   * recalculated when the mode changes afterwards. Absent in projects saved
   * before this field existed.
   */
  routeDistance?: number;
  routeSegmentId?: string;
  routeSegmentDistance?: number;
  placementSource?: 'gps' | 'timestamp' | 'manual';
  title?: string;
  description?: string;
  displayDuration: number;
}

export interface SerializedVideo {
  id: string;
  originalFileName: string;
  lat?: number;
  lon?: number;
  timestamp?: string;
  progress: number;
  title?: string;
  description?: string;
  /** Clip length in seconds, so a re-opened project knows the hold before the file is re-linked. */
  durationSeconds?: number;
  placementSource?: 'gps' | 'timestamp' | 'manual';
  routeDistance?: number;
  routeSegmentId?: string;
  routeSegmentDistance?: number;
}

/**
 * `project.json` inside a `.replay` archive.
 *
 * The app always writes every field, but only `formatVersion` and `tracks` are
 * required to read one back: hydration backfills everything else from the same
 * `createDefault*()` factories a fresh session starts from. That is what lets a
 * project be written by hand or by a script rather than only by the app — see
 * `docs/AGENT_REPLAY_FILE.md`. Keep new fields optional for the same reason.
 */
export interface ReplayProjectFile {
  formatVersion: number;
  tracks: ReplayTrackMeta[];
  /** Defaults to the first track, which is what a plain GPX upload does. */
  activeTrackId?: string | null;
  comparisonTracks?: ReplayComparisonTrackMeta[];
  journey?: Journey | null;
  journeySegments?: JourneySegment[];
  pictures?: SerializedPicture[];
  videos?: SerializedVideo[];
  iconChanges?: IconChange[];
  textAnnotations?: TextAnnotation[];
  /**
   * Absent in projects saved before cinematic mode existed; hydration treats
   * that as an empty list.
   */
  cinematicCameraKeyframes?: CinematicCameraKeyframe[];
  userLandmarks?: RouteLandmark[];
  /**
   * Derived landmarks the user removed. Absent in projects saved before
   * landmarks could be removed, which is read as "nothing removed".
   */
  hiddenLandmarkIds?: string[];
  enabledLandmarkGroups?: LandmarkType[];
  nearbyPlaceTypes?: LandmarkType[] | null;
  showAutomaticLandmarks?: boolean;
  routeTimingMode?: RouteTimingMode;
  /** Last live map camera, including a manually selected zoom level. */
  cameraPosition?: {
    lat: number;
    lon: number;
    zoom: number;
    pitch: number;
    bearing: number;
  } | null;
  settings?: Partial<AppSettings>;
  cameraSettings?: Partial<CameraSettings>;
  videoExportSettings?: Partial<VideoExportSettings>;
  socialShareSettings?: Partial<SocialShareSettings>;
}

/**
 * A `.replay` archive holds a recipe, a resolved project, or both.
 *
 * The recipe is the source: intent, no coordinates. The project is what that
 * resolved to, plus everything a person changed afterwards that intent cannot
 * express — a photo placed on the route, a stats panel dragged, a colour picked
 * by hand. Saving keeps both, so a file says where it came from and an agent can
 * edit the recipe inside it and hand it back.
 */
export interface ParsedProject {
  manifest: ReplayManifest;
  /**
   * Absent when the archive is a recipe and its routes and nothing else, which
   * is what a script or an agent produces — resolving belongs to the app.
   */
  project: ReplayProjectFile | null;
  recipe: Recipe | null;
  /** Every route in the archive, whether or not a project references it. */
  routes: Array<{ fileName: string; gpxText: string }>;
  tracks: Array<{ meta: ReplayTrackMeta; gpxText: string }>;
  comparisonTracks: Array<{ meta: ReplayComparisonTrackMeta; gpxText: string }>;
}
