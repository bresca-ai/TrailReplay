import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import type { SegmentTiming } from '@/utils/journeyUtils';
import { MapElevationProfile } from './MapElevationProfile';
import { detectElevationFocusSections } from './elevationSections';
import { resizeElevationSection, upsertElevationSectionOverride } from './elevationSectionOverrides';

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
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  beforeEach(() => {
    useAppStore.setState(initialState, true);
    useAppStore.setState((state) => {
      state.settings.showElevationProfile = true;
      state.settings.dynamicElevationProfile = true;
      state.settings.elevationSectionOverrides = [];
      state.settings.customElevationSections = [];
      state.settings.hiddenElevationSectionIds = [];
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

    expect(document.getElementById('mapElevationProfile')).toHaveStyle({
      fontFamily: 'var(--font-family-overlay)',
    });
    const svg = document.getElementById('elevationProfileSvg');
    expect(svg).toHaveAttribute('viewBox', '0 0 800 60');
    expect(svg).not.toHaveAttribute('data-export-elevation-change');
    expect(svg?.querySelectorAll('[data-export-elevation-focus-section]')).toHaveLength(1);
    expect(svg?.querySelector('[data-export-elevation-focus-section]')?.tagName).toBe('path');
    expect(svg?.querySelector('rect[data-export-elevation-focus-section]')).not.toBeInTheDocument();
    expect(svg?.querySelectorAll('circle')).toHaveLength(0);
    expect(document.querySelector('[data-elevation-section-editor]')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Adjust section 1/ })).toHaveLength(2);

    act(() => {
      useAppStore.getState().setPlayback({
        isPlaying: true,
        currentTime: 5_000,
        progress: 0.5,
      });
    });
    expect(svg?.querySelectorAll('[data-export-elevation-focus-section]')).toHaveLength(0);
    expect(document.querySelector('[data-elevation-section-editor]')).not.toBeInTheDocument();

    await waitFor(() => {
      const [, , width] = (svg?.getAttribute('viewBox') ?? '').split(' ').map(Number);
      expect(width).toBeLessThan(800);
    });
    expect(svg?.getAttribute('data-export-elevation-change')).toMatch(/^\+\d+ m$/);
    expect(svg?.getAttribute('data-export-elevation-start')).toMatch(/^\d+ m$/);
    expect(svg?.getAttribute('data-export-elevation-end')).toMatch(/^\d+ m$/);
    expect(svg?.getAttribute('data-export-elevation-distance')).toMatch(/^\d+\.\d{2} km$/);
    expect(svg?.getAttribute('data-export-elevation-section-kind')).toBe('climb');
    expect(svg?.querySelector('path[stroke="#07150f"]')).not.toBeInTheDocument();
    expect(screen.getByText(/^\+\d+ m$/)).toBeVisible();
    expect(screen.getByText(/^\d+\.\d{2} km$/)).toBeVisible();

    act(() => {
      useAppStore.getState().setSettings({ dynamicElevationProfile: false });
    });

    await waitFor(() => expect(svg).toHaveAttribute('viewBox', '0 0 800 60'));
    expect(screen.queryByText(/^\+\d+ m$/)).not.toBeInTheDocument();
  });

  it('renders the new direction and total when an automatic climb is moved downhill', () => {
    const sections = detectElevationFocusSections(elevationData);
    const original = sections.find((section) => section.kind === 'climb')!;
    const adjusted = resizeElevationSection(original, elevationData, 0.7, 0.95);
    useAppStore.setState((state) => {
      state.settings.elevationSectionOverrides = upsertElevationSectionOverride([], original, adjusted);
      state.settings.hiddenElevationSectionIds = sections.filter((s) => s.id !== original.id).map((s) => s.id);
      state.playback = { ...state.playback, isPlaying: true, currentTime: 9000, progress: 0.9 };
    });
    render(<MapElevationProfile />);
    const svg = document.getElementById('elevationProfileSvg');
    expect(svg).toHaveAttribute('data-export-elevation-section-kind', 'descent');
    expect(svg).toHaveAttribute('data-export-elevation-change', '-170 m');
    expect(svg).toHaveAttribute('data-export-elevation-start', '310 m');
    expect(svg).toHaveAttribute('data-export-elevation-end', '140 m');
    expect(screen.getByText('-170 m')).toBeVisible();
  });

  it('labels edited section endpoints rather than extrema inside a rolling section', () => {
    const sections = detectElevationFocusSections(elevationData);
    const original = sections.find((section) => section.kind === 'climb')!;
    const adjusted = resizeElevationSection(original, elevationData, 0.15, 0.85);
    useAppStore.setState((state) => {
      state.settings.elevationSectionOverrides = upsertElevationSectionOverride([], original, adjusted);
      state.settings.hiddenElevationSectionIds = sections.filter((s) => s.id !== original.id).map((s) => s.id);
      state.playback = { ...state.playback, isPlaying: true, currentTime: 5000, progress: 0.5 };
    });
    render(<MapElevationProfile />);
    const svg = document.getElementById('elevationProfileSvg');
    expect(svg).toHaveAttribute('data-export-elevation-start', '105 m');
    expect(svg).toHaveAttribute('data-export-elevation-end', '208 m');
  });

  it('lets a paused user drag a section boundary and stores the adjustment', () => {
    const { container } = render(<MapElevationProfile />);

    const editor = container.querySelector('[data-elevation-section-editor]') as HTMLDivElement;
    vi.spyOn(editor, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 800,
      bottom: 60,
      width: 800,
      height: 60,
      toJSON: () => ({}),
    });
    const endHandle = container.querySelector(
      '[aria-label="Adjust section 1 end"]',
    ) as HTMLButtonElement;
    Object.defineProperty(endHandle, 'setPointerCapture', { value: vi.fn() });
    Object.defineProperty(endHandle, 'hasPointerCapture', { value: () => true });

    fireEvent.pointerDown(endHandle, { pointerId: 1, clientX: 500 });
    fireEvent.pointerMove(endHandle, { pointerId: 1, clientX: 520 });

    const overrides = useAppStore.getState().settings.elevationSectionOverrides;
    expect(overrides).toHaveLength(1);
    expect(overrides[0].endProgress).toBeCloseTo(0.65);
  });

  it('adds and removes zoom sections from the paused editor', () => {
    const { container } = render(<MapElevationProfile />);

    fireEvent.click(container.querySelector('[aria-label="Add zoom section"]')!);
    const placement = container.querySelector(
      '[aria-label="Place new zoom section"]',
    ) as HTMLButtonElement;
    vi.spyOn(placement, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 800,
      bottom: 60,
      width: 800,
      height: 60,
      toJSON: () => ({}),
    });
    fireEvent.click(placement, { clientX: 400 });

    const [custom] = useAppStore.getState().settings.customElevationSections;
    expect(custom).toBeDefined();
    const customRange = container.querySelector(
      `[data-elevation-section-range="${custom.id}"]`,
    );
    expect(customRange).toBeInTheDocument();

    fireEvent.click(customRange!.querySelector('[aria-label^="Remove section"]')!);
    expect(useAppStore.getState().settings.customElevationSections).toEqual([]);

    const automaticRemove = container.querySelector(
      '[data-elevation-section-range] [aria-label^="Remove section"]',
    );
    fireEvent.click(automaticRemove!);
    expect(useAppStore.getState().settings.hiddenElevationSectionIds).toHaveLength(1);
  });
});
