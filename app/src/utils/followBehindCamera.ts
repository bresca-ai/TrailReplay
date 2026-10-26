import type { CameraSettings } from '@/types';

export const DEFAULT_FOLLOW_BEHIND_PRESET: CameraSettings['followBehindPreset'] = 'medium';
export const FOLLOW_BEHIND_ZOOM_MIN = 0;
export const FOLLOW_BEHIND_ZOOM_MAX = 160;

type FollowBehindCameraAnchor = {
  /** Named anchors are recipe-addressable camera presets. */
  id?: CameraSettings['followBehindPreset'];
  level: number;
  pitch: number;
  zoom: number;
};

type FollowBehindCameraProfile = 'intro' | 'playback';

/**
 * The distance stops the slider and the map's +/- buttons step through.
 *
 * The whole ladder sits closer than it used to. The old widest stop (zoom 11)
 * was wide enough that the marker read as a dot on a map rather than a subject
 * being followed, so the second-widest becomes the new limit and a stop closer
 * than the old `very-close` is added at the other end. Every position is nearer
 * than the one that shared its place before.
 *
 * The original four named presets keep their levels (0 / 33 / 66 / 100) so
 * stored settings and saved projects still land on a valid stop. Two additional
 * named stops mirror the next two map-zoom clicks after `very-close`, so a
 * recipe can select those same framings instead of losing them as unnamed UI
 * state. The stops between them exist
 * because the old `far`-to-`medium` gap was three whole zoom levels, far too
 * coarse when the right framing lands in the middle.
 */
const PLAYBACK_CAMERA_ANCHORS: FollowBehindCameraAnchor[] = [
  { id: 'far', level: 0, zoom: 12, pitch: 32 },
  { level: 11, zoom: 12.8, pitch: 34 },
  { level: 22, zoom: 13.6, pitch: 36 },
  { id: 'medium', level: 33, zoom: 14.5, pitch: 40 },
  { level: 49.5, zoom: 15, pitch: 44 },
  { id: 'close', level: 66, zoom: 15.5, pitch: 48 },
  { level: 83, zoom: 16, pitch: 52 },
  { id: 'very-close', level: 100, zoom: 16.5, pitch: 56 },
  { id: 'ultra-close', level: 120, zoom: 17.5, pitch: 60 },
  { id: 'extreme-close', level: 140, zoom: 18.5, pitch: 64 },
  { level: 145, zoom: 18.875, pitch: 66 },
  { level: 150, zoom: 19.25, pitch: 68 },
  { id: 'maximum-close', level: 160, zoom: 20, pitch: 72 },
];

/**
 * Same stops, on the wider pose a cinematic fly-in would finish at.
 *
 * Currently unused — `getIntroCameraPose` deliberately targets the playback
 * pose so the fly-in lands exactly where playback begins, rather than arriving
 * somewhere wider and then zooming again. Kept in step with the playback ladder
 * so it stays coherent if that changes.
 */
const INTRO_CAMERA_ANCHORS: FollowBehindCameraAnchor[] = [
  { id: 'far', level: 0, zoom: 13, pitch: 47 },
  { level: 11, zoom: 13.8, pitch: 48.5 },
  { level: 22, zoom: 14.6, pitch: 50 },
  { id: 'medium', level: 33, zoom: 15.5, pitch: 52 },
  { level: 49.5, zoom: 16, pitch: 54 },
  { id: 'close', level: 66, zoom: 16.5, pitch: 56 },
  { level: 83, zoom: 17, pitch: 58 },
  { id: 'very-close', level: 100, zoom: 17.5, pitch: 60 },
  { id: 'ultra-close', level: 120, zoom: 18.5, pitch: 64 },
  { id: 'extreme-close', level: 140, zoom: 19.5, pitch: 68 },
  { level: 145, zoom: 19.875, pitch: 70 },
  { level: 150, zoom: 20.25, pitch: 72 },
  { id: 'maximum-close', level: 160, zoom: 21, pitch: 76 },
];

/** Levels of each stop, in order from furthest to closest. */
export const FOLLOW_BEHIND_STOP_LEVELS: readonly number[] = PLAYBACK_CAMERA_ANCHORS
  .map((anchor) => anchor.level);

