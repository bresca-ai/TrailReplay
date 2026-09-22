import { describe, expect, it } from 'vitest';
import { createAppStore } from '@/store/createAppStore';
import { parseGPX } from '@/utils/gpxParser';
import { buildReplayArchive } from './buildReplayArchive';
import { parseReplayArchive } from './parseReplayArchive';
import { hydrateProject } from './hydrateProject';

const sampleGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TrailReplay">
  <trk>
    <name>Ridge Loop</name>
    <trkseg>
      <trkpt lat="42.10000" lon="1.20000"><ele>1000</ele></trkpt>
      <trkpt lat="42.10050" lon="1.20050"><ele>1015</ele></trkpt>
      <trkpt lat="42.10100" lon="1.20100"><ele>1005</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`;

describe('hydrateProject', () => {
  it.each(['tracks', 'comparisonTracks'] as const)(
    'keeps the existing session when a later %s route cannot be parsed',
    async (collection) => {
      const store = createAppStore();
      store.getState().addTrack(parseGPX(sampleGpx, 'existing.gpx'));
      store.getState().setUnitSystem('imperial');
      const archive = await buildReplayArchive(store.getState());
      const parsed = await parseReplayArchive(new File([archive], 'broken.replay'));
      parsed[collection].push({
        meta: { routeFile: 'routes/broken.gpx' },
        gpxText: '<gpx><trk><trkseg></gpx>',
      });
      const original = store.getState();

      expect(() => hydrateProject({ ...parsed, project: parsed.project! }, original)).toThrow();
      expect(store.getState()).toBe(original);
    },
  );

  it('restores tracks, journey, pictures (as placeholders), and settings from a saved archive', async () => {
    const sourceStore = createAppStore();
    const track = parseGPX(sampleGpx, 'ridge-loop.gpx');
    sourceStore.getState().addTrack(track);
    sourceStore.getState().updateJourneySegmentDuration(
      sourceStore.getState().journeySegments[0].id,
      45000,
    );
    sourceStore.getState().addPicture({
      id: 'picture-1',
      file: new File(['image'], 'summit.jpg', { type: 'image/jpeg' }),
      url: 'blob:summit',
      isPlaceholder: false,
      progress: 0.5,
      position: 0.5,
      displayDuration: 5000,
      title: 'Summit',
    });
    sourceStore.getState().setUnitSystem('imperial');
    sourceStore.getState().setCameraPosition({ lat: 42.1, lon: 1.2, zoom: 15.75, pitch: 42, bearing: 123 });

    const blob = await buildReplayArchive(sourceStore.getState());
    const parsed = await parseReplayArchive(new File([blob], 'project.replay'));

    const targetStore = createAppStore();
    // Pre-existing content should be fully replaced by hydration.
    targetStore.getState().addTrack(parseGPX(sampleGpx, 'stale.gpx'));

    hydrateProject({ ...parsed, project: parsed.project! }, targetStore.getState());

    const state = targetStore.getState();
    expect(state.tracks).toHaveLength(1);
    expect(state.tracks[0].id).toBe(track.id);
    expect(state.tracks[0].name).toBe('Ridge Loop');
    expect(state.activeTrackId).toBe(track.id);

    expect(state.journeySegments).toHaveLength(1);
    expect(state.journeySegments[0].type).toBe('track');
    expect((state.journeySegments[0] as { trackId: string }).trackId).toBe(track.id);
    expect(state.journeySegments[0].duration).toBe(45000);

    expect(state.pictures).toHaveLength(1);
    expect(state.pictures[0]).toMatchObject({
      id: 'picture-1',
      file: null,
      url: '',
      isPlaceholder: true,
      originalFileName: 'summit.jpg',
      title: 'Summit',
    });

    expect(state.settings.unitSystem).toBe('imperial');
    expect(state.cameraPosition).toEqual({ lat: 42.1, lon: 1.2, zoom: 15.75, pitch: 42, bearing: 123 });
  });

  it('carries a photo route anchor through a save and reopen', async () => {
    const sourceStore = createAppStore();
    sourceStore.getState().addTrack(parseGPX(sampleGpx, 'ridge-loop.gpx'));
    sourceStore.getState().addPicture({
      id: 'picture-anchored',
      file: new File(['image'], 'summit.jpg', { type: 'image/jpeg' }),
      url: 'blob:summit',
      isPlaceholder: false,
      progress: 0.5,
      position: 0.5,
      // Metres from the start of the journey. Without it, a reopened project
      // cannot be recalculated when the timing mode changes afterwards.
      routeDistance: 1234,
      routeSegmentId: sourceStore.getState().journeySegments[0].id,
      routeSegmentDistance: 1234,
      placementSource: 'gps',
      displayDuration: 5000,
    });

    const blob = await buildReplayArchive(sourceStore.getState());
    const parsed = await parseReplayArchive(new File([blob], 'project.replay'));

    const targetStore = createAppStore();
    hydrateProject({ ...parsed, project: parsed.project! }, targetStore.getState());

    expect(targetStore.getState().pictures[0]).toMatchObject({
      routeDistance: 1234,
      routeSegmentId: sourceStore.getState().journeySegments[0].id,
      routeSegmentDistance: 1234,
    });
  });

  it('leaves the anchor absent for projects saved before it existed', async () => {
    const sourceStore = createAppStore();
    sourceStore.getState().addTrack(parseGPX(sampleGpx, 'ridge-loop.gpx'));
    sourceStore.getState().addPicture({
      id: 'picture-legacy',
      file: new File(['image'], 'old.jpg', { type: 'image/jpeg' }),
      url: 'blob:old',
      isPlaceholder: false,
      progress: 0.25,
      position: 0.25,
      displayDuration: 5000,
    });

    const blob = await buildReplayArchive(sourceStore.getState());
    const parsed = await parseReplayArchive(new File([blob], 'project.replay'));

    const targetStore = createAppStore();
    hydrateProject({ ...parsed, project: parsed.project! }, targetStore.getState());

    expect(targetStore.getState().pictures[0].routeDistance).toBeUndefined();
  });

  it('carries camera stability and route timing mode through a save and reopen', async () => {
    const sourceStore = createAppStore();
    sourceStore.getState().addTrack(parseGPX(sampleGpx, 'ridge-loop.gpx'));
    sourceStore.getState().setCameraSettings({ cameraStability: 0.9 });
    sourceStore.getState().setRouteTimingMode('uniform');

    const blob = await buildReplayArchive(sourceStore.getState());
    const parsed = await parseReplayArchive(new File([blob], 'project.replay'));

    const targetStore = createAppStore();
    hydrateProject({ ...parsed, project: parsed.project! }, targetStore.getState());

    const state = targetStore.getState();
    expect(state.cameraSettings.cameraStability).toBe(0.9);
    expect(state.playback.routeTimingMode).toBe('uniform');
  });

  it('defaults route timing mode to recorded for projects saved before it existed', async () => {
    const sourceStore = createAppStore();
    sourceStore.getState().addTrack(parseGPX(sampleGpx, 'ridge-loop.gpx'));
    sourceStore.getState().setRouteTimingMode('uniform');

    const blob = await buildReplayArchive(sourceStore.getState());
    const parsed = await parseReplayArchive(new File([blob], 'project.replay'));
    delete (parsed.project as { routeTimingMode?: unknown }).routeTimingMode;

    const targetStore = createAppStore();
    hydrateProject({ ...parsed, project: parsed.project! }, targetStore.getState());

    expect(targetStore.getState().playback.routeTimingMode).toBe('recorded');
  });

  it('persists stats presentation and defaults legacy projects to the automatic 1x layout', async () => {
    const sourceStore = createAppStore();
    sourceStore.getState().addTrack(parseGPX(sampleGpx, 'ridge-loop.gpx'));
    sourceStore.getState().setSettings({ statsScale: 1.6, statsLayout: 'vertical', statsColumns: 2 });

    const blob = await buildReplayArchive(sourceStore.getState());
    const parsed = await parseReplayArchive(new File([blob], 'project.replay'));

    const scaledStore = createAppStore();
    hydrateProject({ ...parsed, project: parsed.project! }, scaledStore.getState());
    expect(scaledStore.getState().settings.statsScale).toBe(1.6);
    expect(scaledStore.getState().settings.statsLayout).toBe('vertical');
    expect(scaledStore.getState().settings.statsColumns).toBe(2);

    delete (parsed.project!.settings as Record<string, unknown>).statsScale;
    delete (parsed.project!.settings as Record<string, unknown>).statsLayout;
    delete (parsed.project!.settings as Record<string, unknown>).statsColumns;
    const legacyStore = createAppStore();
    hydrateProject({ ...parsed, project: parsed.project! }, legacyStore.getState());
    expect(legacyStore.getState().settings.statsScale).toBe(1);
    expect(legacyStore.getState().settings.statsLayout).toBe('auto');
    expect(legacyStore.getState().settings.statsColumns).toBeNull();
  });
});

describe('cinematic camera keyframes in a saved project', () => {
  it('survives a save and reload, so an authored sequence is not lost', async () => {
    const sourceStore = createAppStore();
    const track = parseGPX(sampleGpx, 'ridge-loop.gpx');
    sourceStore.getState().addTrack(track);
    const segmentId = sourceStore.getState().journeySegments[0].id;

    sourceStore.getState().addCinematicCameraKeyframe({
      id: 'keyframe-1',
      anchor: { routeSegmentId: segmentId, routeSegmentDistance: 120 },
      bearingDeg: 275,
      pitchDeg: 62,
      zoom: 15.5,
      frame: 'world',
      easing: 'smooth',
    });
    sourceStore.getState().addCinematicCameraKeyframe({
      id: 'keyframe-2',
      anchor: { routeSegmentId: segmentId, routeSegmentDistance: 340 },
      bearingDeg: 40,
      pitchDeg: 30,
      zoom: 12,
      frame: 'route',
      easing: 'hold',
    });

    const blob = await buildReplayArchive(sourceStore.getState());
    const parsed = await parseReplayArchive(new File([blob], 'project.replay'));

    const targetStore = createAppStore();
    hydrateProject({ ...parsed, project: parsed.project! }, targetStore.getState());

    // Every field matters: a keyframe that came back with the wrong anchor,
    // frame or easing would silently point the camera somewhere else.
    expect(targetStore.getState().cinematicCameraKeyframes).toEqual(
      sourceStore.getState().cinematicCameraKeyframes,
    );
  });

  it('opens a project saved before cinematic mode existed', async () => {
    const sourceStore = createAppStore();
    sourceStore.getState().addTrack(parseGPX(sampleGpx, 'ridge-loop.gpx'));

    const blob = await buildReplayArchive(sourceStore.getState());
    const parsed = await parseReplayArchive(new File([blob], 'project.replay'));
    // An older file simply has no such key.
    delete (parsed.project as { cinematicCameraKeyframes?: unknown }).cinematicCameraKeyframes;

    const targetStore = createAppStore();
    hydrateProject({ ...parsed, project: parsed.project! }, targetStore.getState());

    expect(targetStore.getState().cinematicCameraKeyframes).toEqual([]);
  });

  // The counterpart to the parser test: a project written by hand or by
  // scripts/make-replay.mjs supplies only routes and landmarks, and everything
  // else has to land on the same defaults a fresh session starts from.
  it('backfills defaults for a minimal hand-authored project', () => {
    const store = createAppStore();

    hydrateProject({
      manifest: {
        formatVersion: 1, appVersion: '0.0.0', projectName: 'Race',
        createdAt: '', savedAt: '', trackCount: 1, pictureCount: 0, videoCount: 0,
      },
      project: {
        formatVersion: 1,
        tracks: [{ routeFile: 'routes/ridge-loop.gpx', name: 'Stage 1' }],
        userLandmarks: [{
          id: 'aid-1', type: 'aid-station', source: 'user', display: 'highlight',
          lat: 42.1005, lon: 1.2005, progress: 0.5, title: 'Aid 1', importance: 5,
        }],
        settings: { trailStyle: { trailColor: '#123456' } as never },
      },
      tracks: [{ meta: { routeFile: 'routes/ridge-loop.gpx', name: 'Stage 1' }, gpxText: sampleGpx }],
      comparisonTracks: [],
      recipe: null,
      routes: [],
    }, store.getState());

    const state = store.getState();
    expect(state.tracks).toHaveLength(1);
    // The authored name wins over the GPX's own <name>.
    expect(state.tracks[0].name).toBe('Stage 1');
    expect(state.activeTrackId).toBe(state.tracks[0].id);
    expect(state.userLandmarks).toHaveLength(1);
    expect(state.userLandmarks[0].title).toBe('Aid 1');

    // Omitted collections come back empty rather than undefined.
    expect(state.pictures).toEqual([]);
    expect(state.videos).toEqual([]);
    expect(state.textAnnotations).toEqual([]);

    // An omitted journey means "same as dropping these GPX files on the page",
    // so addTrack's segment survives and the track actually plays.
    expect(state.journeySegments).toHaveLength(1);
    expect(state.journeySegments[0]).toMatchObject({ type: 'track', trackId: state.tracks[0].id });

    // A partial trailStyle keeps the rest of the defaults.
    expect(state.settings.trailStyle.trailColor).toBe('#123456');
    expect(state.settings.trailStyle.markerType).toBe('dot');
    expect(state.settings.unitSystem).toBe('metric');
    expect(state.videoExportSettings.fps).toBe(30);
    expect(state.socialShareSettings.aspectRatio).toBe('4:5');
    expect(state.playback.routeTimingMode).toBe('recorded');
  });

  it('keeps a segment per track so a multi-track project plays end to end', () => {
    const store = createAppStore();
    const meta = (n: number) => ({ routeFile: `routes/leg-${n}.gpx`, name: `Leg ${n}` });

    hydrateProject({
      manifest: {
        formatVersion: 1, appVersion: '0.0.0', projectName: 'Traverse',
        createdAt: '', savedAt: '', trackCount: 3, pictureCount: 0, videoCount: 0,
      },
      project: { formatVersion: 1, tracks: [meta(1), meta(2), meta(3)] },
      tracks: [1, 2, 3].map((n) => ({ meta: meta(n), gpxText: sampleGpx })),
      comparisonTracks: [],
      recipe: null,
      routes: [],
    }, store.getState());

    const state = store.getState();
    expect(state.tracks).toHaveLength(3);
    expect(state.journeySegments).toHaveLength(3);
    expect(state.journeySegments.map((s) => (s as { trackId: string }).trackId))
      .toEqual(state.tracks.map((t) => t.id));
  });

  it('honours an explicit empty journey', () => {
    const store = createAppStore();
    const meta = { routeFile: 'routes/leg.gpx', name: 'Leg' };

    hydrateProject({
      manifest: {
        formatVersion: 1, appVersion: '0.0.0', projectName: 'Solo',
        createdAt: '', savedAt: '', trackCount: 1, pictureCount: 0, videoCount: 0,
      },
      project: { formatVersion: 1, tracks: [meta], journeySegments: [] },
      tracks: [{ meta, gpxText: sampleGpx }],
      comparisonTracks: [],
      recipe: null,
      routes: [],
    }, store.getState());

    expect(store.getState().journeySegments).toEqual([]);
  });
});
