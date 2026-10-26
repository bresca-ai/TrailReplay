import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { parseGPX } from '@/utils/gpxParser';
import { JourneyPanel } from './JourneyPanel';

describe('Timeline editor', () => {
  beforeEach(() => {
    useAppStore.getState().reset();
    useAppStore.getState().setSettings({ language: 'en' });
    for (const name of ['Ridge ride', 'Valley walk']) {
      const track = parseGPX(`<gpx><trk><name>${name}</name><trkseg><trkpt lat="42" lon="1"><ele>100</ele><time>2026-10-25T10:00:00Z</time></trkpt><trkpt lat="42.01" lon="1.01"><ele>200</ele><time>2026-10-25T10:30:00Z</time></trkpt></trkseg></trk></gpx>`, `${name}.gpx`);
      useAppStore.getState().addTrack(track);
    }
  });
  afterEach(cleanup);

  it('compares already loaded routes and returns them to their original sequence', () => {
    const original = useAppStore.getState().journeySegments;
    render(<JourneyPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compare: Valley walk' }));
    expect(useAppStore.getState().tracks).toHaveLength(1);
    expect(useAppStore.getState().comparisonTracks).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Route' }));
    expect(useAppStore.getState().comparisonMode).toBe('route');
    fireEvent.change(screen.getByLabelText('Slow down at differences'), { target: { value: '0.1' } });
    expect(useAppStore.getState().comparisonSlowdown).toBe(0.1);
    fireEvent.click(screen.getByRole('button', { name: 'Return all to sequence' }));
    expect(useAppStore.getState().comparisonTracks).toEqual([]);
    expect(useAppStore.getState().journeySegments).toEqual(original);
    expect(screen.getByRole('button', { name: 'In sequence' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('explains why Time is unavailable and selects Route for an untimed shared track', () => {
    const second = useAppStore.getState().tracks[1];
    useAppStore.getState().removeTrack(second.id);
    useAppStore.getState().addTrack(parseGPX('<gpx><trk><name>Valley walk</name><trkseg><trkpt lat="42" lon="1"/><trkpt lat="42.01" lon="1.01"/></trkseg></trk></gpx>', 'untimed.gpx'));
    render(<JourneyPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compare: Valley walk' }));
    expect(useAppStore.getState().comparisonMode).toBe('route');
    expect(screen.getByRole('alert')).toHaveTextContent('Time comparison is unavailable');
    const time = screen.getByRole('button', { name: 'Time' });
    expect(time).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(time);
    expect(useAppStore.getState().comparisonMode).toBe('route');
  });

  it('explains why Route is unavailable for tracks with no common points', () => {
    const second = useAppStore.getState().tracks[1];
    useAppStore.getState().removeTrack(second.id);
    useAppStore.getState().addTrack(parseGPX('<gpx><trk><name>Valley walk</name><trkseg><trkpt lat="43" lon="2"><time>2026-10-25T10:00:00Z</time></trkpt><trkpt lat="43.01" lon="2.01"><time>2026-10-25T10:30:00Z</time></trkpt></trkseg></trk></gpx>', 'distant.gpx'));
    render(<JourneyPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compare: Valley walk' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Route comparison is unavailable');
    const route = screen.getByRole('button', { name: 'Route' });
    expect(route).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(route);
    expect(useAppStore.getState().comparisonMode).toBe('time');
  });

  it('retains custom segment timing and all seven transport choices', () => {
    render(<JourneyPanel />);
    fireEvent.click(screen.getAllByRole('button', { name: '1:00' })[0]);
    fireEvent.change(screen.getByLabelText('Duration (seconds)'), { target: { value: '27' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(useAppStore.getState().journeySegments[0].duration).toBe(27_000);
    fireEvent.click(screen.getByRole('button', { name: 'Add Transport' }));
    for (const name of ['Driving', 'Bus', 'Train', 'Flying', 'Cycling', 'Walking', 'Ferry']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Cycling' }));
    expect(useAppStore.getState().journeySegments[1]).toMatchObject({ type: 'transport', mode: 'bike' });
    expect(screen.getByText('Cycling Transport')).toBeInTheDocument();
  });
});
