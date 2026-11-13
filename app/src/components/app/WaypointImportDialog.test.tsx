import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { parseGPX } from '@/utils/gpxParser';
import { useWaypointImportQueue } from '@/utils/gpx/waypointImportQueue';
import { WaypointImportDialog } from './WaypointImportDialog';

beforeEach(() => {
  useAppStore.getState().reset();
  useAppStore.getState().setSettings({ language: 'en' });
  useWaypointImportQueue.setState({ batches: [] });
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function prepare() {
  const track = parseGPX('<gpx><wpt lat="41" lon="2.005"><name>Aid station</name><desc>Water</desc></wpt><trk><trkseg><trkpt lat="41" lon="2"/><trkpt lat="41" lon="2.01"/></trkseg></trk></gpx>', 'trail.gpx');
  useAppStore.getState().addTrack(track);
  useWaypointImportQueue.getState().enqueue({ tracks: [track], groups: [] });
  render(<WaypointImportDialog />);
}

describe('waypoint import choice', () => {
  it.each([['Map caption', 'map-card'], ['Field note', 'side-panel']] as const)('imports waypoints as %s', (label, presentation) => {
    prepare();
    expect(screen.getByText(/1 named waypoints/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }));
    expect(useAppStore.getState().textAnnotations).toMatchObject([{ title: 'Aid station', subtitle: 'Water', presentation }]);
    expect(useAppStore.getState().userLandmarks).toHaveLength(0);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('discards waypoints while keeping the route', () => {
    prepare();
    fireEvent.click(screen.getByRole('button', { name: 'Discard waypoints' }));
    expect(useAppStore.getState().textAnnotations).toHaveLength(0);
    expect(useAppStore.getState().tracks).toHaveLength(1);
  });
});
