import { describe, expect, it } from 'vitest';
import { createAppStore } from './createAppStore';
import type { GPXTrack, PendingPicturePlacement } from '@/types';
import { DEFAULT_ACTIVITY_ICON } from '@/utils/activityIcons';
import { getFollowBehindZoomLevelForPreset } from '@/utils/followBehindCamera';

function createTrack(overrides: Partial<GPXTrack> = {}): GPXTrack {
  return {
    id: overrides.id ?? 'track-1',
    name: overrides.name ?? 'Sample Track',
    activityIcon: overrides.activityIcon ?? DEFAULT_ACTIVITY_ICON,
    points: overrides.points ?? [
      {
        lat: 42,
        lon: 1,
        elevation: 1000,
        time: null,
        heartRate: null,
        cadence: null,
        power: null,
        temperature: null,
        distance: 0,
        speed: 0,
      },
    ],
    totalDistance: overrides.totalDistance ?? 10000,
    totalTime: overrides.totalTime ?? 3600000,
    movingTime: overrides.movingTime ?? 3500000,
    elevationGain: overrides.elevationGain ?? 1200,
    elevationLoss: overrides.elevationLoss ?? 1200,
    maxElevation: overrides.maxElevation ?? 2100,
    minElevation: overrides.minElevation ?? 900,
    maxSpeed: overrides.maxSpeed ?? 8,
    avgSpeed: overrides.avgSpeed ?? 4,
    avgMovingSpeed: overrides.avgMovingSpeed ?? 4.2,
    bounds: overrides.bounds ?? {
      minLat: 42,
      maxLat: 42.1,
      minLon: 1,
      maxLon: 1.1,
    },
    color: overrides.color ?? '#10B981',
    visible: overrides.visible ?? true,
  };
}

function comparisonReadyTrack(id: string, lat: number, timed: boolean): GPXTrack {
  const base = createTrack().points[0];
  return createTrack({
    id,
    totalDistance: 1000,
    points: [
      { ...base, lat, time: timed ? new Date('2026-10-25T10:00:00Z') : null },
      { ...base, lat: lat + 0.01, distance: 1000, time: timed ? new Date('2026-10-25T10:10:00Z') : null },
    ],
  });
}

function createPendingPlacement(id: string): PendingPicturePlacement {
  return {
    id,
    file: new File(['image'], `${id}.jpg`, { type: 'image/jpeg' }),
    url: `blob:${id}`,
    displayDuration: 5000,
    placementReason: 'missing-gps',
  };
}

