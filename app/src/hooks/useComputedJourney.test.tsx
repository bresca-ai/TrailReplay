import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useComputedJourney } from './useComputedJourney';
import { useAppStore } from '@/store/useAppStore';
import type { GPXTrack } from '@/types';

function track(): GPXTrack {
  return {
    id: 'large-track',
    name: 'Large track',
    activityIcon: 'running',
    points: [
      { lat: 42, lon: 1, elevation: 100, time: null, heartRate: null, cadence: null, power: null, temperature: null, distance: 0, speed: 0 },
      { lat: 42.01, lon: 1.01, elevation: 120, time: null, heartRate: null, cadence: null, power: null, temperature: null, distance: 1_000, speed: 0 },
    ],
    totalDistance: 1_000,
    totalTime: 0,
    movingTime: 0,
    elevationGain: 20,
    elevationLoss: 0,
    maxElevation: 120,
    minElevation: 100,
    maxSpeed: 0,
    avgSpeed: 0,
    avgMovingSpeed: 0,
    bounds: { minLat: 42, maxLat: 42.01, minLon: 1, maxLon: 1.01 },
    color: '#C1652F',
    visible: true,
  };
}

describe('useComputedJourney', () => {
  beforeEach(() => {
    useAppStore.getState().reset();
  });

  it('reuses route geometry when only a segment duration changes', () => {
    useAppStore.getState().addTrack(track());
    const { result } = renderHook(() => useComputedJourney());
    const initialCoordinates = result.current.computedJourney?.coordinates;
    const segmentId = useAppStore.getState().journeySegments[0].id;

    act(() => {
      useAppStore.getState().updateJourneySegmentDuration(segmentId, 30_000);
    });

    expect(result.current.computedJourney?.coordinates).toBe(initialCoordinates);
    expect(result.current.totalDuration).toBe(30_000);
  });
});
