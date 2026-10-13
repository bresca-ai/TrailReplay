import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import type { SegmentTiming } from '@/utils/journeyUtils';
import { MapElevationProfile } from './MapElevationProfile';

const mockedJourney = vi.hoisted(() => ({ current: {} }));

vi.mock('@/hooks/useComputedJourney', () => ({
  useComputedJourney: () => mockedJourney.current,
}));

const initialState = useAppStore.getState();

const timing: SegmentTiming = {
  segmentId: 'ridge',
  segmentIndex: 0,
  type: 'track',
  duration: 10_000,
  startTime: 0,
  endTime: 10_000,
  startDistance: 0,
  endDistance: 4_000,
  startCoordIndex: 0,
  endCoordIndex: 40,
  progressStartRatio: 0,
  progressEndRatio: 1,
  distanceStartRatio: 0,
  distanceEndRatio: 1,
  trackId: 'ridge',
};

const elevationData = Array.from({ length: 41 }, (_, index) => {
  let elevation: number;
  if (index <= 8) elevation = 120 - index * 2.5;
  else if (index <= 22) elevation = 100 + (index - 8) * 15;
  else if (index <= 28) elevation = 310;
  else if (index <= 38) elevation = 310 - (index - 28) * 17;
  else elevation = 140;

  return {
    distance: index * 100,
    elevation,
    progress: index / 40,
    segmentIndex: 0,
    segmentType: 'track' as const,
  };
});

describe('MapElevationProfile dynamic sections', () => {
  beforeEach(() => {
    useAppStore.setState(initialState, true);
    useAppStore.setState((state) => {
      state.settings.showElevationProfile = true;
      state.settings.dynamicElevationProfile = true;
      state.playback.currentTime = 0;
      state.playback.totalDuration = 10_000;
      state.playback.progress = 0;
      state.animationPhase = 'playing';
    });
    mockedJourney.current = {
      elevationData,
      segmentTimings: [timing],
      currentTrackColor: '#cc6633',
      isInTransport: false,
      currentSegment: null,
      routeTimingMode: 'recorded',
    };
  });

  it('starts with the full route, focuses a detected climb, and restores static mode', async () => {
    render(<MapElevationProfile />);

    const svg = document.getElementById('elevationProfileSvg');
    expect(svg).toHaveAttribute('viewBox', '0 0 800 60');
    expect(svg).not.toHaveAttribute('data-export-elevation-duration');

    act(() => {
      useAppStore.getState().setPlayback({
        currentTime: 3_500,
        progress: 0.35,
      });
    });

    await waitFor(() => {
      const [, , width] = (svg?.getAttribute('viewBox') ?? '').split(' ').map(Number);
      expect(width).toBeLessThan(800);
    });
    expect(svg?.getAttribute('data-export-elevation-duration')).toMatch(/^0:/);
    expect(svg?.getAttribute('data-export-elevation-gain')).toMatch(/^\+\d+ m$/);
    expect(svg?.getAttribute('data-export-elevation-high')).toMatch(/^\d+ m$/);
    expect(svg?.getAttribute('data-export-elevation-low')).toMatch(/^\d+ m$/);
    expect(screen.getByText(/^\+\d+ m$/)).toBeVisible();

    act(() => {
      useAppStore.getState().setSettings({ dynamicElevationProfile: false });
    });

    await waitFor(() => expect(svg).toHaveAttribute('viewBox', '0 0 800 60'));
    expect(screen.queryByText(/^\+\d+ m$/)).not.toBeInTheDocument();
  });
});