describe('createAppStore', () => {
  it('moves a loaded route into comparison and restores its timing and transport connection', () => {
    const useStore = createAppStore();
    useStore.getState().addTrack(createTrack({ id: 'first', activityIcon: 'svg-biking' }));
    useStore.getState().addTrack(createTrack({ id: 'second', activityIcon: 'svg-walking' }));
    const [first, second] = useStore.getState().journeySegments;
    useStore.getState().reorderJourneySegments([
      { ...first, duration: 22_000 },
      { id: 'connection', type: 'transport', mode: 'bike', from: { lat: 42, lon: 1 }, to: { lat: 43, lon: 2 }, duration: 8_000, distance: 1000 },
      { ...second, duration: 37_000 },
    ]);
    const before = useStore.getState().journeySegments;
    useStore.getState().moveTrackToComparison('second', 'first');
    expect(useStore.getState().tracks.map((track) => track.id)).toEqual(['first']);
    expect(useStore.getState().journeySegments).toEqual([before[0]]);
    expect(useStore.getState().comparisonTracks[0]).toMatchObject({ id: 'second', groupId: 'first', track: { activityIcon: 'svg-walking' } });
    useStore.getState().ungroupComparisonTrack('second');
    expect(useStore.getState().tracks.map((track) => track.id)).toEqual(['first', 'second']);
    expect(useStore.getState().journeySegments).toEqual(before);
    expect(useStore.getState().comparisonTracks).toEqual([]);
  });

  it('keeps the primary route and ignores repeated or invalid comparison moves', () => {
    const useStore = createAppStore();
    useStore.getState().addTrack(createTrack({ id: 'first' }));
    useStore.getState().addTrack(createTrack({ id: 'second' }));
    useStore.getState().moveTrackToComparison('first', 'first');
    useStore.getState().moveTrackToComparison('second', 'missing');
    expect(useStore.getState().tracks).toHaveLength(2);
    useStore.getState().moveTrackToComparison('second', 'first');
    useStore.getState().moveTrackToComparison('second', 'first');
    expect(useStore.getState().tracks).toHaveLength(1);
    expect(useStore.getState().comparisonTracks).toHaveLength(1);
  });

  it('starts live route comparison at half speed without changing authored duration', () => {
    const useStore = createAppStore();
    const start = createTrack().points[0];
    const points = [
      { ...start, time: new Date('2026-10-25T10:00:00Z') },
      { ...start, lat: 42.01, distance: 1000, time: new Date('2026-10-25T10:10:00Z') },
    ];
    useStore.getState().addTrack(createTrack({ id: 'first', points, totalDistance: 1000 }));
    useStore.getState().addTrack(createTrack({ id: 'second', points, totalDistance: 1000 }));
    useStore.getState().moveTrackToComparison('second', 'first');
    useStore.getState().setComparisonMode('route');
    expect(useStore.getState().playback.speed).toBe(0.5);
    expect(useStore.getState().journeySegments[0].duration).toBe(60_000);
    useStore.getState().setSpeed(0.25);
    useStore.getState().setComparisonMode('time');
    useStore.getState().setComparisonMode('route');
    expect(useStore.getState().playback.speed).toBe(0.25);
  });

  it('switches to Route and rejects Time when a route has no timestamps', () => {
    const useStore = createAppStore();
    useStore.getState().setSettings({ language: 'en' });
    useStore.getState().addTrack(comparisonReadyTrack('first', 42, true));
    useStore.getState().addTrack(comparisonReadyTrack('second', 42, false));
    useStore.getState().moveTrackToComparison('second', 'first');
    expect(useStore.getState().comparisonMode).toBe('route');
    expect(useStore.getState().error).toContain('Time comparison is unavailable');
    useStore.getState().setComparisonMode('time');
    expect(useStore.getState().comparisonMode).toBe('route');
    useStore.getState().play();
    expect(useStore.getState().playback.isPlaying).toBe(true);
  });

  it('rejects Route when timed routes have no shared points', () => {
    const useStore = createAppStore();
    useStore.getState().setSettings({ language: 'en' });
    useStore.getState().addTrack(comparisonReadyTrack('first', 42, true));
    useStore.getState().addTrack(comparisonReadyTrack('second', 43, true));
    useStore.getState().moveTrackToComparison('second', 'first');
    useStore.getState().setComparisonMode('route');
    expect(useStore.getState().comparisonMode).toBe('time');
    expect(useStore.getState().error).toContain('Route comparison is unavailable');
  });

  it('blocks playback when neither comparison mode is valid', () => {
    const useStore = createAppStore();
    useStore.getState().setSettings({ language: 'en' });
    useStore.getState().addTrack(comparisonReadyTrack('first', 42, true));
    useStore.getState().addTrack(comparisonReadyTrack('second', 43, false));
    useStore.getState().moveTrackToComparison('second', 'first');
    useStore.getState().play();
    expect(useStore.getState().playback.isPlaying).toBe(false);
    expect(useStore.getState().error).toContain('Time comparison is unavailable');
  });

  it('defaults to the satellite map style', () => {
    const useStore = createAppStore();

    expect(useStore.getState().settings.mapStyle).toBe('satellite');
  });

  it('creates the expected journey state when the first imported track is added', () => {
    const useStore = createAppStore();
    const track = createTrack();

    useStore.getState().addTrack(track);

    const state = useStore.getState();
    expect(state.tracks).toHaveLength(1);
    expect(state.activeTrackId).toBe(track.id);
    expect(state.journey?.name).toBe('My Journey');
    expect(state.journeySegments).toHaveLength(1);
    expect(state.journeySegments[0]).toMatchObject({
      type: 'track',
      trackId: track.id,
      duration: 60000,
    });
    expect(state.activePanel).toBe('journey');
    expect(state.settings.trailStyle.trailColor).toBe(track.color);
    expect(state.settings.trailStyle.currentIcon).toBe(DEFAULT_ACTIVITY_ICON);
    expect(state.settings.trailStyle.markerColor).toBe(track.color);
    expect(state.cameraSettings.followBehindPreset).toBe('medium');
    expect(state.cameraSettings.followBehindZoomLevel).toBe(
      getFollowBehindZoomLevelForPreset('medium')
    );
  });

  it('publishes a multi-file import to subscribers once', () => {
    const useStore = createAppStore();
    let publications = 0;
    const unsubscribe = useStore.subscribe(() => {
      publications += 1;
    });

    useStore.getState().addImportedTracks([
      createTrack({ id: 'track-1' }),
      createTrack({ id: 'track-2' }),
      createTrack({ id: 'track-3' }),
    ], []);

    unsubscribe();
    expect(publications).toBe(1);
    expect(useStore.getState().tracks.map((track) => track.id)).toEqual([
      'track-1',
      'track-2',
      'track-3',
    ]);
    expect(useStore.getState().journeySegments).toHaveLength(3);
  });

  it('keeps the default follow-behind preset at medium for long tracks', () => {
    const useStore = createAppStore();
    const longTrack = createTrack({
      totalDistance: 120000,
    });

    useStore.getState().addTrack(longTrack);

    expect(useStore.getState().cameraSettings.followBehindPreset).toBe('medium');
  });

  it('does not override the follow-behind preset after the first track import', () => {
    const useStore = createAppStore();
    const shortTrack = createTrack({
      id: 'track-short',
      totalDistance: 2000,
    });
    const secondTrack = createTrack({
      id: 'track-long',
      totalDistance: 120000,
    });

    useStore.getState().addTrack(shortTrack);
    useStore.getState().setCameraSettings({ followBehindPreset: 'medium' });
    useStore.getState().addTrack(secondTrack);

    expect(useStore.getState().cameraSettings.followBehindPreset).toBe('medium');
  });

  it('preserves a custom marker color when the active track color changes', () => {
    const useStore = createAppStore();
    const track = createTrack({
      color: '#10B981',
    });

    useStore.getState().addTrack(track);
    useStore.getState().setTrailStyle({ markerColor: '#111111' });
    useStore.getState().updateTrackColor(track.id, '#3B82F6');

    const state = useStore.getState();
    expect(state.settings.trailStyle.trailColor).toBe('#3B82F6');
    expect(state.settings.trailStyle.markerColor).toBe('#111111');
  });

  it('updates the active icon when the active track icon changes', () => {
    const useStore = createAppStore();
    const track = createTrack();

    useStore.getState().addTrack(track);
    useStore.getState().updateTrackIcon(track.id, 'svg-running');

    expect(useStore.getState().tracks[0]?.activityIcon).toBe('svg-running');
    expect(useStore.getState().settings.trailStyle.currentIcon).toBe('svg-running');
  });

  it('keeps manual picture placements queued in upload order until the queue is cleared', () => {
    const useStore = createAppStore();
    const firstPlacement = createPendingPlacement('photo-1');
    const secondPlacement = createPendingPlacement('photo-2');

    useStore.getState().queuePendingPicturePlacement(firstPlacement);
    useStore.getState().queuePendingPicturePlacement(secondPlacement);

    expect(useStore.getState().pendingPicturePlacements.map((picture) => picture.id)).toEqual([
      'photo-1',
      'photo-2',
    ]);

    useStore.getState().removePendingPicturePlacement('photo-1');
    expect(useStore.getState().pendingPicturePlacements.map((picture) => picture.id)).toEqual([
      'photo-2',
    ]);

    useStore.getState().clearPendingPicturePlacements();
    expect(useStore.getState().pendingPicturePlacements).toEqual([]);
  });

  it('resets settings with fresh defaults instead of reusing mutated objects', () => {
    const useStore = createAppStore();
    const initialTrailStyle = useStore.getState().settings.trailStyle;

    useStore.getState().setTrailStyle({
      currentIcon: '🚵',
      markerColor: '#123456',
      trackLabel: 'Changed',
    });
    useStore.getState().setSettings({
      mapStyle: 'street',
    });

    useStore.getState().reset();

    const state = useStore.getState();
    expect(state.settings.mapStyle).toBe('satellite');
    expect(state.settings.trailStyle.currentIcon).toBe(DEFAULT_ACTIVITY_ICON);
    expect(state.settings.trailStyle.markerColor).toBe('#56C596');
    expect(state.settings.trailStyle.trackLabel).toBe('Track 1');
    expect(state.settings.journeyStatsMode).toBe('per-track');
    expect(state.settings.trailStyle).not.toBe(initialTrailStyle);
  });

  it('locks the sidebar on export while recording is active', () => {
    const useStore = createAppStore();

    useStore.getState().setActivePanel('settings');
    useStore.getState().setIsExporting(true);

    expect(useStore.getState().activePanel).toBe('export');

    useStore.getState().setActivePanel('settings');
    expect(useStore.getState().activePanel).toBe('export');

    useStore.getState().setIsExporting(false);
    useStore.getState().setActivePanel('settings');
    expect(useStore.getState().activePanel).toBe('settings');
  });

  it('keeps the Studio delivery email while working on a project and clears it on reset', () => {
    const useStore = createAppStore();

    useStore.getState().setStudioDeliveryEmail('rider@example.com');
    useStore.getState().setActivePanel('export');
    useStore.getState().setActivePanel('settings');
    useStore.getState().setActivePanel('export');

    expect(useStore.getState().studioDeliveryEmail).toBe('rider@example.com');

    useStore.getState().reset();

    expect(useStore.getState().studioDeliveryEmail).toBe('');
  });
});
