import { renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { parseGPX } from '@/utils/gpxParser';
import { useFindNearestRoutePoint } from './useFindNearestRoutePoint';

const initialState = useAppStore.getState();
afterEach(() => useAppStore.setState(initialState, true));

it('places a manually selected point at its distance under constant pace', () => {
  const points = [42, 42.009, 42.018, 42.072, 42.09].map((lat) => `<trkpt lat="${lat}" lon="2" />`).join('');
  const track = parseGPX(`<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>${points}</trkseg></trk></gpx>`, 'route.gpx');
  useAppStore.setState((state) => {
    state.tracks = [track];
    state.activeTrackId = track.id;
    state.journeySegments = [{ id: 'route', type: 'track', trackId: track.id, duration: 60_000 }];
    state.playback.routeTimingMode = 'uniform';
  });
  const { result } = renderHook(() => useFindNearestRoutePoint());
  const placement = result.current(track.points[2].lat, track.points[2].lon);
  expect(placement?.progress).toBeCloseTo(0.2, 2);
  expect(placement?.routeSegmentId).toBe('route');
  expect(placement?.routeSegmentDistance).toBeCloseTo(track.points[2].distance, 1);
});
