import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { createRouteImportBookmarkletHref } from './routeImportBookmarklet';

describe('createRouteImportBookmarkletHref', () => {
  it('converts the full Wikiloc map track into GPX and sends it to TrailReplay', () => {
    const source = decodeURIComponent(createRouteImportBookmarkletHref('https://trailreplay.example').slice('javascript:'.length));
    const app = { postMessage: vi.fn(), close: vi.fn() };
    const listeners = new Map<string, (event: unknown) => void>();
    const alert = vi.fn();
    const fetch = vi.fn(() => { throw new Error('The bookmark must not request Wikiloc downloads'); });
    const decode = vi.fn(() => ({ features: [{ geometry: { type: 'LineString', coordinates: [
      [0.646152, 42.631753, 2912.9, -1000],
      [0.646200, 42.631800, 2914.1, 1000],
    ] } }] }));
    const start = Date.parse('2024-01-01T00:00:00.000Z');
    const window = {
      open: vi.fn(() => app),
      addEventListener: vi.fn((name: string, listener: (event: unknown) => void) => listeners.set(name, listener)),
      removeEventListener: vi.fn((name: string) => listeners.delete(name)),
      mapData: { mapData: [{ spaId: 105740853, nom: 'Aneto & Coronas', geom: 'AQID', trackStartTimestamp: start }] },
      twkb: { toGeoJSON: decode },
    };

    runInNewContext(source, {
      window,
      location: { hostname: 'www.wikiloc.com', pathname: '/mountaineering-trails/aneto-105740853' },
      alert,
      fetch,
      atob,
      Uint8Array,
      setTimeout: () => 1,
      clearTimeout: () => undefined,
    });
    listeners.get('message')?.({ origin: 'https://trailreplay.example', source: app, data: { type: 'trailreplay:ready' } });

    expect(window.open).toHaveBeenCalledWith('https://trailreplay.example/?wikilocImport=1', '_blank');
    expect(decode).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
    expect(fetch).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
    expect(app.postMessage).toHaveBeenCalledOnce();
    const [payload, origin] = app.postMessage.mock.calls[0];
    expect(origin).toBe('https://trailreplay.example');
    expect(payload).toMatchObject({ type: 'trailreplay:wikiloc-gpx', fileName: 'wikiloc-105740853.gpx' });
    expect(payload.gpx).toContain('<name>Aneto &amp; Coronas</name>');
    expect(payload.gpx).toContain('<trkpt lat="42.631753" lon="0.646152"><ele>2912.9</ele><time>2024-01-01T00:00:00.000Z</time></trkpt>');
    expect(payload.gpx).toContain('<trkpt lat="42.6318" lon="0.6462"><ele>2914.1</ele><time>2024-01-01T00:00:02.000Z</time></trkpt>');
  });

  it('exports a Strava activity through the same bookmark', async () => {
    const source = decodeURIComponent(createRouteImportBookmarkletHref('https://trailreplay.example').slice('javascript:'.length));
    const app = { postMessage: vi.fn(), close: vi.fn() };
    const listeners = new Map<string, (event: unknown) => Promise<void> | void>();
    const gpx = '<gpx version="1.1"><trk><name>Run</name></trk></gpx>';
    const fetch = vi.fn(async () => ({ ok: true, text: async () => gpx }));
    const window = {
      open: vi.fn(() => app),
      addEventListener: vi.fn((name: string, listener: (event: unknown) => Promise<void> | void) => listeners.set(name, listener)),
      removeEventListener: vi.fn((name: string) => listeners.delete(name)),
    };

    runInNewContext(source, {
      window,
      location: { origin: 'https://www.strava.com', hostname: 'www.strava.com', pathname: '/activities/123456' },
      alert: vi.fn(),
      fetch,
      setTimeout: () => 1,
      clearTimeout: () => undefined,
    });
    await listeners.get('message')?.({ origin: 'https://trailreplay.example', source: app, data: { type: 'trailreplay:ready' } });

    expect(window.open).toHaveBeenCalledWith('https://trailreplay.example/?stravaImport=1', '_blank');
    expect(fetch).toHaveBeenCalledWith('https://www.strava.com/activities/123456/export_gpx', { credentials: 'include' });
    expect(app.postMessage).toHaveBeenCalledWith({ type: 'trailreplay:strava-gpx', fileName: 'strava-123456.gpx', gpx }, 'https://trailreplay.example');
  });
});
