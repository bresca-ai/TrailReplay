import { describe, expect, it } from 'vitest';
import {
  FOLLOW_BEHIND_STOP_COUNT,
  getFollowBehindCameraTarget,
  getFollowBehindLevelForStopIndex,
  getFollowBehindStopIndexForLevel,
  getFollowBehindZoomLevelForPreset,
  getNearestFollowBehindPreset,
  getSuggestedFollowBehindZoomLevel,
} from './followBehindCamera';

const LAT = 42.5;

function suggestedZoom(totalDistanceMeters: number, videoDurationSeconds: number, latitudeDeg = LAT) {
  const level = getSuggestedFollowBehindZoomLevel({
    totalDistanceMeters, videoDurationSeconds, latitudeDeg,
  });
  return { level, zoom: getFollowBehindCameraTarget(level, 'playback').zoom };
}

describe('follow-behind distance stops', () => {
  it('offers more stops than the four named presets', () => {
    expect(FOLLOW_BEHIND_STOP_COUNT).toBeGreaterThan(4);
  });

  it('keeps every named preset on a level that still resolves to a stop', () => {
    // The framing each name describes has moved closer, but the levels saved in
    // existing projects must still land somewhere valid.
    for (const preset of [
      'far', 'medium', 'close', 'very-close', 'ultra-close', 'extreme-close',
    ] as const) {
      const level = getFollowBehindZoomLevelForPreset(preset);
      expect(getFollowBehindLevelForStopIndex(getFollowBehindStopIndexForLevel(level))).toBe(level);
    }
  });

  it('sits closer than the ladder it replaced, at every position', () => {
    // The old stops, widest to closest. Each new stop must be nearer than the
    // one that shared its place, the widest is no wider than the old
    // second-widest, and the closest goes beyond the old closest.
    const previousZooms = [11, 12, 13, 14, 14.5, 15, 15.5, 16];
    const zooms = Array.from({ length: FOLLOW_BEHIND_STOP_COUNT }, (_, index) =>
      getFollowBehindCameraTarget(getFollowBehindLevelForStopIndex(index), 'playback').zoom);

    expect(zooms).toHaveLength(previousZooms.length + 5);
    zooms.slice(0, previousZooms.length)
      .forEach((zoom, index) => expect(zoom).toBeGreaterThan(previousZooms[index]));
    expect(zooms[0]).toBeGreaterThanOrEqual(previousZooms[1]);
    expect(zooms[zooms.length - 1]).toBeGreaterThan(previousZooms[previousZooms.length - 1]);
  });

  it('names the two map zoom steps beyond very-close', () => {
    expect(getFollowBehindCameraTarget(
      getFollowBehindZoomLevelForPreset('ultra-close'), 'playback',
    ).zoom).toBe(17.5);
    expect(getFollowBehindCameraTarget(
      getFollowBehindZoomLevelForPreset('extreme-close'), 'playback',
    ).zoom).toBe(18.5);
  });

  it('steps monotonically closer, without skipping or repeating a stop', () => {
    const zooms: number[] = [];
    for (let index = 0; index < FOLLOW_BEHIND_STOP_COUNT; index++) {
      const level = getFollowBehindLevelForStopIndex(index);
      expect(getFollowBehindStopIndexForLevel(level)).toBe(index);
      zooms.push(getFollowBehindCameraTarget(level, 'playback').zoom);
    }
    for (let i = 1; i < zooms.length; i++) {
      expect(zooms[i]).toBeGreaterThan(zooms[i - 1]);
    }
  });

  it('clamps stepping at both ends so the buttons cannot run off the scale', () => {
    expect(getFollowBehindLevelForStopIndex(-3)).toBe(getFollowBehindLevelForStopIndex(0));
    expect(getFollowBehindLevelForStopIndex(FOLLOW_BEHIND_STOP_COUNT + 5))
      .toBe(getFollowBehindLevelForStopIndex(FOLLOW_BEHIND_STOP_COUNT - 1));
  });

  it('snaps a level saved before the extra stops existed onto a real stop', () => {
    const index = getFollowBehindStopIndexForLevel(40);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(FOLLOW_BEHIND_STOP_COUNT);
  });
});

describe('suggested starting distance', () => {
  it('starts further back for replays that cover more ground per second of video', () => {
    // 185 m per video second against 3.4 km — one starting preset cannot suit both.
    const short = suggestedZoom(11_107, 60);
    const long = suggestedZoom(206_157, 60);

    expect(short.zoom).toBeGreaterThan(long.zoom);
    expect(getNearestFollowBehindPreset(long.level)).toBe('far');
  });

  it('depends on ground per second of video, not on route length alone', () => {
    // Same route, four times the clip length: the marker travels a quarter as
    // fast, so the camera should start closer.
    expect(suggestedZoom(21_097, 60).zoom).toBeGreaterThan(suggestedZoom(21_097, 15).zoom);
  });

  it('gives the same starting distance to replays that travel at the same rate', () => {
    // 20 km in 60s and 5 km in 15s are both 333 m per second of video.
    expect(suggestedZoom(20_000, 60).level).toBe(suggestedZoom(5_000, 15).level);
  });

  it('always lands on one of the stops the slider exposes', () => {
    for (const [distance, duration] of [[200, 90], [11_107, 60], [1_000_000, 15]] as const) {
      const level = getSuggestedFollowBehindZoomLevel({
        totalDistanceMeters: distance, videoDurationSeconds: duration, latitudeDeg: LAT,
      });
      expect(getFollowBehindLevelForStopIndex(getFollowBehindStopIndexForLevel(level))).toBe(level);
    }
  });

  it('accounts for Mercator scale changing with latitude', () => {
    // The same zoom shows less ground far from the equator, so a polar route
    // has to start further back than an equatorial one moving at the same rate.
    expect(suggestedZoom(11_107, 60, 78).zoom).toBeLessThanOrEqual(suggestedZoom(11_107, 60, 0).zoom);
  });

  it('falls back to the default preset when the route is not measurable yet', () => {
    const fallback = getFollowBehindZoomLevelForPreset('medium');

    expect(getSuggestedFollowBehindZoomLevel({
      totalDistanceMeters: 0, videoDurationSeconds: 60, latitudeDeg: LAT,
    })).toBe(fallback);
    expect(getSuggestedFollowBehindZoomLevel({
      totalDistanceMeters: 10_000, videoDurationSeconds: 0, latitudeDeg: LAT,
    })).toBe(fallback);
    expect(getSuggestedFollowBehindZoomLevel({
      totalDistanceMeters: 10_000, videoDurationSeconds: 60, latitudeDeg: Number.NaN,
    })).toBe(fallback);
  });
});
