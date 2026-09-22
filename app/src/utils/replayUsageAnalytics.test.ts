import { describe, expect, it, vi } from 'vitest';
import { createAppStore } from '@/store/createAppStore';
import { parseGPX } from './gpxParser';
import { cameraSettingsParams, createReplayUsageAnalytics, reportReplayFeatures } from './replayUsageAnalytics';

function project() {
  const store = createAppStore();
  store.getState().addTrack(parseGPX('<gpx><trk><trkseg><trkpt lat="41" lon="2"><ele>10</ele></trkpt><trkpt lat="42" lon="3"><ele>20</ele></trkpt></trkseg></trk></gpx>', 'private.gpx'));
  return store;
}

describe('replay usage analytics', () => {
  it('captures exact distance and stability, including defaults, without pretending legacy zoom is rendered zoom', () => {
    const store = project();
    store.getState().setCameraSettings({ followBehindZoomLevel: 49.5, cameraStability: 0.35, zoom: 99 });
    expect(cameraSettingsParams(store.getState())).toMatchObject({ camera_distance_level: 49.5, camera_stability_value: 0.35, camera_mode: 'follow-behind' });
    expect(cameraSettingsParams(store.getState())).not.toHaveProperty('camera_zoom_level');
    store.getState().setCameraMode('overview');
    expect(cameraSettingsParams(store.getState())).toEqual({ camera_mode: 'overview' });
  });

  it('reports only available stats and excludes hidden or placeholder media', () => {
    const store = project();
    store.setState({
      pictures: [{ id: 'p', isPlaceholder: true } as never],
      videos: [{ id: 'v', isPlaceholder: true } as never],
    });
    store.getState().setSettings({ visibleStats: ['distance', 'heartRate', 'pace'], showPictures: false });
    const emit = vi.fn();
    reportReplayFeatures(store.getState(), 'playback', emit);
    const features = emit.mock.calls.map(([, params]) => params);
    expect(features.filter((p) => p.feature_name === 'statistic').map((p) => p.feature_value)).toEqual(['distance']);
    expect(features.some((p) => ['photos', 'videos'].includes(p.feature_name))).toBe(false);
    expect(features).toContainEqual(expect.objectContaining({ feature_name: 'follow_behind_distance_level', feature_value: '33', feature_context: 'playback' }));
  });

  it('samples applied poses at most once per quarter and never sends route locations', () => {
    const store = project();
    const emit = vi.fn();
    const tracker = createReplayUsageAnalytics(emit);
    const stop = store.subscribe(tracker.observe);
    tracker.start(store.getState(), 'playback');
    store.getState().setAnimationPhase('playing');
    store.getState().play();
    for (let i = 0; i <= 100; i++) {
      store.getState().setPlayback({ progress: i / 100 });
      store.getState().setCameraPosition({ lat: 41.12345 + i / 1000, lon: 2.98765, zoom: 14.75, pitch: 44, bearing: 123 });
    }
    const samples = emit.mock.calls.filter(([name]) => name === 'camera_view_sampled');
    expect(samples).toHaveLength(5);
    expect(samples.map(([, p]) => p.sample_quarter)).toEqual([0, 1, 2, 3, 4]);
    expect(samples[0][1]).toMatchObject({ camera_zoom_level: 14.75, camera_pitch_deg: 44, camera_bearing_deg: 123 });
    expect(JSON.stringify(emit.mock.calls)).not.toMatch(/41\.12345|2\.98765|private|latitude|longitude/);
    const ids = new Set(emit.mock.calls.map(([, p]) => p.usage_id));
    expect(ids.size).toBe(1);
    stop();
  });

  it('does not sample idle, paused, stale poses or the wrong export context, and resets on a new run', () => {
    const store = project();
    const emit = vi.fn();
    const tracker = createReplayUsageAnalytics(emit);
    store.subscribe(tracker.observe);
    tracker.start(store.getState(), 'playback');
    const pose = { lat: 0, lon: 0, zoom: 15, pitch: 55, bearing: 0 };
    store.getState().setCameraPosition(pose);
    store.getState().setAnimationPhase('playing');
    store.getState().setCameraPosition({ ...pose, zoom: 16 });
    store.getState().play();
    store.getState().setPlayback({ progress: 0.3 }); // still a stale pose
    store.getState().setIsExporting(true);
    store.getState().setCameraPosition({ ...pose, zoom: 17 });
    expect(emit.mock.calls.filter(([name]) => name === 'camera_view_sampled')).toHaveLength(0);
    tracker.start(store.getState(), 'video_export');
    store.getState().setCameraPosition(pose);
    expect(emit.mock.calls.filter(([name]) => name === 'camera_view_sampled')).toHaveLength(1);
    tracker.start(store.getState(), 'video_export');
    store.getState().setCameraPosition({ ...pose, zoom: 18 });
    expect(emit.mock.calls.filter(([name]) => name === 'camera_view_sampled')).toHaveLength(2);
  });

  it('keeps all snapshots within GA4 limits including common and operation fields', () => {
    const emit = vi.fn();
    const tracker = createReplayUsageAnalytics(emit);
    tracker.start(project().getState(), 'video_export');
    for (const [, params] of emit.mock.calls) expect(Object.keys(params).length + 4 + 2).toBeLessThanOrEqual(25);
  });
});
