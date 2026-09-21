import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseGPX } from '@/utils/gpxParser';
import type { TextAnnotation } from '@/types';
import { useAppStore } from '@/store/useAppStore';
import { usePictureRouteSync } from './usePictureRouteSync';

const initialState = useAppStore.getState();

function unevenTrack() {
  const latitudes = [42, 42.009, 42.018, 42.072, 42.09];
  const points = latitudes.map((lat) => `<trkpt lat="${lat}" lon="2" />`).join('');
  return parseGPX(
    `<?xml version="1.0"?><gpx version="1.1"><trk><name>Uneven</name><trkseg>${points}</trkseg></trk></gpx>`,
    'uneven.gpx',
  );
}

function legacyAnnotation(track: ReturnType<typeof unevenTrack>): TextAnnotation {
  const point = track.points[2];
  return {
    id: 'legacy-note',
    // Recorded pace advances by point count, so the third of five points is
    // halfway through the replay even though it is only 20% of the distance.
    progress: 0.5,
    lat: point.lat,
    lon: point.lon,
    title: 'Two kilometres',
    color: '#f3b133',
    displayDuration: 4_000,
  };
}

describe('usePictureRouteSync route actions', () => {
  beforeEach(() => {
    useAppStore.setState(initialState, true);
  });

  it('migrates a legacy annotation and retimes it for Constant Pace', async () => {
    const track = unevenTrack();
    useAppStore.setState((state) => {
      state.tracks = [track];
      state.activeTrackId = track.id;
      state.journeySegments = [{
        id: 'route-segment',
        type: 'track',
        trackId: track.id,
        duration: 60_000,
      }];
      state.textAnnotations = [legacyAnnotation(track)];
      state.playback.routeTimingMode = 'recorded';
    });

    renderHook(() => usePictureRouteSync());

    await waitFor(() => {
      expect(useAppStore.getState().textAnnotations[0].routeDistance).toBeCloseTo(2_000, -2);
    });

    act(() => useAppStore.getState().setRouteTimingMode('uniform'));

    await waitFor(() => {
      expect(useAppStore.getState().textAnnotations[0].progress).toBeCloseTo(0.2, 2);
    });
  });
});
