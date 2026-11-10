import { act, cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { parseGPX } from '@/utils/gpxParser';
import { PENDING_MEDIA_DRAG_TYPE } from '@/utils/pendingMediaPlacement';
import { setMediaHoldClock } from '@/utils/mediaHoldClock';
import { MediaTimeline } from './MediaTimeline';

const initial = useAppStore.getState();
afterEach(() => { cleanup(); useAppStore.setState(initial, true); });
function setup() {
  const track = parseGPX('<?xml version="1.0"?><gpx version="1.1"><trk><trkseg><trkpt lat="42" lon="2"/><trkpt lat="42.1" lon="2"/></trkseg></trk></gpx>', 'route.gpx');
  useAppStore.setState((state) => {
    state.settings.language = 'en';
    state.tracks = [track];
    state.journeySegments = [{ id: 'route', type: 'track', trackId: track.id, duration: 60000 }];
    state.playback.routeTimingMode = 'uniform';
    state.playback.totalDuration = 60000;
  });
  render(<MediaTimeline />);
  const lane = screen.getByLabelText('Media timeline drop area');
  vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue({ left: 100, width: 400, right: 500, top: 0, bottom: 56, height: 56, x: 100, y: 0, toJSON: () => ({}) });
  return lane;
}

it('drops pending media in the lane and moves its marker and route anchor', () => {
  const lane = setup();
  useAppStore.getState().queuePendingPicturePlacement({ id: 'photo', file: new File([''], 'photo.jpg'), url: 'blob:photo', displayDuration: 3000, placementReason: 'missing-gps' });
  const drop = createEvent.drop(lane, { dataTransfer: { getData: (type: string) => type === PENDING_MEDIA_DRAG_TYPE ? '["photo"]' : '' } });
  Object.defineProperty(drop, 'clientX', { value: 200 });
  fireEvent(lane, drop);
  expect(useAppStore.getState().pictures[0].progress).toBeCloseTo(0.25);
  const marker = screen.getByRole('button', { name: /photo.jpg, at 25%/ });
  fireEvent.keyDown(marker, { key: 'ArrowRight' });
  const picture = useAppStore.getState().pictures[0];
  expect(picture.progress).toBeCloseTo(0.2667, 3);
  expect(picture.position).toBeCloseTo(0.2667, 3);
  expect(picture.lat).toBeCloseTo(42.02667, 3);
  expect(picture.routeSegmentId).toBe('route');
});

it('offers every overlapping item in the selector and moves the chosen one to the playhead', () => {
  setup();
  act(() => useAppStore.setState((state) => {
    state.playback.progress = 0.8;
    state.pictures = ['a', 'b'].map((id) => ({ id, file: null, originalFileName: `${id}.jpg`, url: '', isPlaceholder: true, progress: 0.2, position: 0.2, displayDuration: 3000 }));
  }));
  fireEvent.change(screen.getByLabelText('Select a media item'), { target: { value: 'picture:b' } });
  fireEvent.click(screen.getByRole('button', { name: 'Place at playhead' }));
  expect(useAppStore.getState().pictures[0].progress).toBe(0.2);
  expect(useAppStore.getState().pictures[1].progress).toBeCloseTo(0.8);
});


it('resizes the photo duration without moving its route position', () => {
  setup();
  act(() => useAppStore.setState((state) => {
    state.pictures = [{ id: 'a', file: null, originalFileName: 'a.jpg', url: '', isPlaceholder: true, progress: 0.2, position: 0.2, displayDuration: 3000 }];
  }));
  fireEvent.keyDown(screen.getByLabelText('Adjust end of a.jpg'), { key: 'ArrowRight' });
  expect(useAppStore.getState().pictures[0].displayDuration).toBe(3500);
  expect(useAppStore.getState().pictures[0].progress).toBe(0.2);
});

it('resizes a photo by dragging its right edge in seconds', () => {
  setup();
  act(() => useAppStore.setState((state) => {
    state.pictures = [{ id: 'a', file: null, originalFileName: 'a.jpg', url: '', isPlaceholder: true, progress: 0.2, position: 0.2, displayDuration: 3000 }];
  }));
  const handle = screen.getByLabelText('Adjust end of a.jpg');
  Object.defineProperty(handle, 'setPointerCapture', { value: vi.fn() });
  const down = createEvent.pointerDown(handle, { button: 0, pointerId: 1 });
  Object.defineProperty(down, 'clientX', { value: 100 });
  Object.defineProperty(down, 'button', { value: 0 });
  fireEvent(handle, down);
  const up = createEvent.pointerUp(handle, { pointerId: 1 });
  Object.defineProperty(up, 'clientX', { value: 140 });
  fireEvent(handle, up);
  expect(useAppStore.getState().pictures[0].displayDuration).toBeCloseTo(9300, 0);
});

it('moves an existing photo dragged from the media panel', () => {
  const lane = setup();
  act(() => useAppStore.setState((state) => {
    state.pictures = [{ id: 'a', file: null, originalFileName: 'a.jpg', url: '', isPlaceholder: true, progress: 0.2, position: 0.2, displayDuration: 3000 }];
  }));
  const drop = createEvent.drop(lane, { dataTransfer: { getData: (type: string) => type === 'application/x-trailreplay-placed-media' ? '{"kind":"picture","id":"a"}' : '' } });
  Object.defineProperty(drop, 'clientX', { value: 300 });
  fireEvent(lane, drop);
  expect(useAppStore.getState().pictures[0].progress).toBeCloseTo(0.525, 3);
  expect(useAppStore.getState().pictures[0].routeSegmentId).toBe('route');
});

it('moves the playhead through the current media hold and displays annotations', () => {
  setup();
  act(() => useAppStore.setState((state) => {
    state.pictures = [{ id: 'a', file: null, originalFileName: 'a.jpg', url: '', isPlaceholder: true, progress: 0.2, position: 0.2, displayDuration: 4000 }];
    state.textAnnotations = [{ id: 'note', title: 'Summit', lat: 42, lon: 2, progress: 0.5, color: '#345', displayDuration: 3000 }];
  }));
  expect(screen.getByRole('button', { name: 'Annotation: Summit' })).toBeTruthy();
  expect(screen.getByText('0:01')).toBeTruthy();
  const lane = screen.getByLabelText('Media timeline drop area');
  const line = lane.firstElementChild as HTMLElement;
  expect(parseFloat(line.style.left)).toBeCloseTo(0);
  act(() => setMediaHoldClock({ kind: 'picture', id: 'a', elapsedMs: 2000 }));
  expect(parseFloat(line.style.left)).toBeCloseTo(14 / 64 * 100);
  act(() => setMediaHoldClock(null));
});
