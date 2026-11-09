import { afterEach, expect, it } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { parseGPX } from '@/utils/gpxParser';
import { placementAtProgress, placePendingMedia } from './pendingMediaPlacement';
const initial = useAppStore.getState();
afterEach(() => useAppStore.setState(initial, true));
it('places a mixed group at the constant-pace timeline position with route anchors', () => {
  const points = [42, 42.009, 42.018, 42.072, 42.09].map((lat) => `<trkpt lat="${lat}" lon="2"/>`).join('');
  const track = parseGPX(`<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>${points}</trkseg></trk></gpx>`, 'route.gpx');
  useAppStore.setState((state) => {
    state.tracks = [track];
    state.journeySegments = [{ id: 'route', type: 'track', trackId: track.id, duration: 60000 }];
    state.playback.routeTimingMode = 'uniform';
  });
  for (const [id, mediaKind] of [['a', 'picture'], ['b', 'video'], ['c', 'picture']] as const) useAppStore.getState().queuePendingPicturePlacement({ id, mediaKind, file: new File([''], id), url: '', displayDuration: 3000, placementReason: 'missing-gps' });
  const placement = placementAtProgress(0.2);
  expect(placement?.lat).toBeCloseTo(42.018, 3);
  expect(placement?.routeSegmentId).toBe('route');
  placePendingMedia(['a', 'b'], placement!);
  const state = useAppStore.getState();
  expect(state.pictures[0].progress).toBeCloseTo(0.2);
  expect(state.videos[0].routeDistance).toBeCloseTo(placement!.routeDistance!);
  expect(state.pendingPicturePlacements.map((item) => item.id)).toEqual(['c']);
});