export const FOLLOW_BEHIND_STOP_COUNT = FOLLOW_BEHIND_STOP_LEVELS.length;

/** Level for a stop index, clamped to the ends of the slider. */
export function getFollowBehindLevelForStopIndex(index: number): number {
  const clamped = Math.max(0, Math.min(FOLLOW_BEHIND_STOP_COUNT - 1, Math.round(index)));
  return FOLLOW_BEHIND_STOP_LEVELS[clamped];
}

/** Stop index a stored level sits on (nearest, for levels saved before the extra stops existed). */
export function getFollowBehindStopIndexForLevel(level: number): number {
  const clampedLevel = clampFollowBehindZoomLevel(level);
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  FOLLOW_BEHIND_STOP_LEVELS.forEach((stopLevel, index) => {
    const distance = Math.abs(stopLevel - clampedLevel);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function getFollowBehindCameraAnchors(profile: FollowBehindCameraProfile): FollowBehindCameraAnchor[] {
  return profile === 'intro' ? INTRO_CAMERA_ANCHORS : PLAYBACK_CAMERA_ANCHORS;
}

function clampFollowBehindZoomLevel(level: number): number {
  return Math.min(FOLLOW_BEHIND_ZOOM_MAX, Math.max(FOLLOW_BEHIND_ZOOM_MIN, level));
}

function interpolateCameraAnchor(
  level: number,
  anchors: FollowBehindCameraAnchor[],
): { zoom: number; pitch: number } {
  const clampedLevel = clampFollowBehindZoomLevel(level);
  const lowerAnchor = anchors.reduce((closest, anchor) => (
    anchor.level <= clampedLevel ? anchor : closest
  ), anchors[0]);
  const upperAnchor = anchors.find((anchor) => anchor.level >= clampedLevel) ?? anchors[anchors.length - 1];

  if (lowerAnchor.level === upperAnchor.level) {
    return {
      zoom: lowerAnchor.zoom,
      pitch: lowerAnchor.pitch,
    };
  }

  const progress = (clampedLevel - lowerAnchor.level) / (upperAnchor.level - lowerAnchor.level);

  return {
    zoom: lowerAnchor.zoom + ((upperAnchor.zoom - lowerAnchor.zoom) * progress),
    pitch: lowerAnchor.pitch + ((upperAnchor.pitch - lowerAnchor.pitch) * progress),
  };
}

export function getFollowBehindZoomLevelForPreset(
  preset: CameraSettings['followBehindPreset'],
): number {
  const anchor = PLAYBACK_CAMERA_ANCHORS.find((candidate) => candidate.id === preset);
  return anchor?.level ?? 33;
}

export function getNearestFollowBehindPreset(
  level: number,
): CameraSettings['followBehindPreset'] {
  const clampedLevel = clampFollowBehindZoomLevel(level);
  // Only the named anchors are candidates; the in-between stops have no name.
  const namedAnchors = PLAYBACK_CAMERA_ANCHORS.filter((anchor) => anchor.id !== undefined);

  return namedAnchors.reduce((closest, anchor) => {
    const currentDistance = Math.abs(anchor.level - clampedLevel);
    const closestDistance = Math.abs(closest.level - clampedLevel);
    return currentDistance < closestDistance ? anchor : closest;
  }, namedAnchors[0]).id as CameraSettings['followBehindPreset'];
}

export function getFollowBehindZoomLevelFromZoom(
  zoom: number,
  profile: FollowBehindCameraProfile,
): number {
  const anchors = getFollowBehindCameraAnchors(profile);
  const lowerAnchor = anchors.reduce((closest, anchor) => (
    anchor.zoom <= zoom ? anchor : closest
  ), anchors[0]);
  const upperAnchor = anchors.find((anchor) => anchor.zoom >= zoom) ?? anchors[anchors.length - 1];

  if (lowerAnchor.zoom === upperAnchor.zoom) {
    return lowerAnchor.level;
  }

  const progress = (zoom - lowerAnchor.zoom) / (upperAnchor.zoom - lowerAnchor.zoom);

  return clampFollowBehindZoomLevel(
    lowerAnchor.level + ((upperAnchor.level - lowerAnchor.level) * progress),
  );
}

export function getFollowBehindCameraTarget(
  level: number,
  profile: FollowBehindCameraProfile,
): { zoom: number; pitch: number } {
  return interpolateCameraAnchor(
    level,
    getFollowBehindCameraAnchors(profile),
  );
}

/**
 * Ground covered by one pixel at zoom 0. MapLibre's zoom is defined against
 * 512px tiles, so the world is 512 * 2^zoom pixels wide.
 */
export const METERS_PER_PIXEL_AT_ZOOM_0 = 40075016.686 / 512;

/**
 * Viewport width the starting distance is reasoned about in. A fixed reference
 * rather than the real canvas width, so the suggestion is a property of the
 * replay: it must not depend on the window size, and it has to mean the same
 * thing for an export at any resolution.
 */
export const REFERENCE_VIEWPORT_WIDTH_PX = 1280;

/**
 * How long the ground should take to travel one viewport width, in seconds of
 * video. This is the knob that decides what "sensible starting framing" means:
 * lower pulls the camera in and makes the replay feel faster, higher pushes it
 * out and calms it down.
 *
 * Tightened from 20s so a freshly loaded route starts closer, on top of the
 * whole stop ladder having moved in. Both were needed: shifting the ladder
 * alone left several routes snapping to the same absolute zoom as before,
 * because the target they were snapping to had not moved.
 */
const SECONDS_TO_CROSS_VIEWPORT = 13;

/**
 * The distance stop to start a freshly loaded route on.
 *
 * The useful notion of speed here is not the athlete's — it is how much ground
 * the replay covers per second of *video*, which is route length divided by
 * clip length. That ratio varies enormously: a 206 km ride as a 60 s clip
 * travels 3.4 km per second of video, while an 11 km run in the same 60 s
 * travels 185 m. Eighteen times the speed across the frame, which is why one
 * fixed starting preset looks calm on one route and frantic on the other.
 *
 * So pick the stop that puts a consistent amount of *time* on screen: the
 * distance at which the ground takes a set number of seconds to cross the
 * frame. Speed cancels out, and short routes start close while long ones start
 * back.
 *
 * This only chooses where the slider starts. Everything after that is the
 * user's, and nothing here moves it again.
 */
export function getSuggestedFollowBehindZoomLevel({
  totalDistanceMeters,
  videoDurationSeconds,
  latitudeDeg,
}: {
  totalDistanceMeters: number;
  videoDurationSeconds: number;
  latitudeDeg: number;
}): number {
  const fallback = getFollowBehindZoomLevelForPreset(DEFAULT_FOLLOW_BEHIND_PRESET);

  if (!Number.isFinite(totalDistanceMeters) || totalDistanceMeters <= 0) return fallback;
  if (!Number.isFinite(videoDurationSeconds) || videoDurationSeconds <= 0) return fallback;
  if (!Number.isFinite(latitudeDeg)) return fallback;

  const desiredVisibleWidthMeters =
    (totalDistanceMeters / videoDurationSeconds) * SECONDS_TO_CROSS_VIEWPORT;
  if (desiredVisibleWidthMeters <= 0) return fallback;

  // Web Mercator scales by latitude, so the same zoom shows less ground far
  // from the equator. Clamped short of the poles to keep the cosine sane.
  const safeLatitude = Math.max(-85, Math.min(85, latitudeDeg));
  const metersPerPixelAtZoom0 =
    METERS_PER_PIXEL_AT_ZOOM_0 * Math.cos((safeLatitude * Math.PI) / 180);
  const desiredZoom = Math.log2(
    (metersPerPixelAtZoom0 * REFERENCE_VIEWPORT_WIDTH_PX) / desiredVisibleWidthMeters,
  );
  if (!Number.isFinite(desiredZoom)) return fallback;

  // Snap to whichever stop frames it closest, so the slider always lands on a
  // real position the user can then step away from.
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  PLAYBACK_CAMERA_ANCHORS.forEach((anchor, index) => {
    const distance = Math.abs(anchor.zoom - desiredZoom);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return getFollowBehindLevelForStopIndex(bestIndex);
}
