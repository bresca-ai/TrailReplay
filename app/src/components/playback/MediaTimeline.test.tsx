import { act, cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { parseGPX } from '@/utils/gpxParser';
import { PENDING_MEDIA_DRAG_TYPE } from '@/utils/pendingMediaPlacement';
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
  expect(picture.progress).toBeCloseTo(0.26);
  expect(picture.position).toBeCloseTo(0.26);
  expect(picture.lat).toBeCloseTo(42.026, 3);
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
