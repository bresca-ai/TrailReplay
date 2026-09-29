import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReplayComposition } from './replayComposition';
import { VideoCompositionEditor } from './VideoCompositionEditor';

afterEach(cleanup);

describe('VideoCompositionEditor', () => {
  it('renders presets and lets every composition element be removed and re-added', () => {
    const onChange = vi.fn();
    render(<VideoCompositionEditor open onClose={vi.fn()} currentAspectRatio="9:16" composition={createReplayComposition('reel')} onChange={onChange} journeyTitle="Alpine loop" visibleStatIds={['distance']} />);
    expect(screen.getByRole('dialog', { name: 'Video composition editor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Action + map' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Map' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Delete Attribution' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '+ Map' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Map' }));
    expect(onChange).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '+ Title' }));
    expect(onChange).toHaveBeenCalled();
  });

  it('applies the action-map preset and exposes the complete video controls', () => {
    let composition = createReplayComposition('classic');
    const onChange = vi.fn((next) => { composition = next; });
    const { rerender } = render(<VideoCompositionEditor open onClose={vi.fn()} currentAspectRatio="9:16" composition={composition} onChange={onChange} availableVideoAnnotations={[{ id: 'clip-1', label: 'Helmet cam', source: 'blob:clip' }]} visibleStatIds={['distance', 'duration']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Action + map' }));
    rerender(<VideoCompositionEditor open onClose={vi.fn()} currentAspectRatio="9:16" composition={composition} onChange={onChange} availableVideoAnnotations={[{ id: 'clip-1', label: 'Helmet cam', source: 'blob:clip' }]} visibleStatIds={['distance', 'duration']} />);
    expect(screen.getByLabelText('Action video block')).toBeInTheDocument();
    expect(screen.getByText('Sync')).toBeInTheDocument();
    expect(screen.getByText('Trim start')).toBeInTheDocument();
    expect(screen.getByText('Trim end')).toBeInTheDocument();
  });

  it('removes and adds optional blocks while keeping aspect layouts isolated', () => {
    let composition = createReplayComposition('reel');
    const originalLandscape = composition.layouts['16:9'];
    const onChange = vi.fn((next) => { composition = next; });
    const props = () => ({ open: true, onClose: vi.fn(), currentAspectRatio: '9:16' as const, composition, onChange, visibleStatIds: ['distance'] });
    const { rerender } = render(<VideoCompositionEditor {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Stats' }));
    rerender(<VideoCompositionEditor {...props()} />);
    expect(screen.queryByRole('button', { name: 'Delete Stats' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ Stats' }));
    expect(onChange).toHaveBeenCalled();
    expect(composition.layouts['16:9']).toEqual(originalLandscape);
  });
});
