import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { createAppStore } from '@/store/createAppStore';
import { parseGPX } from '@/utils/gpxParser';
import { buildReplayArchive } from './buildReplayArchive';
import type { ReplayManifest, ReplayProjectFile } from './types';

const sampleGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TrailReplay">
  <trk>
    <name>Ridge Loop</name>
    <trkseg>
      <trkpt lat="42.10000" lon="1.20000"><ele>1000</ele><time>2025-01-01T10:00:00.000Z</time></trkpt>
      <trkpt lat="42.10050" lon="1.20050"><ele>1015</ele><time>2025-01-01T10:05:00.000Z</time></trkpt>
      <trkpt lat="42.10100" lon="1.20100"><ele>1005</ele><time>2025-01-01T10:10:00.000Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;

describe('buildReplayArchive', () => {
  it('produces a zip with a manifest, project.json, and one gpx per track', async () => {
    const store = createAppStore();
    const track = parseGPX(sampleGpx, 'ridge-loop.gpx');
    store.getState().addTrack(track);
    store.getState().setCameraPosition({ lat: 42.1, lon: 1.2, zoom: 15.75, pitch: 42, bearing: 123 });
    store.getState().addPicture({
      id: 'picture-1',
      file: new File(['image'], 'summit.jpg', { type: 'image/jpeg' }),
      url: 'blob:summit',
      isPlaceholder: false,
      progress: 0.4,
      position: 0.4,
      displayDuration: 5000,
    });

    const blob = await buildReplayArchive(store.getState());
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const files = unzipSync(bytes);

    expect(files['manifest.json']).toBeDefined();
    expect(files['project.json']).toBeDefined();

    const manifest = JSON.parse(strFromU8(files['manifest.json'])) as ReplayManifest;
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.trackCount).toBe(1);
    expect(manifest.pictureCount).toBe(1);

    const project = JSON.parse(strFromU8(files['project.json'])) as ReplayProjectFile;
    expect(project.tracks).toHaveLength(1);
    expect(project.tracks[0].id).toBe(track.id);
    expect(project.pictures).toHaveLength(1);
    expect(project.cameraPosition).toEqual({ lat: 42.1, lon: 1.2, zoom: 15.75, pitch: 42, bearing: 123 });
    expect(project.pictures![0]).toMatchObject({
      id: 'picture-1',
      originalFileName: 'summit.jpg',
      progress: 0.4,
    });
    expect((project.pictures![0] as unknown as { file?: unknown }).file).toBeUndefined();

    const routeFile = project.tracks[0].routeFile;
    expect(files[routeFile]).toBeDefined();
    const gpxText = strFromU8(files[routeFile]);
    const reparsed = parseGPX(gpxText, 'ridge-loop.gpx');
    expect(reparsed.points).toHaveLength(track.points.length);
  });
});
