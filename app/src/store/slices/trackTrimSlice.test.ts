import { describe, expect, it } from 'vitest';
import { createAppStore } from '@/store/createAppStore';
import { createTrimTestTrack } from '@/test/fixtures/trimTrack';
import { buildComputedJourney } from '@/utils/journeyUtils';
import { hasTrackTrimDependencies } from './trackTrimSlice';

function setup() {
  const store = createAppStore();
  const track = createTrimTestTrack();
  store.getState().addTrack(track);
  return { store, track };
}

describe('track trimming in the app store', () => {
  it('previews without changing the track, resets playback, and cancels without edits', () => {
    const { store, track } = setup();
    store.getState().setPlayback({ isPlaying: true, progress: 0.6, currentTime: 36000 });
    store.getState().setAnimationPhase('outro');
    const tracks = store.getState().tracks;
    store.getState().setTrackTrimPreview({ trackId: track.id, startIndex: 1, endIndex: 4 });
    expect(store.getState().tracks).toBe(tracks);
    expect(store.getState().playback).toMatchObject({ isPlaying: false, currentTime: 0, progress: 0 });
    expect(store.getState().animationPhase).toBe('idle');
    store.getState().setTrackTrimPreview(null);
    expect(store.getState().trackTrimPreview).toBeNull();
    expect(store.getState().tracks).toBe(tracks);
  });

  it('applies to the existing journey and restores the first original after repeated trims', () => {
    const { store, track } = setup();
    const segments = store.getState().journeySegments;
    expect(store.getState().applyTrackTrim(track.id, 1, 4)).toBe(true);
    const after = store.getState();
    expect(after.tracks[0].points).toHaveLength(4);
    expect(after.journeySegments).toBe(segments);
    const journey = buildComputedJourney(after.journeySegments, after.tracks)!;
    expect(journey.coordinates[0]).toMatchObject({ lat: track.points[1].lat, lon: track.points[1].lon });
    expect(after.trackTrimOriginals[track.id].points).toEqual(track.points);
    expect(store.getState().applyTrackTrim(track.id, 1, 2)).toBe(true);
    store.getState().updateTrackName(track.id, 'Renamed');
    store.getState().updateTrackColor(track.id, '#000000');
    expect(store.getState().restoreTrackTrim(track.id)).toBe(true);
    expect(store.getState().tracks[0]).toMatchObject({ name: 'Renamed', color: '#000000', points: track.points, totalDistance: track.totalDistance });
    expect(store.getState().trackTrimOriginals).toEqual({});
  });

  it('does not alter another route, a segment duration or original data for invalid/full selections', () => {
    const { store, track } = setup();
    const other = createTrimTestTrack();
    store.getState().addTrack(other);
    store.getState().updateJourneySegmentDuration(store.getState().journeySegments[0].id, 22000);
    expect(store.getState().applyTrackTrim(track.id, 2, 2)).toBe(false);
    expect(store.getState().applyTrackTrim(track.id, 0, 5)).toBe(false);
    expect(store.getState().applyTrackTrim('missing', 1, 4)).toBe(false);
    expect(store.getState().trackTrimOriginals).toEqual({});
    store.getState().applyTrackTrim(track.id, 1, 4);
    expect(store.getState().tracks[1].points).toEqual(other.points);
    expect(store.getState().journeySegments[0].duration).toBe(22000);
  });

  it('guards authored replay content and exporting while allowing standalone previews', () => {
    const { store, track } = setup();
    store.getState().addComparisonTrack({ id: 'comparison', name: 'Other runner', color: '#ffffff', track: createTrimTestTrack(), visible: true, offset: 0 });
    expect(hasTrackTrimDependencies(store.getState())).toBe(true);
    store.getState().setTrackTrimPreview({ trackId: track.id, startIndex: 1, endIndex: 4 });
    expect(store.getState().trackTrimPreview).not.toBeNull();
    expect(store.getState().applyTrackTrim(track.id, 1, 4)).toBe(false);
    store.getState().removeComparisonTrack('comparison');
    store.getState().setIsExporting(true);
    expect(store.getState().trackTrimPreview).toBeNull();
    expect(store.getState().applyTrackTrim(track.id, 1, 4)).toBe(false);
  });

  it.each<[string, (store: ReturnType<typeof createAppStore>) => void]>([
    ['custom elevation sections', (store) => store.getState().setSettings({
      customElevationSections: [{ id: 'custom', segmentIndex: 0, startProgress: 0.4, endProgress: 0.6 }],
    })],
    ['elevation section overrides', (store) => store.getState().setSettings({
      elevationSectionOverrides: [{
        sectionId: 'elevation-0-climb-0', segmentIndex: 0, kind: 'climb',
        detectedStartProgress: 0.2, detectedEndProgress: 0.5, startProgress: 0.3, endProgress: 0.5,
      }],
    })],
    ['hidden elevation sections', (store) => store.getState().setSettings({ hiddenElevationSectionIds: ['elevation-0-climb-0'] })],
    ['trail color zones', (store) => store.getState().setTrailStyle({
      colorZones: [{ id: 'zone', fromProgress: 0.4, toProgress: 0.6, color: '#ff0000' }],
    })],
  ])('guards apply and restore when route-anchored %s exist', (_, author) => {
    const { store, track } = setup();
    expect(store.getState().applyTrackTrim(track.id, 1, 4)).toBe(true);
    author(store);
    expect(hasTrackTrimDependencies(store.getState())).toBe(true);
    const trimmed = store.getState().tracks[0];
    expect(store.getState().applyTrackTrim(track.id, 1, 2)).toBe(false);
    expect(store.getState().restoreTrackTrim(track.id)).toBe(false);
    expect(store.getState().tracks[0]).toBe(trimmed);
    expect(store.getState().trackTrimOriginals[track.id].points).toEqual(track.points);
  });

  it('clears overlays on playback/panel changes and releases original data on remove/reset', () => {
    const { store, track } = setup();
    const range = { trackId: track.id, startIndex: 1, endIndex: 4 };
    store.getState().setTrackTrimPreview(range);
    store.getState().play();
    expect(store.getState().trackTrimPreview).toBeNull();
    store.getState().setTrackTrimPreview(range);
    store.getState().setActivePanel('export');
    expect(store.getState().trackTrimPreview).toBeNull();
    store.getState().applyTrackTrim(track.id, 1, 4);
    store.getState().removeTrack(track.id);
    expect(store.getState().trackTrimOriginals).toEqual({});
    store.getState().addTrack(track);
    store.getState().applyTrackTrim(track.id, 1, 4);
    store.getState().reset();
    expect(store.getState().trackTrimOriginals).toEqual({});
    expect(store.getState().trackTrimPreview).toBeNull();
  });
});
