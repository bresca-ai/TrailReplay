import { describe, expect, it } from 'vitest';
import { getPointAtDistance, parseGPX, parseGPXFiles, parseKML } from './gpxParser';

const sampleGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TrailReplay">
  <trk>
    <name>Sample GPX</name>
    <trkseg>
      <trkpt lat="42.0" lon="1.0">
        <ele>1000</ele>
        <time>2025-01-01T10:00:00Z</time>
      </trkpt>
      <trkpt lat="42.0005" lon="1.0005">
        <ele>1015</ele>
        <time>2025-01-01T10:05:00Z</time>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`;

const sampleKml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Placemark>
    <name>Sample KML</name>
    <LineString>
      <coordinates>
        1.0,42.0,1000 1.0005,42.0005,1015
      </coordinates>
    </LineString>
  </Placemark>
</kml>`;

describe('gpxParser', () => {
  it('parses GPX tracks into computed track stats', () => {
    const track = parseGPX(sampleGpx, 'sample.gpx');

    expect(track.name).toBe('Sample GPX');
    expect(track.points).toHaveLength(2);
    expect(track.totalDistance).toBeGreaterThan(0);
    expect(track.elevationGain).toBe(15);
    expect(track.totalTime).toBe(300);
  });

  it('parses KML LineStrings into tracks', () => {
    const track = parseKML(sampleKml, 'sample.kml');

    expect(track.name).toBe('Sample KML');
    expect(track.points).toHaveLength(2);
    expect(track.totalDistance).toBeGreaterThan(0);
    expect(track.elevationGain).toBe(15);
  });

  it('accepts KML coordinates at geographic boundaries and ignores malformed tuples', () => {
    const track = parseKML(`<?xml version="1.0"?>
      <kml><Placemark><LineString><coordinates>
        180,90,1 invalid 1 181,0 -180,-90,2
      </coordinates></LineString></Placemark></kml>`, 'bounds.kml');

    expect(track.points).toHaveLength(2);
    expect(track.points.map((point) => [point.lat, point.lon])).toEqual([
      [90, 180],
      [-90, -180],
    ]);
  });

  it('rejects a KML route when all LineString coordinates are non-finite or out of range', () => {
    expect(() => parseKML(`<?xml version="1.0"?>
      <kml><Placemark><LineString><coordinates>
        Infinity,0 0,Infinity 181,0 0,91
      </coordinates></LineString></Placemark></kml>`, 'invalid.kml'))
      .toThrow('at least two valid coordinates');
  });

  it('filters invalid GX Track coordinates without throwing on missing coordinate fields', () => {
    const track = parseKML(`<?xml version="1.0"?>
      <kml xmlns:gx="http://www.google.com/kml/ext/2.2"><Placemark><gx:Track>
        <when>2026-01-01T00:00:00Z</when><when>2026-01-01T00:01:00Z</when>
        <when>2026-01-01T00:02:00Z</when><when>2026-01-01T00:03:00Z</when>
        <gx:coord>1 42 10</gx:coord><gx:coord>181 42 10</gx:coord>
        <gx:coord>2</gx:coord><gx:coord>2 43 11</gx:coord>
      </gx:Track></Placemark></kml>`, 'gx-validation.kml');

    expect(track.points).toHaveLength(2);
    expect(track.points.map((point) => [point.lat, point.lon])).toEqual([[42, 1], [43, 2]]);
  });

  it('interpolates a point by distance along a track', () => {
    const track = parseGPX(sampleGpx, 'sample.gpx');
    const midpoint = getPointAtDistance(track, track.totalDistance / 2);

    expect(midpoint).not.toBeNull();
    expect(midpoint!.lat).toBeGreaterThan(track.points[0].lat);
    expect(midpoint!.lat).toBeLessThan(track.points[1].lat);
    expect(midpoint!.distance).toBeCloseTo(track.totalDistance / 2, 5);
  });

  it('skips invalid coordinates and invalid timestamps without poisoning track stats', () => {
    const track = parseGPX(`<?xml version="1.0"?>
      <gpx><trk><trkseg>
        <trkpt lat="invalid" lon="1.0"><time>not-a-date</time></trkpt>
        <trkpt lat="42.0" lon="1.0"><ele>100</ele><time>not-a-date</time></trkpt>
        <trkpt lat="42.001" lon="1.001"><ele>110</ele><time>2025-01-01T10:01:00Z</time></trkpt>
      </trkseg></trk></gpx>`, 'validation.gpx');

    expect(track.points).toHaveLength(2);
    expect(track.points[0].time).toBeNull();
    expect(track.totalDistance).toBeGreaterThan(0);
    expect(track.totalTime).toBe(0);
    expect(track.bounds.minLat).toBe(42);
  });

  it('requires two valid points to build a replayable route', () => {
    expect(() => parseGPX(`<?xml version="1.0"?>
      <gpx><trk><trkseg><trkpt lat="42" lon="1" /></trkseg></trk></gpx>`, 'single-point.gpx'))
      .toThrow('at least two valid track points');
  });

  it('accepts uppercase GPX extensions from file pickers', async () => {
    const file = new File([sampleGpx], 'SAMPLE.GPX', { type: 'application/gpx+xml' });

    await expect(parseGPXFiles([file])).resolves.toHaveLength(1);
  });
});
