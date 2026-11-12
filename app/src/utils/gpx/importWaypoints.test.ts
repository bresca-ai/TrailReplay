import { describe, expect, it } from 'vitest';
import { parseGPX } from '@/utils/gpxParser';
import { parseRouteFileBatch } from '@/utils/routeFileWorkerCore';
import { buildComputedJourney } from '@/utils/journeyUtils';
import { importWaypoints } from './importWaypoints';

const gpx = `<gpx xmlns="http://www.topografix.com/GPX/1/1">
<wpt lat="41" lon="2.005"><ele>475</ele><name><![CDATA[avituallament]]></name><cmt>avituallament</cmt></wpt>
<wpt lat="999" lon="2"><name>invalid</name></wpt>
<trk><name>Trail</name><trkseg><trkpt lat="41" lon="2"/><trkpt lat="41" lon="2.01"/></trkseg></trk></gpx>`;

describe('GPX waypoints', () => {
  it('places named waypoints as editable annotations on the route', () => {
    const track = parseGPX(gpx, 'trail.gpx');
    expect(track.waypoints).toEqual([{ lat: 41, lon: 2.005, elevation: 475, name: 'avituallament' }]);
    const journey = buildComputedJourney([{ id: 'leg', type: 'track', trackId: track.id, duration: 60000 }], [track]);
    const landmarks = importWaypoints([track], [track], journey, 'map-card', 'recorded');
    expect(landmarks).toHaveLength(1);
    expect(landmarks[0]).toMatchObject({ title: 'avituallament', presentation: 'map-card', routeDistance: expect.any(Number) });
    expect(landmarks[0].progress).toBeCloseTo(0.5, 2);
    expect(importWaypoints([track, track], [track], journey, 'side-panel', 'recorded')).toMatchObject([{ title: 'avituallament', presentation: 'side-panel', logo: 'map:pin' }]);
  });
  it('preserves waypoints when parsing in a worker', async () => {
    const result = await parseRouteFileBatch([new File([gpx], 'trail.gpx')]);
    expect(result.parsed[0].track.waypoints).toEqual(parseGPX(gpx, 'trail.gpx').waypoints);
  });
});
