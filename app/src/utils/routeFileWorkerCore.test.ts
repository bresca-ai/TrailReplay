import { describe, expect, it } from 'vitest';
import { parseRouteFileBatch } from './routeFileWorkerCore';

const gpx = `<?xml version="1.0"?>
<gpx><trk><name>Worker route</name><trkseg>
  <trkpt lat="42" lon="1"><ele>100</ele><time>2026-01-01T10:00:00Z</time></trkpt>
  <trkpt lat="42.001" lon="1.001"><ele>120</ele><time>2026-01-01T10:01:00Z</time></trkpt>
</trkseg></trk></gpx>`;

describe('route file worker core', () => {
  it('decodes and computes route files as one worker batch', async () => {
    const response = await parseRouteFileBatch([
      new File([gpx], 'route.gpx'),
      new File(['<gpx><trk>'], 'broken.gpx'),
      new File(['ignored'], 'notes.txt'),
    ]);

    expect(response.parsed).toHaveLength(1);
    expect(response.parsed[0].fileName).toBe('route.gpx');
    expect(response.parsed[0].track.name).toBe('Worker route');
    expect(response.parsed[0].track.totalDistance).toBeGreaterThan(0);
    expect(response.parsed[0].track.elevationGain).toBe(20);
    expect(response.failures).toEqual([
      { fileName: 'broken.gpx', message: 'Invalid GPX file format' },
    ]);
  });
});
