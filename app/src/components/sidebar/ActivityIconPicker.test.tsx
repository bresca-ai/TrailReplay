import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ActivityIconPicker } from './ActivityIconPicker';

vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ language: 'en', t: (key: string) => key }) }));
vi.mock('./Marker3DPreview', () => ({ Marker3DPreview: ({ value }: { value: string }) => <div data-testid="3d-preview">{value}</div> }));
afterEach(cleanup);

describe('character picker', () => {
  it('renders the dialog outside the sidebar stacking context', () => {
    const view = render(<ActivityIconPicker value="svg-walking" color="#c1652f" onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog').parentElement).toBe(document.body);
    expect(view.container.contains(screen.getByRole('dialog'))).toBe(false);
  });

  it('previews a model and applies it only after confirmation', () => {
    const onSelect = vi.fn(), onClose = vi.fn();
    render(<ActivityIconPicker value="svg-walking" color="#c1652f" onSelect={onSelect} onClose={onClose} />);
    fireEvent.click(screen.getByRole('tab', { name: '3D' }));
    expect(screen.getByTestId('3d-preview').textContent).toBe('3d-runner');
    expect(screen.getByRole('button', { name: 'Runner' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByTestId('3d-preview').textContent).toBe('3d-road-runner');
    expect(screen.getByRole('button', { name: 'Road runner' })).toBeTruthy();
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use marker' }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('3d-road-runner');
  });
  it('lets an arbitrary emoji be previewed without applying it on cancel', () => {
    const onSelect = vi.fn(), onClose = vi.fn();
    render(<ActivityIconPicker value="svg-walking" color="#c1652f" onSelect={onSelect} onClose={onClose} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Emojis' }));
    fireEvent.change(screen.getByLabelText('Enter or paste any emoji'), { target: { value: '🦊' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use emoji' }));
    expect(screen.getByRole('button', { name: '🦊' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getAllByRole('button', { name: 'common.cancel' }).at(-1)!);
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
