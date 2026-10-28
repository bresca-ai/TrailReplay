import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { parseGPX } from '@/utils/gpxParser';
import { ComparisonLeaderboard } from './ComparisonLeaderboard';
import { ComparisonLeaderboardSettings } from '@/components/sidebar/ComparisonLeaderboardSettings';
const track = (name: string, offset: string) => parseGPX(`<gpx><trk><name>${name}</name><trkseg><trkpt lat="42" lon="1"><time>2026-10-25T10:00:${offset}Z</time></trkpt><trkpt lat="42.01" lon="1.01"><time>2026-10-25T10:30:${offset}Z</time></trkpt></trkseg></trk></gpx>`, name);
const primary = track('Rider A', '00');
const secondary = track('Rider B', '30');
const comparison = { id: 'b', offset: 0, name: secondary.name, color: '#ef4444', visible: true, track: secondary };
function setup() {
  render(<div><ComparisonLeaderboard primaryTrack={primary} comparisonTracks={[comparison]} currentTime={new Date('2026-10-25T10:15:00Z')} /><ComparisonLeaderboardSettings /></div>);
  const board = screen.getByRole('group', { name: 'Live leaderboard' });
  board.getBoundingClientRect = () => new DOMRect(100, 50, 240, 100);
  board.parentElement!.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 600);
  return board;
}
beforeEach(() => {
  useAppStore.getState().reset();
  useAppStore.getState().setSettings({ language: 'en' });
  useAppStore.setState({ comparisonTracks: [comparison] });
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('customizable comparison leaderboard', () => {
  it('shares typography and supports a transparent background and hiding', () => {
    const board = setup();
    expect(board).toHaveTextContent('+30s');
    act(() => useAppStore.getState().setTrailStyle({ overlayFont: 'editorial' }));
    expect(board.style.fontFamily).toContain('Source Serif 4');
    fireEvent.click(screen.getByRole('button', { name: 'Transparent' }));
    expect(board).toHaveAttribute('data-leaderboard-background', 'transparent');
    fireEvent.click(screen.getByRole('switch', { name: 'Show leaderboard' }));
    expect(screen.queryByRole('group', { name: 'Live leaderboard' })).not.toBeInTheDocument();
  });
  it('moves from the visible position and keeps the box inside the map', () => {
    const board = setup();
    fireEvent.pointerDown(board, { clientX: 120, clientY: 60, button: 0 });
    fireEvent.pointerMove(board, { clientX: 320, clientY: 180 });
    expect(useAppStore.getState().settings.leaderboardPosition).toEqual({ x: 300 / 760, y: 170 / 500 });
    fireEvent.pointerMove(board, { clientX: 2000, clientY: 2000 });
    expect(useAppStore.getState().settings.leaderboardPosition).toEqual({ x: 1, y: 1 });
    fireEvent.pointerUp(board);
    fireEvent.pointerMove(board, { clientX: 0, clientY: 0 });
    expect(useAppStore.getState().settings.leaderboardPosition?.x).toBe(1);
  });
  it('resizes with its corner and resets placement and scale', () => {
    const board = setup();
    fireEvent.pointerDown(screen.getByLabelText('Resize leaderboard'), { clientX: 340, clientY: 150, button: 0 });
    fireEvent.pointerMove(board, { clientX: 460, clientY: 200 });
    fireEvent.pointerUp(board);
    expect(useAppStore.getState().settings.leaderboardScale).toBe(1.5);
    expect(board.style.transform).toContain('scale(1.5)');
    fireEvent.click(screen.getByRole('button', { name: 'Reset position and size' }));
    expect(useAppStore.getState().settings).toMatchObject({ leaderboardPosition: null, leaderboardScale: 1 });
  });
});
