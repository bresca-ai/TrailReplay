import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { createTrimTestTrack } from '@/test/fixtures/trimTrack';
import { parseGPX } from '@/utils/gpxParser';
import { TrackTrimControls } from './TrackTrimControls';

function Harness() {
  const tracks = useAppStore((state) => state.tracks);
  return tracks.map((track) => <TrackTrimControls key={track.id} track={track} unitSystem="metric" />);
}

beforeEach(() => {
  useAppStore.getState().reset();
  useAppStore.getState().setSettings({ language: 'en' });
  useAppStore.getState().addTrack(createTrimTestTrack());
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('route trim controls with the real range slider', () => {
  it('drags both handles along the recording time axis using pointer events', () => {
    vi.stubGlobal('PointerEvent', class extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    });
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Trim route' }));
    const start = screen.getByRole('slider', { name: 'Start' });
    const end = screen.getByRole('slider', { name: 'End' });
    const slider = start.closest('[data-slot="slider"]')!;
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 120, 40));
    for (const [handle, from, to] of [[start, 0, 40], [end, 120, 100]] as const) {
      let captured = false;
      Object.defineProperties(handle, {
        setPointerCapture: { value: () => { captured = true; } },
        hasPointerCapture: { value: () => captured },
        releasePointerCapture: { value: () => { captured = false; } },
      });
      fireEvent.pointerDown(handle, { pointerId: 1, clientX: from });
      fireEvent.pointerMove(handle, { pointerId: 1, clientX: to });
      fireEvent.pointerUp(handle, { pointerId: 1, clientX: to });
    }
    // At 40s the recording is on point 2, not one third of the point array.
    expect(useAppStore.getState().trackTrimPreview).toMatchObject({ startIndex: 2, endIndex: 4 });
    expect(screen.getByRole('status')).toHaveTextContent('3 points retained');
    expect(useAppStore.getState().tracks[0].points).toHaveLength(6);
  });

  it('selects both boundaries by keyboard, downloads the selection, applies and restores it', async () => {
    const original = useAppStore.getState().tracks[0];
    let downloaded: Blob | undefined;
    const createObjectURL = vi.fn((blob: Blob) => { downloaded = blob; return 'blob:trimmed'; });
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Trim route' }));
    expect(screen.getByRole('button', { name: 'Apply to route' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Start' }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('slider', { name: 'End' }), { key: 'ArrowLeft' });
    expect(useAppStore.getState().trackTrimPreview).toEqual({ trackId: original.id, startIndex: 1, endIndex: 4 });
    expect(screen.getByRole('status')).toHaveTextContent('4 points retained');
    expect(useAppStore.getState().tracks[0]).toBe(original);

    fireEvent.click(screen.getByRole('button', { name: 'Download GPX' }));
    expect(click).toHaveBeenCalledOnce();
    expect(click.mock.instances[0]).toHaveProperty('download', 'Mountain loop-trimmed.gpx');
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(downloaded!);
    });
    const exported = parseGPX(text, 'trimmed.gpx');
    expect(exported.points).toHaveLength(4);
    expect(exported.points[0].time).toEqual(original.points[1].time);
    expect(exported.points[3].time).toEqual(original.points[4].time);

    fireEvent.click(screen.getByRole('button', { name: 'Apply to route' }));
    expect(useAppStore.getState().tracks[0].points).toHaveLength(4);
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore original' }));
    expect(useAppStore.getState().tracks[0].points).toEqual(original.points);
  });

  it('cancels a draft and removes the map overlay when the editor unmounts', () => {
    const original = useAppStore.getState().tracks[0];
    const view = render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Trim route' }));
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Start' }), { key: 'ArrowRight' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(useAppStore.getState().trackTrimPreview).toBeNull();
    expect(useAppStore.getState().tracks[0]).toBe(original);
    fireEvent.click(screen.getByRole('button', { name: 'Trim route' }));
    view.unmount();
    expect(useAppStore.getState().trackTrimPreview).toBeNull();
  });

  it('shows the distance fallback and constrains the handles to at least two points', () => {
    const track = createTrimTestTrack();
    track.points.forEach((point) => { point.time = null; });
    useAppStore.getState().reset();
    useAppStore.getState().addTrack(track);
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Trim route' }));
    expect(screen.getByText(/Recording times are missing/)).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Start' }), { key: 'End' });
    expect(useAppStore.getState().trackTrimPreview).toMatchObject({ startIndex: 4, endIndex: 5 });
    fireEvent.keyDown(screen.getByRole('slider', { name: 'End' }), { key: 'Home' });
    expect(useAppStore.getState().trackTrimPreview).toMatchObject({ startIndex: 4, endIndex: 5 });
  });

  it('can download with comparison content, but prevents applying a crop to it', () => {
    render(<Harness />);
    act(() => useAppStore.getState().addComparisonTrack({ id: 'other', name: 'Other', color: '#ffffff', track: createTrimTestTrack(), visible: true, offset: 0 }));
    fireEvent.click(screen.getByRole('button', { name: 'Trim route' }));
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Start' }), { key: 'ArrowRight' });
    expect(screen.getByText(/This replay has media/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply to route' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download GPX' })).toBeEnabled();
  });
});
