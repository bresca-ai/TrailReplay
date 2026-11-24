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
    // Both loops start where the other one does not end, so a camera move is added between them by default; start without it.
    const { journeySegments, reorderJourneySegments } = useAppStore.getState();
    reorderJourneySegments(journeySegments.filter((segment) => segment.type === 'track'));
  });

  it('puts a camera transition between routes that do not join up', () => {
    useAppStore.getState().reset();
    for (const lon of [1, 1.2]) useAppStore.getState().addTrack(parseGPX(`<gpx><trk><trkseg><trkpt lat="42" lon="${lon}"/><trkpt lat="42" lon="${lon + 0.1}"/></trkseg></trk></gpx>`, `leg-${lon}.gpx`));
    expect(useAppStore.getState().journeySegments.map((segment) => segment.type === 'transport' ? segment.mode : 'track')).toEqual(['track', 'camera', 'track']);
  });
  afterEach(cleanup);

  it('creates a section card with route details and allows it to be managed as an annotation', () => {
    render(<JourneyPanel />);
    fireEvent.click(screen.getAllByRole('button', { name: /Add section annotation/ })[1]);
    const state = useAppStore.getState();
    expect(state.textAnnotations).toHaveLength(1);
    expect(state.textAnnotations[0]).toMatchObject({ routeSectionSegmentId: state.journeySegments[1].id, title: 'Valley walk', presentation: 'side-panel' });
    expect(state.textAnnotations[0].meta).toMatch(/km.*↑/);
    expect(screen.getByText('Section annotation added')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove section annotation' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Add section annotation/ })).toHaveLength(1);
    expect(screen.getByText('Valley walk · ' + state.textAnnotations[0].meta)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove section annotation' }));
    expect(useAppStore.getState().textAnnotations).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: /Add section annotation/ })).toHaveLength(2);
  });

  it('offers and enables a marker animation after a camera transition is removed', () => {
    const { tracks, journeySegments } = useAppStore.getState();
    useAppStore.getState().updateTrackIcon(tracks[0].id, '3d-runner');
    useAppStore.getState().updateTrackIcon(tracks[1].id, '3d-road-bike');
    render(<JourneyPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Add marker animation/ }));
    expect(useAppStore.getState().journeySegments[1]).toMatchObject({ markerTransitionFromSegmentId: journeySegments[0].id });
    expect(useAppStore.getState().settings.trailStyle.markerType).toBe('icon');
    expect(screen.getByRole('switch', { name: 'Animation' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('spinbutton', { name: 'Animation length in seconds' })).toBeInTheDocument();
    expect(screen.getByText('Marker animation')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add travel or camera transition/ })).toHaveAttribute('title', 'Adding travel replaces the marker animation at this boundary.');
    expect(screen.queryByRole('button', { name: /Add marker animation/ })).not.toBeInTheDocument();
  });

  it('compares already loaded routes and returns them to their original sequence', () => {
    const original = useAppStore.getState().journeySegments;
    render(<JourneyPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compare: Valley walk' }));
    expect(useAppStore.getState().tracks).toHaveLength(1);
    expect(useAppStore.getState().comparisonTracks).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Route' }));
    expect(useAppStore.getState().comparisonMode).toBe('route');
    const threshold = screen.getByRole('spinbutton', { name: 'Difference threshold (m)' });
    expect(threshold).toHaveValue(30);
    fireEvent.change(threshold, { target: { value: '75' } });
    expect(useAppStore.getState().comparisonThresholdMeters).toBe(75);
    expect(screen.getByText(/Whole differences exceeding 75 m/)).toBeInTheDocument();
    fireEvent.change(threshold, { target: { value: '3' } });
    fireEvent.blur(threshold);
    expect(threshold).toHaveValue(5);
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

  it('retains custom segment timing and all transport choices', () => {
    render(<JourneyPanel />);
    fireEvent.click(screen.getAllByRole('button', { name: '1:00' })[0]);
    fireEvent.change(screen.getByLabelText('Duration (seconds)'), { target: { value: '27' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(useAppStore.getState().journeySegments[0].duration).toBe(27_000);
    fireEvent.click(screen.getByRole('button', { name: /Add travel or camera transition/ }));
    for (const name of ['Driving', 'Bus', 'Train', 'Flying', 'Cycling', 'Walking', 'Ferry', 'Camera transition']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Cycling' }));
    expect(useAppStore.getState().journeySegments[1]).toMatchObject({ type: 'transport', mode: 'bike' });
    expect(screen.getByText('Cycling transition')).toBeInTheDocument();
  });
  it('adds an editable camera transition between routes', () => {
    render(<JourneyPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Add travel or camera transition/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Camera transition' }));
    expect(useAppStore.getState().journeySegments[1]).toMatchObject({ type: 'transport', mode: 'camera', duration: 3000, distance: 0 });
    expect(screen.getByText('Camera transition')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Camera settings'));
    fireEvent.change(screen.getByRole('slider', { name: /Transition zoom/ }), { target: { value: '6' } });
    fireEvent.change(screen.getByRole('slider', { name: /Transition tilt/ }), { target: { value: '25' } });
    expect(useAppStore.getState().journeySegments[1]).toMatchObject({ cameraTransitionZoom: 6, cameraTransitionPitch: 25 });
    // the Auto buttons hand both back to the distance-based defaults
    for (const button of screen.getAllByRole('button', { name: 'Auto' })) fireEvent.click(button);
    expect(useAppStore.getState().journeySegments[1]).toMatchObject({ cameraTransitionZoom: undefined, cameraTransitionPitch: undefined });
  });

});
