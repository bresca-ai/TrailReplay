import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { parseGPX } from '@/utils/gpxParser';
import { PendingPicturePlacementBanner } from './PendingPicturePlacementBanner';

const initial = useAppStore.getState();
afterEach(() => { cleanup(); useAppStore.setState(initial, true); });

it('places only selected media by coordinates and keeps the rest inactive', () => {
  const track = parseGPX('<?xml version="1.0"?><gpx version="1.1"><trk><trkseg><trkpt lat="42" lon="2"/><trkpt lat="42.1" lon="2"/></trkseg></trk></gpx>', 'route.gpx');
  useAppStore.setState((state) => {
    state.settings.language = 'en';
    state.tracks = [track];
    state.activeTrackId = track.id;
    state.journeySegments = [{ id: 'segment', type: 'track', trackId: track.id, duration: 60000 }];
  });
  for (const [id, mediaKind] of [['one', 'picture'], ['two', 'video']] as const) {
    useAppStore.getState().queuePendingPicturePlacement({ id, mediaKind, file: new File([''], `${id}.jpg`), url: 'blob:test', displayDuration: 3000, placementReason: 'missing-gps' });
  }
  render(<PendingPicturePlacementBanner />);
  expect((screen.getByLabelText('Select all') as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByLabelText('Select one.jpg'));
  fireEvent.change(screen.getByLabelText('Latitude, longitude'), { target: { value: '42.05, 2' } });
  fireEvent.click(screen.getByRole('button', { name: /^Place$/ }));
  expect(useAppStore.getState().pictures).toHaveLength(1);
  expect(useAppStore.getState().pictures[0].routeSegmentId).toBe('segment');
  expect(useAppStore.getState().pictures[0].progress).toBeCloseTo(0.5, 2);
  expect(useAppStore.getState().pendingPicturePlacements.map((item) => item.id)).toEqual(['two']);
  expect(useAppStore.getState().videos).toHaveLength(0);
});

it('rejects invalid coordinates without removing the pending item', () => {
  useAppStore.getState().queuePendingPicturePlacement({ id: 'one', file: new File([''], 'one.jpg'), url: 'blob:test', displayDuration: 3000, placementReason: 'missing-gps' });
  render(<PendingPicturePlacementBanner />);
  fireEvent.click(screen.getByLabelText('Select one.jpg'));
  fireEvent.change(screen.getByLabelText('Latitude, longitude'), { target: { value: '200, 2' } });
  fireEvent.click(screen.getByRole('button', { name: /^Place$/ }));
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(useAppStore.getState().pendingPicturePlacements).toHaveLength(1);
});

it('drags only the chosen unselected photo without selecting the whole queue', () => {
  for (const id of ['one', 'two']) useAppStore.getState().queuePendingPicturePlacement({ id, file: new File([''], `${id}.jpg`), url: 'blob:test', displayDuration: 3000, placementReason: 'missing-gps' });
  render(<PendingPicturePlacementBanner />);
  const row = screen.getByLabelText('Select one.jpg').parentElement!;
  const data: Record<string, string> = {};
  fireEvent.dragStart(row, { dataTransfer: { setData: (type: string, value: string) => { data[type] = value; }, effectAllowed: '' } });
  expect(JSON.parse(data['application/x-trailreplay-pending-media'])).toEqual(['one']);
  expect(useAppStore.getState().selectedPendingMediaIds).toEqual([]);
});
