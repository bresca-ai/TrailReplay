import { BASEMAP_PRESENTATIONS } from '@/components/map/mapStyle';

export interface LivePlaybackBasemapMap {
  getSource: (sourceId: string) => unknown;
  isSourceLoaded: (sourceId: string) => boolean;
  isStyleLoaded: () => boolean | void;
}

/**
 * Only the active detail basemap gates live route time. Fallback imagery is
 * deliberately excluded: it is useful while preparing a pose, but accepting
 * it here would resume the route with the same soft tiles this gate prevents.
 */
export function isLivePlaybackBasemapReady(
  map: LivePlaybackBasemapMap | null,
  mapStyle: string,
): boolean {
  if (!map) return true;
  if (map.isStyleLoaded() !== true) return false;

  const presentation = BASEMAP_PRESENTATIONS[mapStyle] ?? BASEMAP_PRESENTATIONS.satellite;
  if (!map.getSource(presentation.sourceId)) return true;

  try {
    return map.isSourceLoaded(presentation.sourceId);
  } catch {
    return false;
  }
}

export interface LivePlaybackClockTick {
  deltaMs: number;
  timestampMs: number;
}

/**
 * Advances route time only while its current camera pose has detail tiles.
 * The wall-clock anchor advances even while blocked, so resuming never applies
 * the whole tile-loading pause as one large route/camera jump.
 */
export function getLivePlaybackClockTick(
  timestampMs: number,
  previousTimestampMs: number | null,
  basemapReady: boolean,
): LivePlaybackClockTick {
  if (previousTimestampMs === null || !basemapReady) {
    return { deltaMs: 0, timestampMs };
  }

  return {
    deltaMs: Math.max(0, timestampMs - previousTimestampMs),
    timestampMs,
  };
}
