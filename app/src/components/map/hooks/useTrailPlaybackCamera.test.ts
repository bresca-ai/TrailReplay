import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useTrailPlaybackCamera,
  resolvePlaybackMarkerColor,
  shouldRenderPlaybackAdornment,
  updatePlaybackMarkerElement,
} from './useTrailPlaybackCamera';

describe('playback marker presentation', () => {
  it('preserves the icon, pulse, and label nodes during unchanged playback updates', () => {
    const element = document.createElement('div');
    const html = '<span class="pulse">runner</span>';
    const label = { color: '#123456', fontFamily: 'Inter', text: 'Race' };
    updatePlaybackMarkerElement(element, html, label);
    const iconNode = element.firstChild;
    const labelNode = element.lastChild;
    updatePlaybackMarkerElement(element, html, { ...label });
    expect(element.firstChild).toBe(iconNode);
    expect(element.lastChild).toBe(labelNode);
    updatePlaybackMarkerElement(element, html, { ...label, text: 'Second leg' });
    expect(element.querySelector('.tr-marker-label')?.textContent).toBe('Second leg');
  });
  it('uses each journey track color while the marker color remains linked to the active track', () => {
    expect(resolvePlaybackMarkerColor('#C1652F', '#c1652f', '#3B82F6')).toBe('#3B82F6');
    expect(resolvePlaybackMarkerColor('#111111', '#C1652F', '#3B82F6')).toBe('#111111');
  });

  it('keeps the label in the marker element and treats imported names as text', () => {
    const element = document.createElement('div');
    updatePlaybackMarkerElement(
      element,
      '<span data-testid="marker-center"></span>',
      { color: '#3B82F6', fontFamily: "'Inter', sans-serif", text: '<img src=x onerror=alert(1)>' },
    );

    expect(element.querySelector('[data-testid="marker-center"]')).not.toBeNull();
    expect(element.querySelector('.tr-marker-label')?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect((element.querySelector('.tr-marker-label') as HTMLElement).style.fontFamily).toContain('Inter');
    expect(element.querySelector('.tr-marker-label img')).toBeNull();
  });

  it('never renders the moving marker or label over an active track annotation', () => {
    expect(shouldRenderPlaybackAdornment({
      activeTextAnnotationId: 'annotation-1',
      animationPhase: 'playing',
      playbackProgress: 0.5,
      showMarker: true,
      showTrackLabels: true,
    })).toBe(false);

    expect(shouldRenderPlaybackAdornment({
      activeTextAnnotationId: null,
      animationPhase: 'playing',
      playbackProgress: 0.5,
      showMarker: true,
      showTrackLabels: true,
    })).toBe(true);
  });

  it('shows the start marker during the intro without showing it during tile preloading', () => {
    const options = {
      activeTextAnnotationId: null,
      playbackProgress: 0,
      showMarker: true,
      showTrackLabels: false,
    };

    expect(shouldRenderPlaybackAdornment({ ...options, animationPhase: 'preloading' })).toBe(false);
    expect(shouldRenderPlaybackAdornment({ ...options, animationPhase: 'intro' })).toBe(true);
  });
});


describe('camera transition handoff', () => {
  it('starts at the live camera pose and retains its smoothing state on arrival', () => {
    let pose = { center: [2, 41] as [number, number], zoom: 14, pitch: 25, bearing: 30 };
    const map = {
      getCenter: () => ({ lng: pose.center[0], lat: pose.center[1] }),
      getZoom: () => pose.zoom, getPitch: () => pose.pitch, getBearing: () => pose.bearing,
      getMinZoom: () => 0, getMaxZoom: () => 22,
      getSource: () => undefined, queryTerrainElevation: () => null,
      getCenterClampedToGround: () => true, setCenterClampedToGround: vi.fn(),
      jumpTo: (next: typeof pose) => { pose = { ...pose, ...next }; },
    };
    const transition = { segmentIndex: 1, startCoordIndex: 1, endCoordIndex: 2, transportMode: 'camera', progressStartRatio: 0.4, progressEndRatio: 0.6, cameraTransitionZoom: 8, cameraTransitionPitch: 35 };
    const props = {
      activeTrack: null, activeTextAnnotationId: null, allCoordinates: [[1, 41], [2, 41], [5, 42], [6, 42]],
      cameraCoordinates: [[1, 41], [2, 41], [5, 42], [6, 42]], animationPhase: 'playing', cameraMode: 'follow', cameraStability: 0.5,
      currentTimeMs: 4000, completedCoordinates: [], computedJourney: null, currentIcon: '', currentPosition: { lat: 41, lon: 2, elevation: 0 },
      recordedElevationEnabled: true, currentSegment: { segment: transition, localProgress: 0 }, currentTrackColor: null, currentTrackName: null,
      elevationData: [], followBehindZoomLevel: 1, isInTransport: true, isMapLoaded: true,
      mapRef: { current: map }, markerRef: { current: null }, playbackProgress: 0.4,
      segmentTimings: [{ ...transition, type: 'transport' }], setCameraPosition: vi.fn(), totalDurationMs: 10000,
      smoothBearingRef: { current: 30 }, targetBearingRef: { current: 30 }, isExporting: false, isPlaying: true,
      trailStyle: { colorMode: 'fixed', colorZones: [], currentIcon: '', markerColor: '#000', markerSize: 1, markerType: 'icon', overlayFont: 'inter', showCircle: false, showMarker: false, showTrackLabels: false, trailColor: '#000' },
    } as unknown as Parameters<typeof useTrailPlaybackCamera>[0];
    const { rerender } = renderHook((input) => useTrailPlaybackCamera(input), { initialProps: props });
    expect(pose).toEqual({ center: [2, 41], zoom: 14, pitch: 25, bearing: 30 });
    rerender({ ...props, currentTimeMs: 5000, playbackProgress: 0.5, currentSegment: { segment: transition, localProgress: 0.5 } });
    expect(pose.zoom).toBe(8);
    expect(pose.pitch).toBe(35);
    rerender({ ...props, currentTimeMs: 6000, playbackProgress: 0.6, currentPosition: { lat: 42, lon: 5, elevation: 0 }, currentSegment: { segment: transition, localProgress: 1 } });
    const arrival = { ...pose, center: [...pose.center] };
    expect(arrival.center).toEqual([5, 42]);
    rerender({ ...props, currentTimeMs: 6010, playbackProgress: 0.601, currentPosition: { lat: 42, lon: 5.001, elevation: 0 }, currentSegment: { segment: { segmentIndex: 2, startCoordIndex: 3, endCoordIndex: 3 }, localProgress: 0.001 }, isInTransport: false });
    expect(Math.abs(pose.zoom - arrival.zoom)).toBeLessThan(0.1);
    expect(Math.abs(pose.center[0] - arrival.center[0])).toBeLessThan(0.1);
    expect(Math.abs(pose.pitch - arrival.pitch)).toBeLessThan(0.1);
  });
});
it('starts the intro at the selected place before flying to the route', () => {
  const jumpTo = vi.fn(), flyTo = vi.fn(), easeTo = vi.fn(), once = vi.fn();
  const map = { getCenter: () => ({ lng: 2, lat: 41 }), getZoom: () => 12, getPitch: () => 0, getBearing: () => 0,
    getSource: () => undefined, on: vi.fn(), off: vi.fn(), stop: vi.fn(), jumpTo, flyTo, easeTo, once };
  const introStartOverride = { center: [2, 41] as [number, number], zoom: 6, pitch: 0, bearing: 0 };
  const props = { activeTrack: null, activeTextAnnotationId: null, allCoordinates: [[2, 41], [3, 42]], cameraCoordinates: [[2, 41], [3, 42]],
    introStartOverride, animationPhase: 'intro', cameraMode: 'follow', cameraStability: 0.5, currentTimeMs: 0,
    completedCoordinates: [], computedJourney: null, currentIcon: '', currentPosition: null, currentSegment: null,
    currentTrackColor: null, currentTrackName: null, elevationData: [], followBehindZoomLevel: 33, isInTransport: false,
    isMapLoaded: true, mapRef: { current: map }, markerRef: { current: null }, playbackProgress: 0, segmentTimings: [],
    setCameraPosition: vi.fn(), totalDurationMs: 60000, smoothBearingRef: { current: 0 }, targetBearingRef: { current: 0 },
    isExporting: false, isPlaying: true, trailStyle: { colorMode: 'fixed', colorZones: [], currentIcon: '', markerColor: '#000', markerSize: 1,
      markerType: 'dot', overlayFont: 'inter', showCircle: false, showMarker: false, showTrackLabels: false, trailColor: '#000' },
  } as unknown as Parameters<typeof useTrailPlaybackCamera>[0];
  const { rerender } = renderHook((input) => useTrailPlaybackCamera(input), { initialProps: props });
  expect(jumpTo).toHaveBeenCalledWith(introStartOverride);
  expect(flyTo).toHaveBeenCalledWith(expect.objectContaining({ center: [2, 41], zoom: 14 }));
  const introRegionOverride = { center: [2.5, 41.5] as [number, number], zoom: 8, pitch: 0, bearing: 0 };
  rerender({ ...props, introRegionOverride, locationChapters: { level: 'region', introCountryFirst: true, introDurationSeconds: 10 } as NonNullable<typeof props.locationChapters> });
  expect(easeTo).toHaveBeenCalledWith(expect.objectContaining({ ...introRegionOverride, duration: 4000 }));
  expect(once).toHaveBeenCalledWith('moveend', expect.any(Function));
  once.mock.calls[0][1]();
  expect(flyTo).toHaveBeenLastCalledWith(expect.objectContaining({ center: [2, 41], duration: 6000 }));
});
