import { act, cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useAppStore } from '@/store/useAppStore';
import { mapGlobalRef } from '@/utils/mapRef';
import { parseGPX } from '@/utils/gpxParser';
import { MediaTimeline } from './MediaTimeline';

const markerCalls = vi.hoisted(() => ({ position: vi.fn(), remove: vi.fn() }));
vi.mock('maplibre-gl', () => ({ Marker: class {
  setLngLat(value: number[]) { markerCalls.position(value); return this; }
  addTo() { return this; }
  remove() { markerCalls.remove(); }
} }));
const initial = useAppStore.getState();
afterEach(() => { cleanup(); mapGlobalRef.current = null; useAppStore.setState(initial, true); vi.clearAllMocks(); });
it('previews the dragged photo on the map without changing its saved position until release', () => {
  const track = parseGPX('<?xml version="1.0"?><gpx version="1.1"><trk><trkseg><trkpt lat="42" lon="2"/><trkpt lat="42.1" lon="2"/></trkseg></trk></gpx>', 'route.gpx');
  mapGlobalRef.current = { project: () => ({ x: 100, y: 100 }), getCanvas: () => ({ clientWidth: 800, clientHeight: 600 }) } as unknown as MapLibreMap;
  useAppStore.setState((state) => {
    state.settings.language = 'en'; state.tracks = [track]; state.journeySegments = [{ id: 'route', type: 'track', trackId: track.id, duration: 60000 }]; state.playback.routeTimingMode = 'uniform'; state.playback.totalDuration = 60000;
    state.pictures = [{ id: 'a', file: null, originalFileName: 'a.jpg', url: '', isPlaceholder: true, progress: 0.2, position: 0.2, displayDuration: 3000 }];
  });
  render(<MediaTimeline />);
  const lane = screen.getByLabelText('Media timeline drop area');
  vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 400, width: 400, top: 0, bottom: 64, height: 64, x: 0, y: 0, toJSON: () => ({}) });
  const marker = screen.getByRole('button', { name: /a.jpg, at 20%/ });
  Object.defineProperty(marker, 'setPointerCapture', { value: vi.fn() });
  const down = createEvent.pointerDown(marker); Object.defineProperties(down, { clientX: { value: 100 }, button: { value: 0 } }); fireEvent(marker, down);
  const move = createEvent.pointerMove(marker); Object.defineProperty(move, 'clientX', { value: 140 }); fireEvent(marker, move);
  expect(markerCalls.position).toHaveBeenCalled();
  expect(useAppStore.getState().pictures[0].progress).toBe(0.2);
  act(() => fireEvent.pointerCancel(marker));
  expect(markerCalls.remove).toHaveBeenCalled();
  expect(useAppStore.getState().pictures[0].progress).toBe(0.2);
});
